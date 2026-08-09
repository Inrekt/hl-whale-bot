// Hyperliquid public API client — no keys, no cost.
// REST info endpoint: weighted rate limit ~1200/min per IP; clearinghouseState weight 2.

import { readFile } from 'node:fs/promises'

const INFO_URL = 'https://api.hyperliquid.xyz/info'
const LEADERBOARD_URL = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard'
const REQUEST_TIMEOUT_MS = 20_000

export interface LeaderboardRow {
  readonly address: string
  readonly accountValue: number
  readonly dayPnl: number
  readonly allTimePnl: number
}

export interface WhalePosition {
  readonly address: string
  readonly coin: string
  readonly isLong: boolean
  readonly sizeUsd: number
  readonly leverage: number
  readonly entryPx: number
  readonly liquidationPx: number | null
  /** Текущая цена: стоимость позиции, делённая на её размер в монете. */
  readonly markPx: number
  readonly unrealizedPnl: number
}

/**
 * Насколько цена должна пройти против кита, чтобы его вынесло по ликвидации,
 * долей от текущей цены. Самое дорогое число в этом деле — и единственное,
 * которое отличает спокойное плечо 3x от 20x на грани.
 */
export function liquidationDistance(position: WhalePosition): number | null {
  if (position.liquidationPx === null || position.markPx <= 0) return null
  return Math.abs(position.liquidationPx - position.markPx) / position.markPx
}

interface RawWindowPerf {
  pnl: string
}

interface RawLeaderboardRow {
  ethAddress: string
  accountValue: string
  windowPerformances: ReadonlyArray<readonly [string, RawWindowPerf]>
}

interface RawAssetPosition {
  position: {
    coin: string
    szi: string
    entryPx: string | null
    liquidationPx: string | null
    positionValue: string
    unrealizedPnl: string
    leverage: { value: number }
  }
}

interface RawClearinghouseState {
  assetPositions: RawAssetPosition[]
}

async function postInfo<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`Hyperliquid info ${body.type}: HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

function windowPnl(row: RawLeaderboardRow, window: string): number {
  const entry = row.windowPerformances.find(([name]) => name === window)
  return entry ? Number(entry[1].pnl) : 0
}

/** Loads the full leaderboard (~33 MB JSON). Pass localPath to reuse a downloaded copy. */
export async function fetchLeaderboard(localPath?: string): Promise<LeaderboardRow[]> {
  let raw: { leaderboardRows: RawLeaderboardRow[] }
  if (localPath) {
    raw = JSON.parse(await readFile(localPath, 'utf8'))
  } else {
    const res = await fetch(LEADERBOARD_URL, { signal: AbortSignal.timeout(90_000) })
    if (!res.ok) throw new Error(`Leaderboard: HTTP ${res.status}`)
    raw = (await res.json()) as { leaderboardRows: RawLeaderboardRow[] }
  }
  return raw.leaderboardRows.map((row) => ({
    address: row.ethAddress,
    accountValue: Number(row.accountValue),
    dayPnl: windowPnl(row, 'day'),
    allTimePnl: windowPnl(row, 'allTime'),
  }))
}

/** Open perp positions of one wallet. */
export async function fetchPositions(address: string): Promise<WhalePosition[]> {
  const state = await postInfo<RawClearinghouseState>({ type: 'clearinghouseState', user: address })
  return state.assetPositions.map(({ position }) => {
    const size = Number(position.szi)
    const sizeUsd = Number(position.positionValue)
    return {
      address,
      coin: position.coin,
      isLong: size > 0,
      sizeUsd,
      leverage: position.leverage.value,
      entryPx: position.entryPx === null ? 0 : Number(position.entryPx),
      liquidationPx: position.liquidationPx === null ? null : Number(position.liquidationPx),
      markPx: size === 0 ? 0 : sizeUsd / Math.abs(size),
      unrealizedPnl: Number(position.unrealizedPnl),
    }
  })
}

/** Runs fn over items with bounded concurrency; failed items are dropped (logged). */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  let nextIndex = 0
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      const item = items[index]
      if (item === undefined) continue
      try {
        results.push(await fn(item))
      } catch (error) {
        console.error(`skip item ${index}: ${error instanceof Error ? error.message : error}`)
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}
