// Карточки китов: «биржевой блоттер» — дисциплина торгового терминала
// (моноширинные табличные цифры, хайрлайны, выровненные колонки) в сдержанной
// тёмной подаче. Цветом говорит только направление сделки; прибыль показана
// знаком и стрелкой, иначе строка «шорт с прибылью» читается противоречиво.
// Подпись карточки — шкала «до ликвидации»: у кого позиция ближе к обрыву.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { liquidationDistance, type LeaderboardRow, type WhalePosition } from '../hl.js'
import { EMPTY_DELTA, formatDelta, type SkewDelta } from '../history.js'
import { biggestCluster, liquidationMap, type LiquidationLevel } from '../liquidation.js'
import { whaleName } from '../whales.js'
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
const SENTIMENT_COIN_ROWS = 8

// Палитра: чернильная бездна вместо «просто тёмного», тёплый айвори для текста
// (ощущение печатного листа, а не подсвеченного экрана), приглушённые
// сине-зелёный и глиняный вместо светофорных красного с зелёным, латунь на акценты.
const ABYSS = '#0A0D12'
const SLAB = '#10141B'
const RULE = '#1C2330'
const IVORY = '#E9E6DF'
const MUTE_TEXT = '#7C8595'
const BRASS = '#D6B26A'
const LONG = '#4FA88B'
const SHORT = '#C4634F'

const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../assets/fonts')

