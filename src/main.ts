// Entry point: long-poll bot + snapshot refresh loop + whale-watch alert loop.
// --max-runtime-minutes N makes the process exit cleanly for Actions job chaining.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createBot } from './bot.js'
import { fetchPositions } from './hl.js'
import { loadState, saveState, toStoredPositions } from './state.js'
import { SnapshotService } from './snapshot.js'
import { closeBrowser } from './render/render.js'
import { diffPositions } from './watch.js'
import { alertText } from './texts.js'

const WATCH_INTERVAL_MS = 45_000
const MIN_WATCH_POSITION_USD = 10_000
const execFileAsync = promisify(execFile)

try {
  process.loadEnvFile('.env')
} catch {
  // no .env — rely on the environment (CI)
}

const token = process.env.BOT_TOKEN
if (!token) {
  console.error('BOT_TOKEN is not set (put it in .env locally or in Actions secrets)')
  process.exit(1)
}

const runtimeArgIndex = process.argv.indexOf('--max-runtime-minutes')
const maxRuntimeMinutes = runtimeArgIndex === -1 ? null : Number(process.argv[runtimeArgIndex + 1])

const state = await loadState()
let persistQueue: Promise<void> = Promise.resolve()

function persist(): Promise<void> {
  persistQueue = persistQueue.then(async () => {
    await saveState(state)
    await pushStateToGit()
  })
  return persistQueue
}

async function pushStateToGit(): Promise<void> {
  if (process.env.STATE_GIT !== '1') return
  try {
    await execFileAsync('bash', ['scripts/push-state.sh'])
  } catch (error) {
    console.error('state push failed:', error instanceof Error ? error.message : error)
  }
}

const snapshots = new SnapshotService()
const bot = createBot(token, { snapshots, state, persist })

/** Every tick: diff tracked wallets' positions, alert their watchers. */
async function watchTick(): Promise<void> {
  const watchedAddresses = [...new Set(Object.values(state.watchlists).flat().map((a) => a.toLowerCase()))]
  let stateChanged = false
  for (const address of watchedAddresses) {
    try {
      const positions = (await fetchPositions(address)).filter((p) => p.sizeUsd >= MIN_WATCH_POSITION_USD)
      const current = toStoredPositions(positions)
      const previous = state.watchPositions[address]
      state.watchPositions = { ...state.watchPositions, [address]: current }
      stateChanged = true
      if (previous === undefined) continue // first observation — baseline only
      for (const event of diffPositions(previous, current)) {
        const message = alertText(address, event)
        for (const [chatId, list] of Object.entries(state.watchlists)) {
          if (!list.some((a) => a.toLowerCase() === address)) continue
          await bot.api.sendMessage(Number(chatId), message).catch((error) => {
            console.error(`alert to ${chatId} failed:`, error instanceof Error ? error.message : error)
          })
        }
      }
    } catch (error) {
      console.error(`watch ${address} failed:`, error instanceof Error ? error.message : error)
    }
  }
  if (stateChanged) await persist()
}

// Скан китов не блокирует запуск: в облаке он занимает 10-15 минут, и всё это
// время бот был бы глухим. Пока данных нет, экраны отвечают texts.NOT_READY.
console.log('launching bot; first whale scan runs in background…')
void snapshots.start().then(
  () => console.log('snapshot ready'),
  (error) => console.error('initial snapshot failed:', error),
)

const watchTimer = setInterval(() => void watchTick(), WATCH_INTERVAL_MS)

async function shutdown(reason: string): Promise<void> {
  console.log(`shutting down: ${reason}`)
  clearInterval(watchTimer)
  snapshots.stop()
  await bot.stop().catch(() => undefined)
  await persistQueue
  await closeBrowser().catch(() => undefined)
  process.exit(0)
}

if (maxRuntimeMinutes !== null && Number.isFinite(maxRuntimeMinutes)) {
  setTimeout(() => void shutdown(`max runtime ${maxRuntimeMinutes}m reached`), maxRuntimeMinutes * 60_000)
}
process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

await bot.start({
  onStart: (info) => console.log(`long-poll started as @${info.username}`),
})
