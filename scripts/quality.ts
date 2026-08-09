// Подбор «нормальных» китов: сравнивает варианты отбора на живых данных.
// Один скан объединения кандидатов, дальше офлайн-оценка каждого варианта.
// Usage: npx tsx scripts/quality.ts

import { fetchPositions, mapWithConcurrency, type WhalePosition } from '../src/hl.js'
import { MIN_POSITION_USD, skewPercent } from '../src/scan.js'

const LEADERBOARD_URL = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard'

interface Trader {
  readonly address: string
  readonly accountValue: number
  readonly day: number
  readonly week: number
  readonly month: number
  readonly allTime: number
}

interface RawRow {
  ethAddress: string
  accountValue: string
  windowPerformances: ReadonlyArray<readonly [string, { pnl: string }]>
}

const raw = (await (await fetch(LEADERBOARD_URL, { signal: AbortSignal.timeout(90_000) })).json()) as {
  leaderboardRows: RawRow[]
}
const traders: Trader[] = raw.leaderboardRows.map((row) => {
  const win = (name: string): number => {
    const found = row.windowPerformances.find(([n]) => n === name)
    return found ? Number(found[1].pnl) : 0
  }
  return {
    address: row.ethAddress,
    accountValue: Number(row.accountValue),
    day: win('day'),
    week: win('week'),
    month: win('month'),
    allTime: win('allTime'),
  }
})
console.log(`лидерборд: ${traders.length} счетов`)

const byAddress = new Map(traders.map((t) => [t.address, t]))

interface Variant {
  readonly name: string
  readonly pick: (all: readonly Trader[]) => Trader[]
}

const topBy = (all: readonly Trader[], key: keyof Omit<Trader, 'address'>, n: number): Trader[] =>
  [...all].sort((a, b) => b[key] - a[key]).slice(0, n)

const variants: Variant[] = [
  {
    name: 'A. сейчас: счёт ≥ $8M',
    pick: (all) => all.filter((t) => t.accountValue >= 8e6).slice(0, 500),
  },
  {
    name: 'B. счёт ≥ $5M + allTime ≥ $5M',
    pick: (all) => all.filter((t) => t.accountValue >= 5e6 && t.allTime >= 5e6),
  },
  {
    name: 'C. счёт ≥ $5M + стабильные (allTime,month,week > 0)',
    pick: (all) => all.filter((t) => t.accountValue >= 5e6 && t.allTime > 0 && t.month > 0 && t.week > 0),
  },
  {
    name: 'D. топ-150 по прибыли, счёт ≥ $3M',
    pick: (all) => topBy(all.filter((t) => t.accountValue >= 3e6), 'allTime', 150),
  },
  {
    name: 'E. топ-100 по прибыли (как лидерборд оригинала)',
    pick: (all) => topBy(all, 'allTime', 100),
  },
  {
    name: 'F. B + месяц в плюсе',
    pick: (all) => all.filter((t) => t.accountValue >= 5e6 && t.allTime >= 5e6 && t.month > 0),
  },
]

const picks = new Map(variants.map((v) => [v.name, v.pick(traders)]))
const union = [...new Set([...picks.values()].flat().map((t) => t.address))]
console.log(`сканирую объединение: ${union.length} кошельков…`)

let done = 0
const scanned = await mapWithConcurrency(union, 5, async (address) => {
  const positions = await fetchPositions(address)
  done += 1
  if (done % 200 === 0) console.log(`  …${done}/${union.length}`)
  return [address, positions] as const
})
const positionsOf = new Map<string, readonly WhalePosition[]>(scanned)
console.log(`просканировано: ${scanned.length}/${union.length}\n`)