function fontFace(family: string, file: string, weight: number): string {
  const data = readFileSync(join(FONTS_DIR, file)).toString('base64')
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};
    src:url(data:font/woff2;base64,${data}) format('woff2');}`
}

// Шрифты вшиты в страницу: рендер идёт в CI без сети, а системные шрифты там
// другие — без этого карточка поехала бы вёрсткой.
const FONT_FACES = [
  fontFace('Golos', 'golos-text-cyrillic-400-normal.woff2', 400),
  fontFace('Golos', 'golos-text-latin-400-normal.woff2', 400),
  fontFace('Golos', 'golos-text-cyrillic-600-normal.woff2', 600),
  fontFace('Golos', 'golos-text-latin-600-normal.woff2', 600),
  fontFace('Golos', 'golos-text-cyrillic-700-normal.woff2', 700),
  fontFace('Golos', 'golos-text-latin-700-normal.woff2', 700),
  fontFace('Plex', 'ibm-plex-mono-cyrillic-400-normal.woff2', 400),
  fontFace('Plex', 'ibm-plex-mono-latin-400-normal.woff2', 400),
  fontFace('Plex', 'ibm-plex-mono-cyrillic-500-normal.woff2', 500),
  fontFace('Plex', 'ibm-plex-mono-latin-500-normal.woff2', 500),
  fontFace('Plex', 'ibm-plex-mono-latin-600-normal.woff2', 600),
  fontFace('Plex', 'ibm-plex-mono-cyrillic-600-normal.woff2', 600),
].join('')

/** Те же вшитые шрифты для PDF-отчёта — чтобы печатная версия не разъезжалась с карточками. */
export const REPORT_FONT_FACES = FONT_FACES

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function page(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${FONT_FACES}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: transparent; }
  #card {
    width: 560px; background: ${ABYSS}; border-radius: 18px; padding: 26px 24px 16px;
    color: ${IVORY}; font-family: 'Golos', sans-serif; -webkit-font-smoothing: antialiased;
  }
  .num { font-family: 'Plex', monospace; font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1; }

  .eyebrow { font-family: 'Plex', monospace; font-size: 10px; letter-spacing: 1.6px;
    text-transform: uppercase; color: ${BRASS}; }
  .title { font-size: 25px; font-weight: 700; letter-spacing: -.4px; margin-top: 5px; }
  .meta { font-family: 'Plex', monospace; font-size: 10.5px; color: ${MUTE_TEXT};
    margin-top: 6px; letter-spacing: .2px; }
  .hr { height: 1px; background: ${RULE}; margin: 16px 0 4px; }

  /* Строка позиции: слева рейл направления. Разделитель строк сам работает
     шкалой — его длина пропорциональна размеру позиции, так что доминирование
     видно боковым зрением, без чтения цифр. */
  .row { position: relative; display: flex; align-items: center; gap: 12px;
    padding: 11px 12px 11px 14px; border-bottom: 1px solid ${RULE}; overflow: hidden; }
  .row:last-of-type { border-bottom: none; }
  .mag { position: absolute; left: 0; bottom: -1px; height: 2px; opacity: .55; }
  .rail { position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px; border-radius: 2px; }
  .rank { position: relative; font-family: 'Plex', monospace; font-size: 11px;
    color: ${MUTE_TEXT}; width: 16px; }
  .mid { position: relative; flex: 1; min-width: 0; }
  .head { display: flex; align-items: baseline; gap: 8px; }
  .coin { font-size: 17px; font-weight: 700; letter-spacing: -.2px; }
  .side { font-family: 'Plex', monospace; font-size: 10px; font-weight: 600; letter-spacing: 1px; }
  .lev { font-family: 'Plex', monospace; font-size: 10px; color: ${MUTE_TEXT}; }
  .sub { font-family: 'Plex', monospace; font-size: 10.5px; color: ${MUTE_TEXT}; margin-top: 4px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .right { position: relative; text-align: right; }
  .size { font-family: 'Plex', monospace; font-size: 16px; font-weight: 600; letter-spacing: -.3px; }
  .pnl { font-family: 'Plex', monospace; font-size: 10.5px; color: ${MUTE_TEXT}; margin-top: 4px; }

  /* Подпись карточки: запас хода до ликвидации. */
  .liq { margin-left: 8px; }
  .who { color: ${IVORY}; opacity: .82; }
  .delta { font-family: 'Plex', monospace; font-size: 11px; color: ${MUTE_TEXT}; margin-left: 9px; }
  .cdelta { width: 46px; text-align: right; font-family: 'Plex', monospace; font-size: 10.5px; color: ${MUTE_TEXT}; }

  /* Карта ликвидаций: лестница уровней от текущей цены вверх и вниз. */
  .mark { display: flex; align-items: center; gap: 10px; margin: 16px 0 2px; }
  .markpx { font-family: 'Plex', monospace; font-size: 15px; font-weight: 600; }
  .marklabel { font-family: 'Plex', monospace; font-size: 10px; letter-spacing: 1.4px;
    text-transform: uppercase; color: ${MUTE_TEXT}; }
  .lvl { display: flex; align-items: center; gap: 10px; padding: 7px 2px; border-bottom: 1px solid ${RULE}; }
  .lvl:last-of-type { border-bottom: none; }
  .lvlpx { width: 86px; font-family: 'Plex', monospace; font-size: 12px; }
  .lvlbar { flex: 1; height: 7px; background: ${RULE}; border-radius: 4px; overflow: hidden; }
  .lvlbar i { display: block; height: 100%; }
  .lvlusd { width: 74px; text-align: right; font-family: 'Plex', monospace; font-size: 11.5px; }
  .lvlwho { width: 62px; text-align: right; font-family: 'Plex', monospace; font-size: 10px; color: ${MUTE_TEXT}; }
  .note { font-size: 13px; line-height: 1.45; color: ${IVORY}; opacity: .9; margin-top: 14px; }
  .note b { color: ${BRASS}; font-weight: 600; }

  .skew { display: flex; align-items: baseline; justify-content: space-between; margin-top: 14px; }
  .skewbig { font-size: 30px; font-weight: 700; letter-spacing: -1px; }
  .skewlabel { font-family: 'Plex', monospace; font-size: 10px; letter-spacing: 1.4px;
    text-transform: uppercase; color: ${MUTE_TEXT}; }
  .split { display: flex; height: 6px; border-radius: 3px; overflow: hidden; margin-top: 10px; background: ${RULE}; }
  .split i { display: block; height: 100%; }
  .legend { display: flex; justify-content: space-between; font-family: 'Plex', monospace;
    font-size: 10.5px; color: ${MUTE_TEXT}; margin-top: 7px; }

  .coinrow { display: flex; align-items: center; gap: 12px; padding: 9px 2px; border-bottom: 1px solid ${RULE}; }
  .coinrow:last-of-type { border-bottom: none; }
  .cname { width: 74px; font-size: 14px; font-weight: 600; }
  .cbar { position: relative; flex: 1; height: 6px; }
  .cbar .track { position: absolute; left: 0; top: 0; height: 100%; border-radius: 3px; overflow: hidden; display: flex; }
  .cbar i { display: block; height: 100%; }
  .cval { width: 82px; text-align: right; font-family: 'Plex', monospace; font-size: 11.5px; color: ${MUTE_TEXT}; }

  .section { font-family: 'Plex', monospace; font-size: 10px; letter-spacing: 1.6px;
    text-transform: uppercase; color: ${BRASS}; margin: 20px 0 6px; }
  .footer { font-family: 'Plex', monospace; text-align: center; font-size: 9.5px;
    color: #4C5666; margin-top: 18px; letter-spacing: .3px; }
  </style></head><body><div id="card">${body}</div></body></html>`
}

