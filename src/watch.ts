// Whale-watch diffing: compares two position snapshots of one wallet and
// emits the events the reference bot alerts on: open / close / flip / ±25% resize.

import type { StoredWatchPosition } from './state.js'

export const RESIZE_ALERT_THRESHOLD = 0.25

export type WatchEventKind = 'open' | 'close' | 'flip' | 'increase' | 'decrease'

export interface WatchEvent {
  readonly kind: WatchEventKind
  readonly coin: string
  readonly isLong: boolean
  readonly sizeUsd: number
  readonly leverage: number
  readonly entryPx: number
  /** resize percent (positive), only for increase/decrease */
  readonly changePercent?: number
}

export function diffPositions(
  previous: readonly StoredWatchPosition[],
  current: readonly StoredWatchPosition[],
): WatchEvent[] {
  const events: WatchEvent[] = []
  const prevByCoin = new Map(previous.map((p) => [p.coin, p]))
  const currByCoin = new Map(current.map((p) => [p.coin, p]))

  for (const position of current) {
    const before = prevByCoin.get(position.coin)
    if (!before) {
      events.push(toEvent('open', position))
      continue
    }
    if (before.isLong !== position.isLong) {
      events.push(toEvent('flip', position))
      continue
    }
    const base = before.sizeUsd
    if (base <= 0) continue
    const change = (position.sizeUsd - base) / base
    if (Math.abs(change) >= RESIZE_ALERT_THRESHOLD) {
      events.push({
        ...toEvent(change > 0 ? 'increase' : 'decrease', position),
        changePercent: Math.round(Math.abs(change) * 100),
      })
    }
  }

  for (const before of previous) {
    if (!currByCoin.has(before.coin)) {
      events.push(toEvent('close', before))
    }
  }

  return events
}

function toEvent(kind: WatchEventKind, p: StoredWatchPosition): WatchEvent {
  return {
    kind,
    coin: p.coin,
    isLong: p.isLong,
    sizeUsd: p.sizeUsd,
    leverage: p.leverage,
    entryPx: p.entryPx,
  }
}
