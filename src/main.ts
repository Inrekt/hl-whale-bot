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
import { mskDay, pointFrom, recordPoint } from './history.js'
import { coinSkews, skewPercent } from './scan.js'
import { alertText } from './texts.js'

const WATCH_INTERVAL_MS = 45_000
const MIN_WATCH_POSITION_USD = 10_000
const MARKET_TICK_MS = 4 * 60_000
/** Как часто отмечаться живым. Реже, чем тик: каждая отметка — коммит в репозиторий. */
const HEARTBEAT_INTERVAL_MS = 20 * 60_000
/** Насколько должен сдвинуться перекос, чтобы дёрнуть человека. Ниже — шум. */
const ALERT_MOVE_POINTS = 25
/** Монеты мельче этой книги дают громкие проценты на пустом месте. */
const ALERT_MIN_BOOK_USD = 20_000_000
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
        const message = alertText(address, event, state.whaleNames)
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

/**
 * Раз в сутки фиксируем точку отсчёта, а между тиками смотрим, не развернулся
 * ли перекос по крупным монетам: смена стороны или скачок на четверть шкалы —
 * это и есть новость, ради которой бота держат.
 */
async function marketTick(): Promise<void> {
  if (!snapshots.isReady()) return
  const snapshot = snapshots.current()
  const now = new Date()
  const today = mskDay(now)
  const before = state.history.length
  state.history = recordPoint(state.history, pointFrom(snapshot, today))

  // Пульс: сторож в .github/workflows/watchdog.yml сверяет его возраст и, если
  // бот замолчал, поднимает смену заново и пишет владельцу.
  const beatAge = now.getTime() - Date.parse(state.heartbeat || '1970-01-01T00:00:00Z')
  const beat = Number.isNaN(beatAge) || beatAge >= HEARTBEAT_INTERVAL_MS
  if (beat) state.heartbeat = now.toISOString()

  const messages: string[] = []
  for (const { coin, longUsd, shortUsd } of coinSkews(snapshot)) {
    if (longUsd + shortUsd < ALERT_MIN_BOOK_USD) continue
    const skew = skewPercent(longUsd, shortUsd)
    const known = state.alerted[coin]
    if (known === undefined) {
      state.alerted = { ...state.alerted, [coin]: skew }
      continue
    }
    const flipped = Math.sign(known) !== Math.sign(skew) && Math.abs(skew) >= 10
    const jumped = Math.abs(skew - known) >= ALERT_MOVE_POINTS
    if (!flipped && !jumped) continue
    state.alerted = { ...state.alerted, [coin]: skew }
    const side = skew >= 0 ? 'ШОРТ' : 'ЛОНГ'
    messages.push(
      flipped
        ? `🔄 ${coin}: киты развернулись — теперь ${side} ${Math.abs(skew)}% (было ${Math.abs(known)}% в другую сторону)`
        : `⚡️ ${coin}: перекос ${side} ${Math.abs(skew)}% (был ${Math.abs(known)}%)`,
    )
  }

  for (const message of messages) {
    for (const chatId of state.subscribers) {
      await bot.api.sendMessage(chatId, message).catch((error) => {
        console.error(`market alert to ${chatId} failed:`, error instanceof Error ? error.message : error)
      })
    }
  }
  if (messages.length > 0 || beat || state.history.length !== before) await persist()
}

// Скан китов не блокирует запуск: пока данных нет, экраны отвечают NOT_READY,
// иначе бот был бы глухим всю первую минуту после каждой пересменки.
console.log('launching bot; first whale scan runs in background…')
void snapshots.start().then(
  () => console.log('snapshot ready'),
  (error) => console.error('initial snapshot failed:', error),
)

const watchTimer = setInterval(() => void watchTick(), WATCH_INTERVAL_MS)
const marketTimer = setInterval(() => void marketTick(), MARKET_TICK_MS)

async function shutdown(reason: string): Promise<void> {
  console.log(`shutting down: ${reason}`)
  clearInterval(watchTimer)
  clearInterval(marketTimer)
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

/**
 * Telegram отдаёт getUpdates только одному потребителю: любой посторонний вызов
 * (второй инстанс, отладочный curl) обрывает опрос бота ошибкой 409, и grammY
 * считает её фатальной. Одиночный чужой запрос не должен ронять смену на часы,
 * поэтому на 409 переподключаемся с нарастающей паузой.
 */
const CONFLICT_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 120_000]

function isConflictError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { error_code?: number }).error_code === 409
}

for (let attempt = 0; ; attempt += 1) {
  try {
    await bot.start({
      onStart: (info) => console.log(`long-poll started as @${info.username}`),
    })
    break
  } catch (error) {
    const delay = CONFLICT_RETRY_DELAYS_MS[attempt]
    if (!isConflictError(error) || delay === undefined) throw error
    console.error(`getUpdates conflict — другой потребитель; повтор через ${delay / 1000}с`)
    await bot.stop().catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}
