import { describe, expect, test } from 'vitest'
import { diffPositions } from './watch.js'
import type { StoredWatchPosition } from './state.js'

const btcLong = (sizeUsd: number): StoredWatchPosition => ({
  coin: 'BTC',
  isLong: true,
  sizeUsd,
  leverage: 5,
  entryPx: 64000,
})

describe('diffPositions', () => {
  test('detects newly opened position', () => {
    const events = diffPositions([], [btcLong(2_000_000)])
    expect(events).toEqual([expect.objectContaining({ kind: 'open', coin: 'BTC', isLong: true })])
  })

  test('detects closed position', () => {
    const events = diffPositions([btcLong(2_000_000)], [])
    expect(events).toEqual([expect.objectContaining({ kind: 'close', coin: 'BTC' })])
  })

  test('detects flip long→short', () => {
    const events = diffPositions([btcLong(2_000_000)], [{ ...btcLong(2_000_000), isLong: false }])
    expect(events).toEqual([expect.objectContaining({ kind: 'flip', isLong: false })])
  })

  test('detects 25%+ increase with rounded percent', () => {
    const events = diffPositions([btcLong(1_000_000)], [btcLong(1_300_000)])
    expect(events).toEqual([expect.objectContaining({ kind: 'increase', changePercent: 30 })])
  })

  test('detects 25%+ decrease', () => {
    const events = diffPositions([btcLong(1_000_000)], [btcLong(700_000)])
    expect(events).toEqual([expect.objectContaining({ kind: 'decrease', changePercent: 30 })])
  })

  test('stays silent below the 25% threshold', () => {
    expect(diffPositions([btcLong(1_000_000)], [btcLong(1_200_000)])).toEqual([])
  })

  test('handles multiple coins independently', () => {
    const ethShort: StoredWatchPosition = { coin: 'ETH', isLong: false, sizeUsd: 5_000_000, leverage: 3, entryPx: 1800 }
    const events = diffPositions([btcLong(1_000_000)], [btcLong(1_000_000), ethShort])
    expect(events).toEqual([expect.objectContaining({ kind: 'open', coin: 'ETH' })])
  })
})
