// Разбор перекоса по одной монете: кто именно его создаёт и не держится ли он
// на одном ките. Usage: npx tsx scripts/coin.ts SOL

import { fetchLeaderboard } from '../src/hl.js'
import { buildSnapshot, coinSkews, pickUniverse, skewPercent } from '../src/scan.js'
import { shortAddress, signedUsd, usdCompact } from '../src/format.js'

const coin = (process.argv[2] ?? 'SOL').toUpperCase()

const rows = await fetchLeaderboard()
const universe = pickUniverse(rows)
console.log(`юниверс: ${universe.length} кошельков, сканирую…`)
const snapshot = await buildSnapshot(universe)

const positions = snapshot.positions.filter((p) => p.coin === coin)
const longUsd = positions.filter((p) => p.isLong).reduce((s, p) => s + p.sizeUsd, 0)
const shortUsd = positions.filter((p) => !p.isLong).reduce((s, p) => s + p.sizeUsd, 0)
const skew = skewPercent(longUsd, shortUsd)
const wallets = new Set(positions.map((p) => p.address)).size

console.log(
  `\n${coin}: ${skew >= 0 ? 'ШОРТ' : 'ЛОНГ'} перевес ${Math.abs(skew)}% · ` +
    `${positions.length} позиций у ${wallets} кошельков · ` +
    `лонги ${usdCompact(longUsd)} / шорты ${usdCompact(shortUsd)}`,
)

const biggest = positions[0]
if (biggest) {
  const share = Math.round((biggest.sizeUsd / (longUsd + shortUsd)) * 100)
  console.log(`крупнейшая позиция = ${share}% всего объёма по монете\n`)
}

for (const [index, p] of positions.entries()) {
  console.log(
    `${String(index + 1).padStart(2)}. ${p.isLong ? 'LONG ' : 'SHORT'} ${String(p.leverage).padStart(2)}x ` +
      `${usdCompact(p.sizeUsd).padStart(9)}  ${shortAddress(p.address)}  uPnL ${signedUsd(p.unrealizedPnl)}`,
  )
}

console.log('\nДля сравнения — перекос по остальным монетам:')
for (const s of coinSkews(snapshot).slice(0, 8)) {
  const total = s.longUsd + s.shortUsd
  const coinWallets = new Set(
    snapshot.positions.filter((p) => p.coin === s.coin).map((p) => p.address),
  ).size
  console.log(
    `  ${s.coin.padEnd(9)} ${String(skewPercent(s.longUsd, s.shortUsd)).padStart(4)}% · ` +
      `${usdCompact(total).padStart(9)} · ${coinWallets} кош.`,
  )
}
