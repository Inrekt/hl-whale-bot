// SnapshotService: keeps a periodically refreshed whale snapshot in memory.
// Mirrors the reference bot's "обновлено N мин назад" freshness model.

import { fetchLeaderboard, type LeaderboardRow } from './hl.js'
import { buildSnapshot, pickUniverse, rankedCoins, type Snapshot } from './scan.js'

const SNAPSHOT_REFRESH_MS = 4 * 60_000
const LEADERBOARD_REFRESH_MS = 6 * 60 * 60_000
const TOP_COINS_COUNT = 20
const MIN_COIN_WALLETS = 3

export class SnapshotService {
  private snapshot: Snapshot | null = null
  private leaderboard: LeaderboardRow[] = []
  private universe: string[] = []
  private leaderboardFetchedAt = 0
  private refreshing: Promise<void> | null = null
  private timer: NodeJS.Timeout | null = null

  /**
   * Запускает первый скан и периодическое обновление. Промис первого скана
   * возвращается, но ждать его не обязательно: таймер уже заведён, поэтому
   * упавший первый скан не оставит сервис без данных навсегда.
   */
  start(): Promise<void> {
    this.timer = setInterval(() => {
      void this.refresh().catch((error) => console.error('snapshot refresh failed:', error))
    }, SNAPSHOT_REFRESH_MS)
    return this.refresh()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  /** Refresh once; concurrent callers share the same in-flight refresh. */
  async refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing
    this.refreshing = this.doRefresh().finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  private async doRefresh(): Promise<void> {
    const now = Date.now()
    if (now - this.leaderboardFetchedAt > LEADERBOARD_REFRESH_MS) {
      this.leaderboard = await fetchLeaderboard()
      this.universe = pickUniverse(this.leaderboard)
      this.leaderboardFetchedAt = now
    }
    this.snapshot = await buildSnapshot(this.universe)
    console.log(`snapshot: ${this.snapshot.positions.length} positions ≥$1M from ${this.universe.length} wallets`)
  }

  current(): Snapshot {
    if (!this.snapshot) throw new Error('snapshot not ready yet')
    return this.snapshot
  }

  isReady(): boolean {
    return this.snapshot !== null
  }

  /** Top coins by whale notional — drives the dynamic coin buttons. */
  topCoins(): string[] {
    return rankedCoins(this.current(), MIN_COIN_WALLETS).slice(0, TOP_COINS_COUNT)
  }

  leaderboardRows(): LeaderboardRow[] {
    return this.leaderboard
  }

  ageMinutes(): number {
    return Math.max(0, Math.round((Date.now() - Date.parse(this.current().takenAt)) / 60_000))
  }
}
