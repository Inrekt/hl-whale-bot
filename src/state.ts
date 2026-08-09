// Persistent state: plain JSON files in state/ (a git worktree of the `state`
// branch in CI; a local folder in dev). Code never touches git — scripts/push-state.sh does.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WhalePosition } from './hl.js'

const STATE_DIR = process.env.STATE_DIR ?? 'state'

export interface StoredWatchPosition {
  readonly coin: string
  readonly isLong: boolean
  readonly sizeUsd: number
  readonly leverage: number
  readonly entryPx: number
}

export interface BotState {
  /** telegram user id the bot answers to; claimed by the first user who writes */
  ownerId: number | null
  /** chat ids subscribed to the daily report */
  subscribers: number[]
  /** chat id → tracked wallet addresses */
  watchlists: Record<string, string[]>
  /** wallet address → last seen positions (for alert diffing) */
  watchPositions: Record<string, StoredWatchPosition[]>
  /** YYYY-MM-DD (MSK) of the last daily report that was sent */
  lastDailyReport: string
}

const EMPTY_STATE: BotState = {
  ownerId: null,
  subscribers: [],
  watchlists: {},
  watchPositions: {},
  lastDailyReport: '',
}

const stateFilePath = (): string => join(STATE_DIR, 'bot-state.json')

export async function loadState(): Promise<BotState> {
  try {
    const raw = JSON.parse(await readFile(stateFilePath(), 'utf8')) as Partial<BotState>
    return { ...EMPTY_STATE, ...raw }
  } catch {
    return { ...EMPTY_STATE }
  }
}

export async function saveState(state: BotState): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true })
  await writeFile(stateFilePath(), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

export function toStoredPositions(positions: readonly WhalePosition[]): StoredWatchPosition[] {
  return positions.map((p) => ({
    coin: p.coin,
    isLong: p.isLong,
    sizeUsd: p.sizeUsd,
    leverage: p.leverage,
    entryPx: p.entryPx,
  }))
}
