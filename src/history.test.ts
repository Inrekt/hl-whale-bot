import { describe, expect, test } from 'vitest'
import { deltaAgainst, formatDelta, mskDay, pointFrom, recordPoint, type DailyPoint } from './history.js'
import type { Snapshot } from './scan.js'
import type { WhalePosition } from './hl.js'
import { whaleName } from './whales.js'
import { biggestCluster, liquidationMap } from './liquidation.js'

const position = (
  coin: string,
  isLong: boolean,
  sizeUsd: number,
  extra: Partial<WhalePosition> = {},
): WhalePosition => ({
  address: '0x1234567890abcdef1234567890abcdef12345678',
  coin,
  isLong,
  sizeUsd,
  leverage: 5,
  entryPx: 100,
  liquidationPx: 200,
  markPx: 100,
  unrealizedPnl: 0,
  ...extra,
})

const snapshotOf = (positions: WhalePosition[]): Snapshot => ({
  takenAt: '2026-08-10T00:00:00.000Z',
  scannedWallets: 10,
  positions,
})

describe('mskDay', () => {
  test('rolls over three hours before UTC', () => {
    expect(mskDay(new Date('2026-08-09T21:30:00Z'))).toBe('2026-08-10')
    expect(mskDay(new Date('2026-08-09T20:30:00Z'))).toBe('2026-08-09')
  })
})

describe('history', () => {
  const yesterday: DailyPoint = { day: '2026-08-09', overallSkew: 40, coinSkews: { ETH: 20, BTC: -10 } }

  test('keeps one point per day', () => {
    const today = pointFrom(snapshotOf([position('ETH', false, 10e6)]), '2026-08-10')
    const once = recordPoint([yesterday], today)
    expect(recordPoint(once, today)).toHaveLength(2)
  })

  test('delta compares against the last completed day', () => {
    const snapshot = snapshotOf([position('ETH', false, 10e6), position('BTC', true, 10e6)])
    const delta = deltaAgainst([yesterday], snapshot, '2026-08-10')
    expect(delta.overall).toBe(-40) // сегодня стороны в балансе (0%) против вчерашних 40% в шорт
    expect(delta.byCoin.ETH).toBe(80) // сегодня 100% шорт против вчерашних 20
    expect(delta.byCoin.BTC).toBe(-90) // сегодня 100% лонг против вчерашних -10
  })

  test('no history means no delta', () => {
    expect(deltaAgainst([], snapshotOf([position('ETH', false, 1e6)]), '2026-08-10').overall).toBeNull()
  })

  test('today-only history is not compared against itself', () => {
    const today: DailyPoint = { day: '2026-08-10', overallSkew: 10, coinSkews: {} }
    expect(deltaAgainst([today], snapshotOf([position('ETH', false, 1e6)]), '2026-08-10').overall).toBeNull()
  })

  test('formatDelta hides noise and signs the rest', () => {
    expect(formatDelta(34)).toBe('+34')
    expect(formatDelta(-6)).toBe('−6')
    expect(formatDelta(1)).toBe('')
    expect(formatDelta(null)).toBe('')
  })
})

describe('whaleName', () => {
  test('is stable and case-insensitive for one address', () => {
    const address = '0x5b5d51203a0f9079f8aeb098a6523a13f298c060'
    expect(whaleName(address)).toBe(whaleName(address.toUpperCase()))
    expect(whaleName(address)).toBe(whaleName(address))
  })

  test('different addresses usually get different names', () => {
    const names = new Set(
      ['0xaaa1', '0xbbb2', '0xccc3', '0xddd4', '0xeee5', '0xfff6'].map((a) => whaleName(a)),
    )
    expect(names.size).toBeGreaterThan(3)
  })
})

describe('liquidationMap', () => {
  test('splits clusters above and below the mark price by side', () => {
    const map = liquidationMap([
      position('ETH', false, 20e6, { markPx: 1000, liquidationPx: 1200, address: '0xa' }),
      position('ETH', false, 10e6, { markPx: 1000, liquidationPx: 1210, address: '0xb' }),
      position('ETH', true, 5e6, { markPx: 1000, liquidationPx: 900, address: '0xc' }),
    ])
    expect(map).not.toBeNull()
    expect(map?.above[0]?.usd).toBe(30e6) // два шорта в одном ценовом ведре
    expect(map?.above[0]?.wallets).toBe(2)
    expect(map?.above[0]?.isLong).toBe(false) // вверх выносит шорты
    expect(map?.below[0]?.isLong).toBe(true)
    expect(map?.totalUsd).toBe(35e6)
  })

  test('ignores liquidations beyond the horizon', () => {
    expect(liquidationMap([position('ETH', false, 20e6, { markPx: 1000, liquidationPx: 5000 })])).toBeNull()
  })

  test('biggest cluster is the strongest magnet', () => {
    const map = liquidationMap([
      position('ETH', false, 20e6, { markPx: 1000, liquidationPx: 1100, address: '0xa' }),
      position('ETH', true, 50e6, { markPx: 1000, liquidationPx: 950, address: '0xb' }),
    ])
    expect(map && biggestCluster(map)?.usd).toBe(50e6)
  })
})