function head(eyebrow: string, title: string, meta: string): string {
  return `<div class="eyebrow">${escapeHtml(eyebrow)}</div>
    <div class="title">${title}</div>
    <div class="meta">${escapeHtml(meta)}</div>`
}

/**
 * Метка появляется, только когда ликвидация реально близко: у большинства
 * позиций она за горизонтом, и «99+%» в каждой строке был бы шумом.
 */
const LIQUIDATION_ALARM = 0.4

function liquidationChip(position: WhalePosition): string {
  const distance = liquidationDistance(position)
  if (distance === null || distance >= LIQUIDATION_ALARM) return ''
  const color = distance < 0.1 ? SHORT : BRASS
  return `<span class="liq" style="color:${color}">до ликв. ${Math.round(distance * 100)}%</span>`
}

function positionRow(position: WhalePosition, index: number, maxSizeUsd: number): string {
  const color = position.isLong ? LONG : SHORT
  const magnitude = maxSizeUsd === 0 ? 0 : Math.round((position.sizeUsd / maxSizeUsd) * 100)
  const arrow = position.unrealizedPnl >= 0 ? '▲' : '▼'
  return `<div class="row">
    <div class="mag" style="width:${magnitude}%;background:${color}"></div>
    <div class="rail" style="background:${color}"></div>
    <div class="rank num">${index + 1}</div>
    <div class="mid">
      <div class="head">
        <span class="coin">${escapeHtml(position.coin)}</span>
        <span class="side" style="color:${color}">${position.isLong ? 'LONG' : 'SHORT'}</span>
        <span class="lev">${position.leverage}×</span>
      </div>
      <div class="sub"><span class="who">${escapeHtml(whaleName(position.address))}</span> ${shortAddress(position.address)} · вход ${priceCompact(position.entryPx)}${liquidationChip(position)}</div>
    </div>
    <div class="right">
      <div class="size">${usdCompact(position.sizeUsd)}</div>
      <div class="pnl">${arrow} ${signedUsd(position.unrealizedPnl)}</div>
    </div>
  </div>`
}

function skewBlock(longUsd: number, shortUsd: number, positionsCount: number, delta: number | null): string {
  const skew = skewPercent(longUsd, shortUsd)
  const shorted = skew >= 0
  const total = longUsd + shortUsd
  const longShare = total === 0 ? 50 : (longUsd / total) * 100
  const move = formatDelta(delta)
  return `<div class="skew">
      <div class="skewbig" style="color:${shorted ? SHORT : LONG}">${shorted ? 'ШОРТ' : 'ЛОНГ'} ${Math.abs(skew)}%<span class="delta">${move ? `${move} за сутки` : ''}</span></div>
      <div class="skewlabel num">${positionsCount} поз.</div>
    </div>
    <div class="split"><i style="width:${longShare}%;background:${LONG}"></i><i style="width:${100 - longShare}%;background:${SHORT}"></i></div>
    <div class="legend"><span>лонги ${usdCompact(longUsd)}</span><span>шорты ${usdCompact(shortUsd)}</span></div>`
}

const footer = `<div class="footer">Hyperliquid public API · не инвест-рекомендация</div>`

