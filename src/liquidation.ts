// Карта ликвидаций. У каждой позиции кита есть цена, на которой биржа закроет
// её принудительно. Собранные вместе, эти цены образуют кластеры — уровни, где
// вынос одного кита толкает цену дальше и цепляет следующих. Это единственное
// место в данных, где видно, куда рынок «тянет» и где начнётся каскад.

import { liquidationDistance, type WhalePosition } from './hl.js'

const LEVELS = 8
/** Дальше этого от текущей цены кластеры уже не про сегодняшнюю торговлю. */
const HORIZON = 0.6

export interface LiquidationLevel {
  /** Верхняя граница ценового диапазона уровня */
  readonly price: number
  /** Насколько уровень отстоит от текущей цены, долей */
  readonly distance: number
  /** Позиции какой стороны вынесет на этом уровне */
  readonly isLong: boolean
  readonly usd: number
  readonly wallets: number
}

export interface LiquidationMap {
  readonly markPx: number
  /** Ближайший заметный кластер сверху (вынос шортов) */
  readonly above: readonly LiquidationLevel[]
  /** Ближайший заметный кластер снизу (вынос лонгов) */
  readonly below: readonly LiquidationLevel[]
  readonly totalUsd: number
}

function bucket(positions: readonly WhalePosition[], markPx: number, above: boolean): LiquidationLevel[] {
  const relevant = positions.filter((position) => {
    const distance = liquidationDistance(position)
    if (distance === null || distance > HORIZON || position.liquidationPx === null) return false
    return above ? position.liquidationPx > markPx : position.liquidationPx < markPx
  })
  if (relevant.length === 0) return []

  const step = (markPx * HORIZON) / LEVELS
  const levels = new Map<number, { usd: number; wallets: Set<string>; isLong: boolean }>()
  for (const position of relevant) {
    const liquidationPx = position.liquidationPx ?? 0
    const offset = Math.abs(liquidationPx - markPx)
    const index = Math.min(LEVELS - 1, Math.floor(offset / step))
    const entry = levels.get(index) ?? { usd: 0, wallets: new Set<string>(), isLong: position.isLong }
    entry.usd += position.sizeUsd
    entry.wallets.add(position.address)
    levels.set(index, entry)
  }

  return [...levels.entries()]
    .map(([index, entry]) => ({
      price: above ? markPx + (index + 1) * step : markPx - (index + 1) * step,
      distance: ((index + 1) * step) / markPx,
      // Сверху выносит шорты, снизу — лонги: сторона следует из направления движения.
      isLong: !above,
      usd: entry.usd,
      wallets: entry.wallets.size,
    }))
    .sort((a, b) => a.distance - b.distance)
}

export function liquidationMap(positions: readonly WhalePosition[]): LiquidationMap | null {
  const withPrice = positions.filter((position) => position.markPx > 0)
  const markPx = withPrice[0]?.markPx ?? 0
  if (markPx === 0) return null
  const above = bucket(withPrice, markPx, true)
  const below = bucket(withPrice, markPx, false)
  const totalUsd = [...above, ...below].reduce((sum, level) => sum + level.usd, 0)
  if (totalUsd === 0) return null
  return { markPx, above, below, totalUsd }
}

/** Самый крупный кластер — то место, куда цену «тянет» сильнее всего. */
export function biggestCluster(map: LiquidationMap): LiquidationLevel | null {
  const all = [...map.above, ...map.below]
  if (all.length === 0) return null
  return all.reduce((best, level) => (level.usd > best.usd ? level : best))
}
