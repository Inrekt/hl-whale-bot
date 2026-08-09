// Полный список монет, по которым у отобранных китов есть позиции.
// Показывает, что попадёт в кнопки при разном пороге размера позиции.
// Usage: npx tsx scripts/coins-list.ts

import { fetchLeaderboard, fetchPositions, mapWithConcurrency } from '../src/hl.js'
import { pickUniverse, isMarketMakerBook, skewPercent } from '../src/scan.js'
import { usdCompact } from '../src/format.js'

const rows = await fetchLeaderboard()
const universe = pickUniverse(rows)
console.log(`юниверс: ${universe.length} кошельков, сканирую…\n`)

const perWallet = await mapWithConcurrency(universe, 10, fetchPositions)
const all = perWallet.filter((wallet) => !isMarketMakerBook(wallet)).flat()

for (const threshold of [1_000_000, 500_000, 250_000]) {
  const kept = all.filter((p) => p.sizeUsd >= threshold)
  const byCoin = new Map<string, { longUsd: number; shortUsd: number; count: number; wallets: Set<string> }>()
  for (const p of kept) {
    const entry = byCoin.get(p.coin) ?? { longUsd: 0, shortUsd: 0, count: 0, wallets: new Set<string>() }
    entry.count += 1
    entry.wallets.add(p.address)
    if (p.isLong) entry.longUsd += p.sizeUsd
    else entry.shortUsd += p.sizeUsd
    byCoin.set(p.coin, entry)
  }
  const ranked = [...byCoin.entries()].sort((a, b) => b[1].longUsd + b[1].shortUsd - (a[1].longUsd + a[1].shortUsd))
  console.log(`=== порог позиции ≥ ${usdCompact(threshold)}: ${ranked.length} монет, ${kept.length} позиций`)
  ranked.forEach(([coin, s], index) => {
    const total = s.longUsd + s.shortUsd
    const skew = skewPercent(s.longUsd, s.shortUsd)
    console.log(
      `${String(index + 1).padStart(2)}. ${coin.padEnd(10)} ${usdCompact(total).padStart(9)} · ` +
        `${String(s.count).padStart(2)} поз · ${String(s.wallets.size).padStart(2)} кош · ` +
        `${skew >= 0 ? 'ШОРТ' : 'ЛОНГ'} ${String(Math.abs(skew)).padStart(3)}%`,
    )
  })
  console.log()
}