function freshness(ageMinutes: number): string {
  return ageMinutes < 1 ? 'обновлено только что' : `обновлено ${ageMinutes} мин назад`
}

function rowsHtml(positions: readonly WhalePosition[]): string {
  const max = positions[0]?.sizeUsd ?? 0
  return positions.map((position, index) => positionRow(position, index, max)).join('')
}

export function topWhalesCardHtml(snapshot: Snapshot, ageMinutes: number): string {
  const positions = topPositions(snapshot, null, TOP_ROWS)
  return page(`${head('Hyperliquid · крупнейшие позиции', 'Топ китов', `${freshness(ageMinutes)} · от ${usdCompact(MIN_POSITION_USD)}`)}
    <div class="hr"></div>${rowsHtml(positions)}${footer}`)
}

export function coinCardHtml(snapshot: Snapshot, coin: string, ageMinutes: number, delta: SkewDelta = EMPTY_DELTA): string {
  const coinPositions = snapshot.positions.filter((p) => p.coin === coin)
  const longUsd = coinPositions.filter((p) => p.isLong).reduce((sum, p) => sum + p.sizeUsd, 0)
  const shortUsd = coinPositions.filter((p) => !p.isLong).reduce((sum, p) => sum + p.sizeUsd, 0)
  const wallets = new Set(coinPositions.map((p) => p.address)).size
  return page(`${head(`Hyperliquid · ${coin}`, `${escapeHtml(coin)} · киты`, `${freshness(ageMinutes)} · ${wallets} китов`)}
    ${skewBlock(longUsd, shortUsd, coinPositions.length, delta.byCoin[coin] ?? null)}
    <div class="hr"></div>${rowsHtml(coinPositions.slice(0, TOP_ROWS))}${footer}`)
}

export function sentimentCardHtml(snapshot: Snapshot, ageMinutes: number, delta: SkewDelta = EMPTY_DELTA): string {
  const longUsd = totalLongUsd(snapshot)
  const shortUsd = totalShortUsd(snapshot)
  const skews = coinSkews(snapshot).slice(0, SENTIMENT_COIN_ROWS)
  const widest = skews[0] ? skews[0].longUsd + skews[0].shortUsd : 0
  // Ширина полосы = размер книги по монете, заливка внутри = соотношение сторон.
  // Одинаковые полосы у ETH за $500M и XRP за $13M врали бы о значимости.
  const coinRows = skews
    .map(({ coin, longUsd: cl, shortUsd: cs }) => {
      const total = cl + cs
      const width = widest === 0 ? 0 : Math.max(6, (total / widest) * 100)
      const longShare = total === 0 ? 50 : (cl / total) * 100
      return `<div class="coinrow">
        <div class="cname">${escapeHtml(coin)}</div>
        <div class="cbar"><div class="track" style="width:${width}%">
          <i style="width:${longShare}%;background:${LONG}"></i><i style="width:${100 - longShare}%;background:${SHORT}"></i>
        </div></div>
        <div class="cval">${usdCompact(total)}</div>
        <div class="cdelta">${formatDelta(delta.byCoin[coin])}</div>
      </div>`
    })
    .join('')
  return page(`${head('Hyperliquid · умные деньги', 'Настроение', `${freshness(ageMinutes)} · ${snapshot.positions.length} позиций от ${usdCompact(MIN_POSITION_USD)}`)}
    ${skewBlock(longUsd, shortUsd, snapshot.positions.length, delta.overall)}
    <div class="section">Перекос по монетам</div>${coinRows}${footer}`)
}

