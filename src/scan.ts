// Whale universe scan: leaderboard → top wallets → open positions → aggregates.
// Mirrors the reference bot: positions ≥ $1M across the biggest accounts.

import { fetchPositions, mapWithConcurrency, type LeaderboardRow, type WhalePosition } from './hl.js'

export const MIN_POSITION_USD = 1_000_000
// Лимит Hyperliquid — 1200 единиц веса в минуту на IP, запрос позиций весит 2,
// то есть допустимо ~600 запросов в минуту. При 10 параллельных и ~1с на запрос
// выходит ~600/мин — впритык к потолку, поэтому выше не поднимаем.
const SCAN_CONCURRENCY = 10

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

/**
 * Кит должен пройти два порога: держать серьёзный счёт И доказать, что умеет
 * зарабатывать. Отбор только по размеру счёта тащил в выборку убыточные
 * кошельки с огромными позициями (scripts/quality.ts): их ставки гасили ставки
 * настоящих китов, и перекос схлопывался в ~2% — сигнала не оставалось.
 */
export const UNIVERSE_MIN_ACCOUNT_USD = 5_000_000
export const UNIVERSE_MIN_PROFIT_USD = 5_000_000
const UNIVERSE_MAX_WALLETS = 400

/** Picks the whale universe: proven-profitable accounts, richest profits first. */
export function pickUniverse(rows: readonly LeaderboardRow[]): string[] {
  return [...rows]
    .filter(
      (row) => row.accountValue >= UNIVERSE_MIN_ACCOUNT_USD && row.allTimePnl >= UNIVERSE_MIN_PROFIT_USD,
    )
    .sort((a, b) => b.allTimePnl - a.allTimePnl)
    .slice(0, UNIVERSE_MAX_WALLETS)
    .map((row) => row.address)
}

/**
 * Двусторонняя книга — почерк маркет-мейкера: лонги и шорты сопоставимы по
 * объёму, значит это не ставка на направление, а торговля спредом. Такие
 * позиции показывать как «мнение кита» нельзя.
 */
export function isMarketMakerBook(positions: readonly WhalePosition[]): boolean {
  const big = positions.filter((p) => p.sizeUsd >= MIN_POSITION_USD)
  if (big.length < 4) return false
  const longUsd = big.filter((p) => p.isLong).reduce((sum, p) => sum + p.sizeUsd, 0)
  const shortUsd = big.filter((p) => !p.isLong).reduce((sum, p) => sum + p.sizeUsd, 0)
  const smaller = Math.min(longUsd, shortUsd)
  const larger = Math.max(longUsd, shortUsd)
  return larger > 0 && smaller / larger >= 0.6
}

export async function buildSnapshot(addresses: readonly string[]): Promise<Snapshot> {
  const perWallet = await mapWithConcurrency(addresses, SCAN_CONCURRENCY, fetchPositions)
  const positions = perWallet
    .filter((wallet) => !isMarketMakerBook(wallet))
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
