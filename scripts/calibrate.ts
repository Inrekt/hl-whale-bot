// Калибровка юниверса под оригинал: один скан объединения кандидатов,
// затем офлайн-сравнение агрегатов (число позиций ≥ $1M, лонг/шорт, перекос).
// Usage: npx tsx scripts/calibrate.ts

import { fetchPositions, mapWithConcurrency, type WhalePosition } from '../src/hl.js'
import { MIN_POSITION_USD, skewPercent } from '../src/scan.js'

const LEADERBOARD_URL = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard'

interface Row {
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
const rows: Row[] = raw.leaderboardRows.map((row) => {
  const win = (name: string): number => {
    const entry = row.windowPerformances.find(([n]) => n === name)
    return entry ? Number(entry[1].pnl) : 0
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
console.log(`leaderboard rows: ${rows.length}`)

const top = (key: keyof Omit<Row, 'address'>, n: number): string[] =>
  [...rows].sort((a, b) => b[key] - a[key]).slice(0, n).map((r) => r.address)

const candidates: Record<string, Set<string>> = {
  'A-текущая (счёт350+день87)': new Set([...top('accountValue', 350), ...top('day', 87)]),
  'B-прибыль allTime300': new Set(top('allTime', 300)),
  'C-микс прибыли (150at+100d+100w+100m)': new Set([
    ...top('allTime', 150),
    ...top('day', 100),
    ...top('week', 100),
    ...top('month', 100),
  ]),
  'D-счёт200': new Set(top('accountValue', 200)),
}

const union = [...new Set(Object.values(candidates).flatMap((set) => [...set]))]
console.log(`scanning union: ${union.length} wallets…`)
let done = 0
const scanned = await mapWithConcurrency(union, 5, async (address) => {
  const positions = await fetchPositions(address)
  done += 1
  if (done % 150 === 0) console.log(`  …${done}/${union.length}`)
  return [address, positions] as const
})
console.log(`scanned ok: ${scanned.length}/${union.length}`)
const posByWallet = new Map<string, WhalePosition[]>(scanned.map(([a, p]) => [a, [...p]]))

interface WalletBook {
  readonly longUsd: number
  readonly shortUsd: number
  readonly longCount: number
  readonly shortCount: number
}

function bookOf(positions: readonly WhalePosition[]): WalletBook {
  const big = positions.filter((p) => p.sizeUsd >= MIN_POSITION_USD)
  return {
    longUsd: big.filter((p) => p.isLong).reduce((s, p) => s + p.sizeUsd, 0),
    shortUsd: big.filter((p) => !p.isLong).reduce((s, p) => s + p.sizeUsd, 0),
    longCount: big.filter((p) => p.isLong).length,
    shortCount: big.filter((p) => !p.isLong).length,
  }
}

function isBalancedBook(book: WalletBook): boolean {
  const lo = Math.min(book.longUsd, book.shortUsd)
  const hi = Math.max(book.longUsd, book.shortUsd)
  return book.longCount >= 2 && book.shortCount >= 2 && hi > 0 && lo / hi >= 0.5
}

function evaluate(set: Set<string>, mmFilter: boolean): string {
  let longUsd = 0
  let shortUsd = 0
  let count = 0
  let excluded = 0
  for (const address of set) {
    const positions = posByWallet.get(address)
    if (!positions) continue
    const book = bookOf(positions)
    if (mmFilter && isBalancedBook(book)) {
      excluded += 1
      continue
    }
    longUsd += book.longUsd
    shortUsd += book.shortUsd
    count += book.longCount + book.shortCount
  }
  const skew = skewPercent(longUsd, shortUsd)
  const side = skew >= 0 ? 'ШОРТ' : 'ЛОНГ'
  return (
    `${side} ${Math.abs(skew)}% · ${count} поз · ` +
    `L $${(longUsd / 1e6).toFixed(0)}M / S $${(shortUsd / 1e6).toFixed(0)}M` +
    (mmFilter ? ` · MM-исключено: ${excluded}` : '')
  )
}

for (const [name, set] of Object.entries(candidates)) {
  console.log(`\n${name} (${set.size} кошельков)`)
  console.log(`  без фильтра: ${evaluate(set, false)}`)
  console.log(`  с MM-фильтром: ${evaluate(set, true)}`)
}

const currentSet = candidates['A-текущая (счёт350+день87)']
if (currentSet) {
  console.log('\nКрупнейшие «двусторонние» книги в текущей выборке:')
  const balanced = [...currentSet]
    .map((address) => ({ address, book: bookOf(posByWallet.get(address) ?? []) }))
    .filter(({ book }) => isBalancedBook(book))
    .sort((a, b) => b.book.longUsd + b.book.shortUsd - (a.book.longUsd + a.book.shortUsd))
    .slice(0, 5)
  for (const { address, book } of balanced) {
    console.log(
      `  ${address}  L $${(book.longUsd / 1e6).toFixed(0)}M (${book.longCount}) / ` +
        `S $${(book.shortUsd / 1e6).toFixed(0)}M (${book.shortCount})`,
    )
  }
}