export function leaderboardCardHtml(rows: readonly LeaderboardRow[]): string {
  const allTime = [...rows].sort((a, b) => b.allTimePnl - a.allTimePnl).slice(0, LEADERBOARD_ALL_TIME_ROWS)
  const day = [...rows].sort((a, b) => b.dayPnl - a.dayPnl).slice(0, LEADERBOARD_DAY_ROWS)
  const best = allTime[0]?.allTimePnl ?? 0
  const renderRow = (row: LeaderboardRow, index: number, pnl: number, scale: number): string => {
    const magnitude = scale === 0 ? 0 : Math.max(2, Math.round((Math.abs(pnl) / scale) * 100))
    return `<div class="row">
      <div class="mag" style="width:${magnitude}%;background:${pnl >= 0 ? LONG : SHORT}"></div>
      <div class="rail" style="background:${pnl >= 0 ? LONG : SHORT}"></div>
      <div class="rank num">${index + 1}</div>
      <div class="mid">
        <div class="head"><span class="coin num" style="font-size:14px">${shortAddress(row.address)}</span></div>
        <div class="sub">депозит ${usdCompact(row.accountValue)}</div>
      </div>
      <div class="right"><div class="size" style="color:${pnl >= 0 ? LONG : SHORT}">${signedUsd(pnl)}</div></div>
    </div>`
  }
  const dayBest = day[0]?.dayPnl ?? 0
  return page(`${head('Hyperliquid · рейтинг по прибыли', 'Лучшие трейдеры', 'кто заработал больше всех')}
    <div class="section">За всё время</div>
    ${allTime.map((row, index) => renderRow(row, index, row.allTimePnl, best)).join('')}
    <div class="section">За сутки</div>
    ${day.map((row, index) => renderRow(row, index, row.dayPnl, dayBest)).join('')}${footer}`)
}

/**
 * Карта ликвидаций: где стоят принудительные закрытия китов. Уровни, на которых
 * скопились крупные суммы, работают магнитом — вынос одного кита двигает цену
 * дальше и цепляет следующих, поэтому именно туда рынок и тянет.
 */
export function liquidationCardHtml(snapshot: Snapshot, coin: string, ageMinutes: number): string {
  const positions = snapshot.positions.filter((p) => p.coin === coin)
  const map = liquidationMap(positions)
  const meta = `${freshness(ageMinutes)} · ${positions.length} позиций`
  if (!map) {
    return page(`${head(`Hyperliquid · ${coin}`, `${escapeHtml(coin)} · ликвидации`, meta)}
      <div class="note">Рядом с текущей ценой скоплений нет: ликвидации китов дальше 60% хода,
      то есть каскад отсюда не начнётся.</div>${footer}`)
  }

  const widest = Math.max(...[...map.above, ...map.below].map((level) => level.usd))
  const levelRow = (level: LiquidationLevel): string => {
    const color = level.isLong ? LONG : SHORT
    const width = widest === 0 ? 0 : Math.max(4, (level.usd / widest) * 100)
    return `<div class="lvl">
      <div class="lvlpx">${priceCompact(level.price)}</div>
      <div class="lvlbar"><i style="width:${width}%;background:${color}"></i></div>
      <div class="lvlusd" style="color:${color}">${usdCompact(level.usd)}</div>
      <div class="lvlwho">${level.wallets} кит${level.wallets === 1 ? '' : level.wallets < 5 ? 'а' : 'ов'}</div>
    </div>`
  }

  const magnet = biggestCluster(map)
  const note = magnet
    ? `<div class="note">Сильнее всего тянет к <b>${priceCompact(magnet.price)}</b> — это
       ${Math.round(magnet.distance * 100)}% хода ${magnet.isLong ? 'вниз' : 'вверх'}, там вынесет
       <b>${usdCompact(magnet.usd)}</b> ${magnet.isLong ? 'лонгов' : 'шортов'} у ${magnet.wallets}
       ${magnet.wallets === 1 ? 'кита' : 'китов'}.</div>`
    : ''

  return page(`${head(`Hyperliquid · ${coin}`, `${escapeHtml(coin)} · ликвидации`, meta)}
    <div class="mark"><div class="markpx">${priceCompact(map.markPx)}</div>
      <div class="marklabel">цена сейчас · всего под ударом ${usdCompact(map.totalUsd)}</div></div>
    ${map.above.length > 0 ? `<div class="section">Выше — вынесет шорты</div>${[...map.above].reverse().map(levelRow).join('')}` : ''}
    ${map.below.length > 0 ? `<div class="section">Ниже — вынесет лонги</div>${map.below.map(levelRow).join('')}` : ''}
    ${note}${footer}`)
}
