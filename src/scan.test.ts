import { describe, expect, test } from 'vitest'
import {
  UNIVERSE_MIN_ACCOUNT_USD,
  UNIVERSE_MIN_PROFIT_USD,
  coinSkews,
  isMarketMakerBook,
  pickUniverse,
  resolveCoin,
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
  markPx: 110,
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
  const row = (address: string, accountValue: number, allTimePnl: number): LeaderboardRow => ({
    address,
    accountValue,
    dayPnl: 0,
    allTimePnl,
  })

  const rich = UNIVERSE_MIN_ACCOUNT_USD * 10
  const proven = UNIVERSE_MIN_PROFIT_USD * 10

  test('keeps accounts that are both large and proven profitable, best profit first', () => {
    const rows = [
      row('0xproven', rich, UNIVERSE_MIN_PROFIT_USD),
      row('0xbest', rich, proven),
      row('0xsmallaccount', UNIVERSE_MIN_ACCOUNT_USD - 1, proven),
    ]
    expect(pickUniverse(rows)).toEqual(['0xbest', '0xproven'])
  })

  test('drops big accounts that never made money', () => {
    const rows = [row('0xloser', rich, -8_700_000), row('0xflat', rich, 0)]
    expect(pickUniverse(rows)).toEqual([])
  })
})

describe('isMarketMakerBook', () => {
  const big = (isLong: boolean, sizeUsd: number): WhalePosition => ({
    ...position('BTC', isLong, sizeUsd),
  })

  test('flags a book whose longs and shorts roughly cancel out', () => {
    expect(isMarketMakerBook([big(true, 10e6), big(true, 9e6), big(false, 10e6), big(false, 8e6)])).toBe(true)
  })

  test('keeps a directional book', () => {
    expect(isMarketMakerBook([big(false, 10e6), big(false, 9e6), big(false, 8e6), big(true, 1e6)])).toBe(false)
  })

  test('ignores books too small to judge', () => {
    expect(isMarketMakerBook([big(true, 10e6), big(false, 10e6)])).toBe(false)
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

  test('resolveCoin matches case-insensitively and returns the canonical name', () => {
    const kCoins: Snapshot = { ...snapshot, positions: [position('kPEPE', true, 2_730_000)] }
    expect(resolveCoin(kCoins, 'kpepe')).toBe('kPEPE')
    expect(resolveCoin(kCoins, 'KPEPE')).toBe('kPEPE')
    expect(resolveCoin(snapshot, 'btc')).toBe('BTC')
    expect(resolveCoin(snapshot, 'doge')).toBeNull()
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
