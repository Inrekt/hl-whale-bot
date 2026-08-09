// HTML templates for the four card types, replicated from reference screenshots:
// dark navy canvas, rounded rows, LONG/SHORT pills, long/short skew bar,
// footer "Hyperliquid public API · не инвест-рекомендация".

import type { LeaderboardRow, WhalePosition } from '../hl.js'
import { priceCompact, shortAddress, signedUsd, usdCompact } from '../format.js'
import {
  MIN_POSITION_USD,
  coinSkews,
  skewPercent,
  topPositions,
  totalLongUsd,
  totalShortUsd,
  type Snapshot,
} from '../scan.js'

const TOP_ROWS = 10
const LEADERBOARD_ALL_TIME_ROWS = 8
const LEADERBOARD_DAY_ROWS = 6

const GREEN = '#2ea043'
const RED = '#f04438'
const CANVAS = '#0b0f16'
const ROW_BG = '#141a24'
const TEXT_DIM = '#8b96a5'

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function page(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: transparent; font-family: -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Color Emoji', sans-serif; }
  #card { width: 520px; background: ${CANVAS}; border-radius: 16px; padding: 22px 20px 14px; color: #e6edf3; }
  .title { font-size: 21px; font-weight: 800; }
  .title .accent { color: #e3b341; }
  .subtitle { font-size: 12.5px; color: ${TEXT_DIM}; margin-top: 5px; }
  .row { display: flex; align-items: center; background: ${ROW_BG}; border-radius: 12px; padding: 10px 12px; margin-top: 8px; }
  .rank { width: 22px; font-size: 13px; color: ${TEXT_DIM}; }
  .dot { width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; flex: none; }
  .mid { flex: 1; min-width: 0; }
  .coinline { display: flex; align-items: center; gap: 7px; font-size: 15px; font-weight: 700; }
  .pill { font-size: 10px; font-weight: 800; letter-spacing: .4px; border-radius: 6px; padding: 2px 7px; }
  .pill.long { background: rgba(46,160,67,.18); color: #3fb950; }
  .pill.short { background: rgba(240,68,56,.18); color: #ff6b62; }
  .detail { font-size: 11.5px; color: ${TEXT_DIM}; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .right { text-align: right; margin-left: 10px; }
  .size { font-size: 15.5px; font-weight: 800; }
  .pnl { font-size: 11.5px; font-weight: 700; margin-top: 3px; }
  .pos { color: #3fb950; } .neg { color: #ff6b62; }
  .bar { display: flex; height: 8px; border-radius: 5px; overflow: hidden; margin-top: 10px; }
  .bar .l { background: ${GREEN}; } .bar .s { background: ${RED}; }
  .totals { display: flex; gap: 14px; font-size: 12.5px; color: ${TEXT_DIM}; margin-top: 7px; }
  .skewline { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 700; margin-top: 14px; }
  .section { font-size: 14px; font-weight: 800; margin: 16px 0 2px; color: #e3b341; }
  .footer { text-align: center; font-size: 10.5px; color: #55606e; margin-top: 14px; }
  </style></head><body><div id="card">${body}</div></body></html>`
}

function sideDot(isLong: boolean): string {
  return `<span class="dot" style="background:${isLong ? GREEN : RED}"></span>`
}

function positionRow(position: WhalePosition, index: number): string {
  const side = position.isLong ? 'long' : 'short'
  const liq = position.liquidationPx === null ? '—' : priceCompact(position.liquidationPx)
  const pnlClass = position.unrealizedPnl >= 0 ? 'pos' : 'neg'
  return `<div class="row">
    <div class="rank">${index + 1}</div>${sideDot(position.isLong)}
    <div class="mid">
      <div class="coinline">${escapeHtml(position.coin)} <span class="pill ${side}">${side.toUpperCase()}</span></div>
      <div class="detail">${position.leverage}x · вход ${priceCompact(position.entryPx)} · ликв ${liq} · ${shortAddress(position.address)}</div>
    </div>
    <div class="right">
      <div class="size">${usdCompact(position.sizeUsd)}</div>
      <div class="pnl ${pnlClass}">uPnL ${signedUsd(position.unrealizedPnl)}</div>
    </div>
  </div>`
}

function skewHeader(longUsd: number, shortUsd: number, positionsCount: number): string {
  const skew = skewPercent(longUsd, shortUsd)
  const side = skew >= 0 ? 'ШОРТ' : 'ЛОНГ'
  const total = longUsd + shortUsd
  const longShare = total === 0 ? 50 : Math.round((longUsd / total) * 100)
  return `<div class="skewline"><span class="dot" style="background:${skew >= 0 ? RED : GREEN}"></span>
      ${side} перевес <b>&nbsp;${Math.abs(skew)}%</b>&nbsp;· ${positionsCount} поз.</div>
    <div class="bar"><div class="l" style="width:${longShare}%"></div><div class="s" style="width:${100 - longShare}%"></div></div>
    <div class="totals"><span>🟢 ${usdCompact(longUsd)}</span><span>🔴 ${usdCompact(shortUsd)}</span></div>`
}

const footer = `<div class="footer">Hyperliquid public API · не инвест-рекомендация</div>`

function freshness(ageMinutes: number): string {
  return ageMinutes < 1 ? 'обновлено только что' : `обновлено ${ageMinutes} мин назад`
}

export function topWhalesCardHtml(snapshot: Snapshot, ageMinutes: number): string {
  const rows = topPositions(snapshot, null, TOP_ROWS).map(positionRow).join('')
  return page(`<div class="title">🐳 Топ китов · <span class="accent">Hyperliquid</span></div>
    <div class="subtitle">${freshness(ageMinutes)} · позиции ≥ ${usdCompact(MIN_POSITION_USD)}</div>${rows}${footer}`)
}

export function coinCardHtml(snapshot: Snapshot, coin: string, ageMinutes: number): string {
  const coinPositions = snapshot.positions.filter((p) => p.coin === coin)
  const longUsd = coinPositions.filter((p) => p.isLong).reduce((sum, p) => sum + p.sizeUsd, 0)
  const shortUsd = coinPositions.filter((p) => !p.isLong).reduce((sum, p) => sum + p.sizeUsd, 0)
  const rows = coinPositions.slice(0, TOP_ROWS).map(positionRow).join('')
  return page(`<div class="title">🔎 ${escapeHtml(coin)} · <span class="accent">киты</span></div>
    <div class="subtitle">${freshness(ageMinutes)}</div>
    ${skewHeader(longUsd, shortUsd, coinPositions.length)}${rows}${footer}`)
}

export function sentimentCardHtml(snapshot: Snapshot, ageMinutes: number): string {
  const longUsd = totalLongUsd(snapshot)
  const shortUsd = totalShortUsd(snapshot)
  const coinRows = coinSkews(snapshot)
    .slice(0, 7)
    .map(({ coin, longUsd: cl, shortUsd: cs }) => {
      const total = cl + cs
      const longShare = total === 0 ? 50 : Math.round((cl / total) * 100)
      const skew = skewPercent(cl, cs)
      return `<div class="row" style="gap:10px">
        <div style="width:52px;font-weight:800;font-size:13px">${escapeHtml(coin)}</div>
        <div class="bar" style="flex:1;margin-top:0"><div class="l" style="width:${longShare}%"></div><div class="s" style="width:${100 - longShare}%"></div></div>
        <div style="width:86px;text-align:right;font-size:12px" class="${skew >= 0 ? 'neg' : 'pos'}">● ${usdCompact(total)}</div>
      </div>`
    })
    .join('')
  return page(`<div class="title">📊 Настроение · <span class="accent">умные деньги</span></div>
    <div class="subtitle">${freshness(ageMinutes)} · ${snapshot.positions.length} позиций ≥ ${usdCompact(MIN_POSITION_USD)}</div>
    ${skewHeader(longUsd, shortUsd, snapshot.positions.length)}
    <div class="section">Перекос по монетам</div>${coinRows}${footer}`)
}

export function leaderboardCardHtml(rows: readonly LeaderboardRow[]): string {
  const allTime = [...rows].sort((a, b) => b.allTimePnl - a.allTimePnl).slice(0, LEADERBOARD_ALL_TIME_ROWS)
  const day = [...rows].sort((a, b) => b.dayPnl - a.dayPnl).slice(0, LEADERBOARD_DAY_ROWS)
  const renderRow = (row: LeaderboardRow, index: number, pnl: number): string => `<div class="row">
      <div class="rank">${index + 1}</div>
      <div class="mid">
        <div class="coinline" style="font-size:13.5px;color:#e3b341">${shortAddress(row.address)}</div>
        <div class="detail">депозит ${usdCompact(row.accountValue)}</div>
      </div>
      <div class="right"><div class="size pos" style="font-size:14px">${usdCompact(pnl)}</div></div>
    </div>`
  return page(`<div class="title">🏆 Лидерборд · <span class="accent">Hyperliquid</span></div>
    <div class="subtitle">лучшие трейдеры по прибыли</div>
    <div class="section">За всё время</div>${allTime.map((r, i) => renderRow(r, i, r.allTimePnl)).join('')}
    <div class="section">За сутки</div>${day.map((r, i) => renderRow(r, i, r.dayPnl)).join('')}${footer}`)
}
