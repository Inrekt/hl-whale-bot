// Whale universe scan: leaderboard → top wallets → open positions → aggregates.
// Mirrors the reference bot: positions ≥ $1M across the biggest accounts.

import { fetchPositions, mapWithConcurrency, type LeaderboardRow, type WhalePosition } from './hl.js'

export const MIN_POSITION_USD = 1_000_000
const SCAN_CONCURRENCY = 5

export interface CoinSkew {
  readonly coin: string
  readonly longUsd: number
  readonly shortUsd: number
}

export interface Snapshot {
  readonly takenAt: string
  readonly scannedWallets: number
  readonly positions: readonly WhalePosition[]
}

/** Picks the whale universe: biggest accounts by current value, plus top PnL makers. */
export function pickUniverse(rows: readonly LeaderboardRow[], size: number): string[] {
  const byValue = [...rows].sort((a, b) => b.accountValue - a.accountValue).slice(0, size)
  const byDayPnl = [...rows].sort((a, b) => b.dayPnl - a.dayPnl).slice(0, Math.floor(size / 4))
  const unique = new Set([...byValue, ...byDayPnl].map((row) => row.address))
  return [...unique]
}

export async function buildSnapshot(addresses: readonly string[]): Promise<Snapshot> {
  const perWallet = await mapWithConcurrency(addresses, SCAN_CONCURRENCY, fetchPositions)
  const positions = perWallet
    .flat()
    .filter((position) => position.sizeUsd >= MIN_POSITION_USD)
    .sort((a, b) => b.sizeUsd - a.sizeUsd)
  return {
    takenAt: new Date().toISOString(),
    scannedWallets: addresses.length,
    positions,
  }
}

export function totalLongUsd(snapshot: Snapshot): number {
  return snapshot.positions.filter((p) => p.isLong).reduce((sum, p) => sum + p.sizeUsd, 0)
}

export function totalShortUsd(snapshot: Snapshot): number {
  return snapshot.positions.filter((p) => !p.isLong).reduce((sum, p) => sum + p.sizeUsd, 0)
}

/** Skew like the reference bot: "ШОРТ перевес 41%" = (short-long)/(short+long). */
export function skewPercent(longUsd: number, shortUsd: number): number {
  const total = longUsd + shortUsd
  if (total === 0) return 0
  return Math.round(((shortUsd - longUsd) / total) * 100)
}

export function coinSkews(snapshot: Snapshot): CoinSkew[] {
  const byCoin = new Map<string, { longUsd: number; shortUsd: number }>()
  for (const position of snapshot.positions) {
    const entry = byCoin.get(position.coin) ?? { longUsd: 0, shortUsd: 0 }
    const updated = position.isLong
      ? { ...entry, longUsd: entry.longUsd + position.sizeUsd }
      : { ...entry, shortUsd: entry.shortUsd + position.sizeUsd }
    byCoin.set(position.coin, updated)
  }
  return [...byCoin.entries()]
    .map(([coin, { longUsd, shortUsd }]) => ({ coin, longUsd, shortUsd }))
    .sort((a, b) => b.longUsd + b.shortUsd - (a.longUsd + a.shortUsd))
}

export function topPositions(snapshot: Snapshot, coin: string | null, count: number): WhalePosition[] {
  const pool = coin === null ? snapshot.positions : snapshot.positions.filter((p) => p.coin === coin)
  return pool.slice(0, count)
}
