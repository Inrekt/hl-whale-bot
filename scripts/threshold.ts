// Сетка юниверсов по порогу/топу размера счёта: один скан всех кошельков ≥ $3M,
// дамп в samples/scan-dump.json, оценка агрегатов по каждому варианту.
// Usage: npx tsx scripts/threshold.ts

import { mkdir, writeFile } from 'node:fs/promises'
import { fetchPositions, mapWithConcurrency, type WhalePosition } from '../src/hl.js'
import { MIN_POSITION_USD, skewPercent } from '../src/scan.js'

const LEADERBOARD_URL = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard'
const FLOOR_USD = 3_000_000

interface RawRow {
  ethAddress: string
  accountValue: string
}

const raw = (await (await fetch(LEADERBOARD_URL, { signal: AbortSignal.timeout(90_000) })).json()) as {
  leaderboardRows: RawRow[]
}
const accounts = raw.leaderboardRows
  .map((row) => ({ address: row.ethAddress, accountValue: Number(row.accountValue) }))
  .filter((row) => row.accountValue >= FLOOR_USD)
  .sort((a, b) => b.accountValue - a.accountValue)
console.log(`accounts ≥ $${FLOOR_USD / 1e6}M: ${accounts.length}`)

let done = 0
const scanned = await mapWithConcurrency(accounts, 5, async ({ address, accountValue }) => {
  const positions = await fetchPositions(address)
  done += 1
  if (done % 200 === 0) console.log(`  …${done}/${accounts.length}`)
  return { address, accountValue, positions }
})
console.log(`scanned ok: ${scanned.length}/${accounts.length}`)

await mkdir('samples', { recursive: true })
await writeFile('samples/scan-dump.json', JSON.stringify({ takenAt: new Date().toISOString(), scanned }))

function evaluate(wallets: ReadonlyArray<{ positions: WhalePosition[] }>): string {
  const big = wallets.flatMap((w) => w.positions).filter((p) => p.sizeUsd >= MIN_POSITION_USD)
  const longUsd = big.filter((p) => p.isLong).reduce((s, p) => s + p.sizeUsd, 0)
  const shortUsd = big.filter((p) => !p.isLong).reduce((s, p) => s + p.sizeUsd, 0)
  const skew = skewPercent(longUsd, shortUsd)
  return (
    `${skew >= 0 ? 'ШОРТ' : 'ЛОНГ'} ${Math.abs(skew)}% · ${big.length} поз · ` +
    `L $${(longUsd / 1e6).toFixed(0)}M / S $${(shortUsd / 1e6).toFixed(0)}M`
  )
}

console.log('\nПо порогу счёта:')
for (const thresholdM of [3, 5, 8, 10, 15, 20, 30, 50]) {
  const set = scanned.filter((w) => w.accountValue >= thresholdM * 1e6)
  console.log(`  av ≥ $${String(thresholdM).padStart(2)}M (${String(set.length).padStart(3)} кош.): ${evaluate(set)}`)
}

console.log('\nПо топ-N счёта:')
for (const n of [100, 150, 200, 250, 300, 350, 450, 600]) {
  console.log(`  top-${String(n).padEnd(3)}: ${evaluate(scanned.slice(0, n))}`)
}
