import { describe, expect, test } from 'vitest'
import { buildCoinView, encodeCoinView, parseCoinView, pageRangeLabel } from './coinView.js'
import type { WhalePosition } from './hl.js'

const pos = (coin: string, isLong: boolean, sizeUsd: number, address: string): WhalePosition => ({
  address,
  coin,
  isLong,
  sizeUsd,
  leverage: 5,
  entryPx: 100,
  liquidationPx: 200,
  markPx: 110,
  unrealizedPnl: 0,
})

describe('buildCoinView', () => {
  test('filters by coin and preserves input order', () => {
    const positions = [pos('ETH', true, 10, '0xa'), pos('BTC', false, 20, '0xb'), pos('ETH', false, 5, '0xc')]
    const view = buildCoinView(positions, 'ETH', 'all', 1)
    expect(view.rows.map((p) => p.address)).toEqual(['0xa', '0xc'])
    expect(view.coinTotal).toBe(2)
  })

  test('long/short counts are computed over the full coin set, invariant across filter', () => {
    const positions = [pos('SOL', true, 1, '0xa'), pos('SOL', false, 80, '0xb'), pos('SOL', false, 60, '0xc')]
    const all = buildCoinView(positions, 'SOL', 'all', 1)
    const longs = buildCoinView(positions, 'SOL', 'long', 1)
    expect(all.longCount).toBe(1)
    expect(all.shortCount).toBe(2)
    expect(longs.longCount).toBe(1)
    expect(longs.shortCount).toBe(2)
  })

  test('the SOL regression: bar scale stays coin-wide even when filtered to the tiny long', () => {
    const positions = [pos('SOL', true, 600_000, '0xa'), pos('SOL', false, 80_000_000, '0xb')]
    const longs = buildCoinView(positions, 'SOL', 'long', 1)
    expect(longs.rows).toHaveLength(1)
    expect(longs.maxSizeUsd).toBe(80_000_000)
  })

  test('pagination: page 2 of 22 starts at rank 11 with correct offset', () => {
    const positions = Array.from({ length: 22 }, (_, i) => pos('ETH', false, 22 - i, `0x${i}`))
    const page2 = buildCoinView(positions, 'ETH', 'all', 2)
    expect(page2.rankOffset).toBe(10)
    expect(page2.rows).toHaveLength(10)
    expect(page2.rows[0]?.sizeUsd).toBe(12) // 11th largest
    const page3 = buildCoinView(positions, 'ETH', 'all', 3)
    expect(page3.rows).toHaveLength(2)
    expect(page3.pageCount).toBe(3)
  })

  test('clamps out-of-range and malformed page numbers instead of failing', () => {
    const positions = [pos('ETH', true, 1, '0xa')]
    expect(buildCoinView(positions, 'ETH', 'all', 0).page).toBe(1)
    expect(buildCoinView(positions, 'ETH', 'all', -5).page).toBe(1)
    expect(buildCoinView(positions, 'ETH', 'all', 999).page).toBe(1)
    expect(buildCoinView(positions, 'ETH', 'all', Number.NaN).page).toBe(1)
  })

  test('empty filter still yields pageCount 1, not 0', () => {
    const positions = [pos('UNI', false, 1, '0xa'), pos('UNI', false, 2, '0xb')]
    const view = buildCoinView(positions, 'UNI', 'long', 1)
    expect(view.rows).toEqual([])
    expect(view.total).toBe(0)
    expect(view.pageCount).toBe(1)
  })

  test('unknown coin yields an all-zero empty view, not a throw', () => {
    const view = buildCoinView([pos('ETH', true, 1, '0xa')], 'DOGE', 'all', 1)
    expect(view.coinTotal).toBe(0)
    expect(view.maxSizeUsd).toBe(0)
  })
})

describe('pageRangeLabel', () => {
  test('formats ranges and the single-row and zero cases', () => {
    const positions = Array.from({ length: 36 }, (_, i) => pos('ETH', false, 36 - i, `0x${i}`))
    expect(pageRangeLabel(buildCoinView(positions, 'ETH', 'all', 2))).toBe('11–20 из 36')
    expect(pageRangeLabel(buildCoinView(positions, 'ETH', 'all', 4))).toBe('31–36 из 36')
    expect(pageRangeLabel(buildCoinView([pos('ETH', true, 1, '0xa')], 'ETH', 'all', 1))).toBe('1 из 1')
    expect(pageRangeLabel(buildCoinView([pos('ETH', true, 1, '0xa')], 'ETH', 'short', 1))).toBe('0')
  })
})

describe('encodeCoinView / parseCoinView', () => {
  test('round-trips for plain and k-prefixed coins', () => {
    for (const [coin, filter, page] of [
      ['BTC', 'all', 1],
      ['SOL', 'long', 2],
      ['kPEPE', 'short', 12],
    ] as const) {
      const encoded = encodeCoinView(coin, filter, page)
      expect(parseCoinView(encoded)).toEqual({ coin, filter, page })
    }
  })

  test('encoded payload stays well under Telegram\'s 64-byte callback_data cap', () => {
    expect(encodeCoinView('FARTCOIN', 'short', 10).length).toBeLessThan(64)
  })

  test('rejects malformed or foreign payloads instead of guessing', () => {
    expect(parseCoinView('coin:BTC')).toBeNull()
    expect(parseCoinView('cv:x1:BTC')).toBeNull()
    expect(parseCoinView('cv:a0:')).toBeNull()
    expect(parseCoinView('liq:BTC')).toBeNull()
  })
})
