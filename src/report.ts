// Daily / on-demand PDF report: same data core, print-friendly layout.
// Filename mirrors the reference bot: HL_whales_YYYY-MM-DD_HHMM.pdf (MSK time).

import { REPORT_FONT_FACES } from './render/cards.js'
import type { Snapshot } from './scan.js'
import { MIN_POSITION_USD, coinSkews, skewPercent, topPositions, totalLongUsd, totalShortUsd } from './scan.js'
import { priceCompact, shortAddress, signedUsd, usdCompact } from './format.js'

const REPORT_TOP_ROWS = 20
const MSK_OFFSET_MS = 3 * 60 * 60_000

export function mskNow(): Date {
  return new Date(Date.now() + MSK_OFFSET_MS)
}

export function mskDateStamp(date: Date = mskNow()): string {
  return date.toISOString().slice(0, 10)
}

export function reportFileName(date: Date = mskNow()): string {
  const hhmm = date.toISOString().slice(11, 16).replace(':', '')
  return `HL_whales_${mskDateStamp(date)}_${hhmm}.pdf`
}

/** Caption under the PDF message — copied format of the reference bot. */
export function reportCaption(snapshot: Snapshot): string {
  const skew = skewPercent(totalLongUsd(snapshot), totalShortUsd(snapshot))
  const side = skew >= 0 ? '🔴 ШОРТ' : '🟢 ЛОНГ'
  const topCoins = coinSkews(snapshot)
    .slice(0, 3)
    .map((c) => c.coin)
    .join(', ')
  return [
    '🐳 Китовый отчёт · Hyperliquid',
    `Перекос: ${side} ${Math.abs(skew)}% · ${snapshot.positions.length} позиций ≥ ${usdCompact(MIN_POSITION_USD)}`,
    `Топ-монеты: ${topCoins}`,
  ].join('\n')
}

export function reportHtml(snapshot: Snapshot): string {
  const longUsd = totalLongUsd(snapshot)
  const shortUsd = totalShortUsd(snapshot)
  const skew = skewPercent(longUsd, shortUsd)
  const generatedAt = mskNow().toISOString().slice(0, 16).replace('T', ' ')

  const rows = topPositions(snapshot, null, REPORT_TOP_ROWS)
    .map(
      (p, i) => `<tr>
        <td>${i + 1}</td><td><b>${p.coin}</b></td>
        <td class="${p.isLong ? 'pos' : 'neg'}">${p.isLong ? 'LONG' : 'SHORT'}</td>
        <td>${p.leverage}x</td><td>${priceCompact(p.entryPx)}</td>
        <td>${p.liquidationPx === null ? '—' : priceCompact(p.liquidationPx)}</td>
        <td class="mono">${shortAddress(p.address)}</td>
        <td><b>${usdCompact(p.sizeUsd)}</b></td>
        <td class="${p.unrealizedPnl >= 0 ? 'pos' : 'neg'}">${signedUsd(p.unrealizedPnl)}</td>
      </tr>`,
    )
    .join('')

  const coins = coinSkews(snapshot)
    .slice(0, 10)
    .map((c) => {
      const coinSkew = skewPercent(c.longUsd, c.shortUsd)
      return `<tr><td><b>${c.coin}</b></td>
        <td>${usdCompact(c.longUsd)}</td><td>${usdCompact(c.shortUsd)}</td>
        <td class="${coinSkew >= 0 ? 'neg' : 'pos'}">${coinSkew >= 0 ? 'ШОРТ' : 'ЛОНГ'} ${Math.abs(coinSkew)}%</td></tr>`
    })
    .join('')

  // Печатная версия того же блоттера: светлый лист, но та же типографика,
  // те же приглушённые цвета сторон и те же табличные цифры, что в карточках.
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${REPORT_FONT_FACES}
    body { font-family: 'Golos', sans-serif; color: #14181F; font-size: 10.5px; padding: 4px 2px; }
    .eyebrow { font-family: 'Plex', monospace; font-size: 8.5px; letter-spacing: 1.6px;
      text-transform: uppercase; color: #9A7B2E; }
    h1 { font-size: 21px; letter-spacing: -.4px; margin: 3px 0 3px; }
    .sub { font-family: 'Plex', monospace; color: #5C6675; margin-bottom: 16px; font-size: 9.5px; }
    h2 { font-family: 'Plex', monospace; font-size: 9px; letter-spacing: 1.6px; text-transform: uppercase;
      color: #9A7B2E; font-weight: 600; margin: 18px 0 6px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 6px 6px; text-align: left; border-bottom: 1px solid #E6E3DC; }
    th { font-family: 'Plex', monospace; font-size: 8.5px; text-transform: uppercase;
      letter-spacing: .8px; color: #7C8595; border-bottom: 1px solid #14181F; font-weight: 500; }
    td { font-variant-numeric: tabular-nums; }
    .pos { color: #2F7D63; font-weight: 600; } .neg { color: #A94E3D; font-weight: 600; }
    .mono { font-family: 'Plex', monospace; font-size: 9.5px; font-variant-numeric: tabular-nums; }
    b, strong { font-weight: 600; }
    .footer { font-family: 'Plex', monospace; margin-top: 20px; color: #98A1AF; font-size: 8.5px; }
  </style></head><body>
    <div class="eyebrow">Hyperliquid · умные деньги</div>
    <h1>Китовый отчёт</h1>
    <div class="sub">${generatedAt} МСК · ${snapshot.scannedWallets} кошельков · ${snapshot.positions.length} позиций ≥ ${usdCompact(MIN_POSITION_USD)} ·
      перекос: <b>${skew >= 0 ? 'ШОРТ' : 'ЛОНГ'} ${Math.abs(skew)}%</b> · лонги ${usdCompact(longUsd)} · шорты ${usdCompact(shortUsd)}</div>
    <h2>Топ-${REPORT_TOP_ROWS} позиций</h2>
    <table><tr><th>#</th><th>Монета</th><th>Сторона</th><th>Плечо</th><th>Вход</th><th>Ликв.</th><th>Кошелёк</th><th>Размер</th><th>uPnL</th></tr>${rows}</table>
    <h2>Перекос по монетам</h2>
    <table><tr><th>Монета</th><th>Лонги</th><th>Шорты</th><th>Перекос</th></tr>${coins}</table>
    <div class="footer">Hyperliquid public API · не инвест-рекомендация</div>
  </body></html>`
}
