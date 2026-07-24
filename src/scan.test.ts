import { describe, expect, test } from 'vitest'
import {
  UNIVERSE_MIN_ACCOUNT_USD,
  coinSkews,
  pickUniverse,
  skewPercent,
  topPositions,
  totalLongUsd,
  totalShortUsd,
  type Snapshot,
} from './scan.js'
import type { LeaderboardRow, WhalePosition } from './hl.js'
import { shortAddress, signedUsd, usdCompact } from './format.js'

const position = (coin: string, isLong: boolean, sizeUsd: number): WhalePosition => ({
  address: '0x1234567890abcdef1234567890abcdef12345678',
  coin,
  isLong,
  sizeUsd,
  leverage: 5,
  entryPx: 100,
  liquidationPx: 200,
  unrealizedPnl: -1000,
})

const snapshot: Snapshot = {
  takenAt: '2026-07-24T00:00:00.000Z',
  scannedWallets: 3,
  positions: [
    position('BTC', false, 50_000_000),
    position('ETH', true, 30_000_000),
    position('BTC', true, 20_000_000),
  ],
}

describe('pickUniverse', () => {
  const row = (address: string, accountValue: number): LeaderboardRow => ({
    address,
    accountValue,
    dayPnl: 0,
    allTimePnl: 0,
  })

  test('keeps only accounts at or above the floor, sorted by value', () => {
    const rows = [
      row('0xsmall', UNIVERSE_MIN_ACCOUNT_USD - 1),
      row('0xmid', UNIVERSE_MIN_ACCOUNT_USD),
      row('0xbig', UNIVERSE_MIN_ACCOUNT_USD * 10),
    ]
    expect(pickUniverse(rows)).toEqual(['0xbig', '0xmid'])
  })
})

describe('scan aggregates', () => {
  test('long/short totals', () => {
    expect(totalLongUsd(snapshot)).toBe(50_000_000)
    expect(totalShortUsd(snapshot)).toBe(50_000_000)
  })

  test('skewPercent matches the reference formula (short-long)/total', () => {
    expect(skewPercent(719_500_000, 1_710_000_000)).toBe(41) // числа с карточки оригинала
    expect(skewPercent(100, 100)).toBe(0)
    expect(skewPercent(0, 0)).toBe(0)
  })

  test('coinSkews sorts by total notional', () => {
    const skews = coinSkews(snapshot)
    expect(skews.map((s) => s.coin)).toEqual(['BTC', 'ETH'])
    expect(skews[0]).toEqual({ coin: 'BTC', longUsd: 20_000_000, shortUsd: 50_000_000 })
  })

  test('topPositions filters by coin', () => {
    expect(topPositions(snapshot, 'ETH', 10)).toHaveLength(1)
    expect(topPositions(snapshot, null, 2)).toHaveLength(2)
  })
})

describe('format', () => {
  test('usdCompact', () => {
    expect(usdCompact(82_950_000)).toBe('$82.95M')
    expect(usdCompact(1_710_000_000)).toBe('$1.71B')
    expect(usdCompact(-582_903)).toBe('−$583k')
  })

  test('signedUsd adds plus for gains', () => {
    expect(signedUsd(949_214)).toBe('+$949k')
  })

  test('shortAddress mirrors reference format', () => {
    expect(shortAddress('0x92eabcdef00000000000000000000000000050e9')).toBe('0x92ea...50e9')
  })
})