/** Двусторонняя книга: лонги и шорты сопоставимы — почерк маркет-мейкера, не направленная ставка. */
function isMarketMaker(positions: readonly WhalePosition[]): boolean {
  const big = positions.filter((p) => p.sizeUsd >= MIN_POSITION_USD)
  const longUsd = big.filter((p) => p.isLong).reduce((s, p) => s + p.sizeUsd, 0)
  const shortUsd = big.filter((p) => !p.isLong).reduce((s, p) => s + p.sizeUsd, 0)
  const lo = Math.min(longUsd, shortUsd)
  const hi = Math.max(longUsd, shortUsd)
  return big.length >= 4 && hi > 0 && lo / hi >= 0.6
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0)
}

function evaluate(set: readonly Trader[], dropMarketMakers: boolean): string {
  const kept = set.filter((t) => !dropMarketMakers || !isMarketMaker(positionsOf.get(t.address) ?? []))
  const big = kept.flatMap((t) => positionsOf.get(t.address) ?? []).filter((p) => p.sizeUsd >= MIN_POSITION_USD)
  const longUsd = big.filter((p) => p.isLong).reduce((s, p) => s + p.sizeUsd, 0)
  const shortUsd = big.filter((p) => !p.isLong).reduce((s, p) => s + p.sizeUsd, 0)
  const skew = skewPercent(longUsd, shortUsd)
  const withPositions = kept.filter((t) => (positionsOf.get(t.address) ?? []).some((p) => p.sizeUsd >= MIN_POSITION_USD))
  const medianPnl = median(kept.map((t) => t.allTime))
  const mmDropped = set.length - kept.length
  return (
    `${String(kept.length).padStart(4)} кош. (${withPositions.length} с позициями) · ` +
    `${String(big.length).padStart(3)} поз ≥$1M · ` +
    `${skew >= 0 ? 'ШОРТ' : 'ЛОНГ'} ${String(Math.abs(skew)).padStart(2)}% · ` +
    `медиана прибыли $${(medianPnl / 1e6).toFixed(1)}M` +
    (dropMarketMakers ? ` · ММ убрано: ${mmDropped}` : '')
  )
}

for (const variant of variants) {
  const set = picks.get(variant.name) ?? []
  console.log(variant.name)
  console.log(`   как есть:  ${evaluate(set, false)}`)
  console.log(`   без ММ:    ${evaluate(set, true)}`)
}

const shortlist = picks.get('F. B + месяц в плюсе') ?? []
console.log('\nПримеры отобранных (вариант F, топ-10 по прибыли):')
for (const trader of [...shortlist].sort((a, b) => b.allTime - a.allTime).slice(0, 10)) {
  const big = (positionsOf.get(trader.address) ?? []).filter((p) => p.sizeUsd >= MIN_POSITION_USD)
  const coins = big.map((p) => `${p.coin}${p.isLong ? '↑' : '↓'}`).join(' ') || '—'
  console.log(
    `  ${trader.address.slice(0, 8)}…  прибыль $${(trader.allTime / 1e6).toFixed(0)}M · ` +
      `счёт $${(trader.accountValue / 1e6).toFixed(0)}M · ${coins}`,
  )
}

console.log('\nКого вариант F выкидывает из нынешней выборки A (топ-8 по размеру позиций):')
const setA = picks.get('A. сейчас: счёт ≥ $8M') ?? []
const keptF = new Set(shortlist.map((t) => t.address))
const dropped = setA
  .filter((t) => !keptF.has(t.address))
  .flatMap((t) => (positionsOf.get(t.address) ?? []).filter((p) => p.sizeUsd >= MIN_POSITION_USD))
  .sort((a, b) => b.sizeUsd - a.sizeUsd)
  .slice(0, 8)
for (const p of dropped) {
  const trader = byAddress.get(p.address)
  console.log(
    `  ${p.coin.padEnd(5)} ${p.isLong ? 'LONG ' : 'SHORT'} $${(p.sizeUsd / 1e6).toFixed(0)}M · ` +
      `${p.address.slice(0, 8)}… · прибыль за всё время $${((trader?.allTime ?? 0) / 1e6).toFixed(1)}M`,
  )
}
