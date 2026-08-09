// История перекосов. Карточка «ШОРТ 74%» не отвечает на главный вопрос —
// куда движется рынок: вчерашние 76% и вчерашние 40% дают одну и ту же цифру
// сегодня, но противоположный смысл. Храним по одной точке на сутки и
// показываем разницу в процентных пунктах.

import { coinSkews, skewPercent, totalLongUsd, totalShortUsd, type Snapshot } from './scan.js'

const HISTORY_DAYS = 14

export interface DailyPoint {
  /** YYYY-MM-DD по МСК — сутки, к которым относится точка */
  readonly day: string
  readonly overallSkew: number
  readonly coinSkews: Record<string, number>
}

export interface SkewDelta {
  readonly overall: number | null
  readonly byCoin: Readonly<Record<string, number>>
}

export const EMPTY_DELTA: SkewDelta = { overall: null, byCoin: {} }

export function mskDay(now: Date): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10)
}

export function pointFrom(snapshot: Snapshot, day: string): DailyPoint {
  const byCoin: Record<string, number> = {}
  for (const skew of coinSkews(snapshot)) {
    byCoin[skew.coin] = skewPercent(skew.longUsd, skew.shortUsd)
  }
  return {
    day,
    overallSkew: skewPercent(totalLongUsd(snapshot), totalShortUsd(snapshot)),
    coinSkews: byCoin,
  }
}

/**
 * Дописывает точку за сегодня, если её ещё нет, и обрезает историю.
 * Первая за сутки запись и есть точка отсчёта: она фиксирует состояние на
 * начало дня, а сравнение идёт с предыдущими сутками.
 */
export function recordPoint(history: readonly DailyPoint[], point: DailyPoint): DailyPoint[] {
  if (history.some((entry) => entry.day === point.day)) return [...history]
  return [...history, point].slice(-HISTORY_DAYS)
}

/** Разница текущего снимка с последними завершёнными сутками, в процентных пунктах. */
export function deltaAgainst(history: readonly DailyPoint[], current: Snapshot, today: string): SkewDelta {
  const previous = [...history].reverse().find((entry) => entry.day !== today)
  if (!previous) return EMPTY_DELTA
  const now = pointFrom(current, today)
  const byCoin: Record<string, number> = {}
  for (const [coin, skew] of Object.entries(now.coinSkews)) {
    const before = previous.coinSkews[coin]
    if (before !== undefined) byCoin[coin] = skew - before
  }
  return { overall: now.overallSkew - previous.overallSkew, byCoin }
}

/** «+34» / «−6» / пусто, если сравнивать не с чем или движение в пределах шума. */
export function formatDelta(delta: number | null | undefined, minimum = 2): string {
  if (delta === null || delta === undefined || Math.abs(delta) < minimum) return ''
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`
}
