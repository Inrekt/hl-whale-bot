// Что реально попадёт в кнопки монет при текущих настройках.
// Usage: npx tsx scripts/buttons.ts

import { fetchLeaderboard } from '../src/hl.js'
import { buildSnapshot, coinSkews, pickUniverse, rankedCoins, skewPercent } from '../src/scan.js'
import { usdCompact } from '../src/format.js'

const MIN_COIN_WALLETS = 3
const TOP_COINS_COUNT = 20

const rows = await fetchLeaderboard()
const snapshot = await buildSnapshot(pickUniverse(rows))
const buttons = rankedCoins(snapshot, MIN_COIN_WALLETS).slice(0, TOP_COINS_COUNT)
const skews = new Map(coinSkews(snapshot).map((s) => [s.coin, s]))

console.log(`позиций в снимке: ${snapshot.positions.length}, кнопок будет: ${buttons.length}\n`)
buttons.forEach((coin, index) => {
  const s = skews.get(coin)
  if (!s) return
  const wallets = new Set(snapshot.positions.filter((p) => p.coin === coin).map((p) => p.address)).size
  const skew = skewPercent(s.longUsd, s.shortUsd)
  console.log(
    `${String(index + 1).padStart(2)}. ${coin.padEnd(10)} ${usdCompact(s.longUsd + s.shortUsd).padStart(9)} · ` +
      `${String(wallets).padStart(2)} китов · ${skew >= 0 ? 'ШОРТ' : 'ЛОНГ'} ${Math.abs(skew)}%`,
  )
})

const hidden = coinSkews(snapshot)
  .map((s) => s.coin)
  .filter((coin) => !buttons.includes(coin))
console.log(`\nбез кнопки (доступны командой, мало китов): ${hidden.join(', ')}`)
