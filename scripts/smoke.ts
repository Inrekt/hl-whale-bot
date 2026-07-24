// End-to-end data smoke test: live Hyperliquid data → console mirror of the bot's cards.
// Usage: npm run smoke -- [path-to-cached-leaderboard.json]

import { fetchLeaderboard } from '../src/hl.js'
import { buildSnapshot, coinSkews, pickUniverse, skewPercent, topPositions, totalLongUsd, totalShortUsd } from '../src/scan.js'
import { priceCompact, shortAddress, signedUsd, usdCompact } from '../src/format.js'

const SMOKE_UNIVERSE_SIZE = 60
const TOP_ROWS = 10

const localPath = process.argv[2]
console.log(`Загружаю лидерборд${localPath ? ' (локальный файл)' : ''}…`)
const rows = await fetchLeaderboard(localPath)
console.log(`Аккаунтов в лидерборде: ${rows.length.toLocaleString('en-US')}`)

const universe = pickUniverse(rows, SMOKE_UNIVERSE_SIZE)
console.log(`Сканирую ${universe.length} кошельков…`)
const startedAt = Date.now()
const snapshot = await buildSnapshot(universe)
const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1)

const longUsd = totalLongUsd(snapshot)
const shortUsd = totalShortUsd(snapshot)
const skew = skewPercent(longUsd, shortUsd)

console.log(`\n🐳 Топ китов · Hyperliquid — позиции ≥ $1.00M (скан ${elapsedSec}с, ${snapshot.positions.length} поз.)`)
for (const [index, p] of topPositions(snapshot, null, TOP_ROWS).entries()) {
  const side = p.isLong ? 'LONG ' : 'SHORT'
  const liq = p.liquidationPx === null ? '—' : priceCompact(p.liquidationPx)
  console.log(
    `${String(index + 1).padStart(2)}. ${p.coin.padEnd(5)} ${side} ${String(p.leverage).padStart(2)}x` +
      `  вход ${priceCompact(p.entryPx).padStart(9)}  ликв ${liq.padStart(9)}` +
      `  ${shortAddress(p.address)}  ${usdCompact(p.sizeUsd).padStart(9)}  uPnL ${signedUsd(p.unrealizedPnl)}`,
  )
}

console.log(`\n📊 Настроение: ${skew >= 0 ? 'ШОРТ' : 'ЛОНГ'} перевес ${Math.abs(skew)}%`)
console.log(`   Лонги ${usdCompact(longUsd)} · Шорты ${usdCompact(shortUsd)}`)
for (const { coin, longUsd: cl, shortUsd: cs } of coinSkews(snapshot).slice(0, 7)) {
  console.log(`   ${coin.padEnd(6)} ${skewPercent(cl, cs) >= 0 ? '🔴' : '🟢'} ${usdCompact(cl + cs)}`)
}
