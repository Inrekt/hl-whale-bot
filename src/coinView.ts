// Что именно показать в карточке монеты: сторона, страница, сквозная нумерация.
// Живёт отдельно от рендера, потому что модуль карточек читает с диска дюжину
// файлов шрифтов при импорте — тесты на нарезку не должны это тащить.

import type { WhalePosition } from './hl.js'

export type CoinFilter = 'all' | 'long' | 'short'

export const COIN_PAGE_SIZE = 10

export interface CoinView {
  readonly coin: string
  readonly filter: CoinFilter
  /** 1-based, уже прижата к [1, pageCount] */
  readonly page: number
  /** минимум 1, даже когда показывать нечего */
  readonly pageCount: number
  /** сколько позиций попало в фильтр */
  readonly total: number
  /** сколько позиций у монеты всего, независимо от фильтра */
  readonly coinTotal: number
  readonly longCount: number
  readonly shortCount: number
  readonly rows: readonly WhalePosition[]
  /** номер первой строки страницы минус один — для сквозной нумерации 11, 12, … */
  readonly rankOffset: number
  /**
   * Масштаб полос размера — крупнейшая позиция МОНЕТЫ, обе стороны, все страницы.
   * Если считать по текущему слайсу, одинокий лонг на $600k нарисуется такой же
   * полосой, как шорт на $80M, — ровно та ложь, ради устранения которой всё это.
   */
  readonly maxSizeUsd: number
}

function matches(position: WhalePosition, filter: CoinFilter): boolean {
  if (filter === 'all') return true
  return filter === 'long' ? position.isLong : !position.isLong
}

/**
 * Позиции приходят уже отсортированными по убыванию размера из `buildSnapshot`,
 * поэтому здесь ничего не пересортировывается — только фильтруется и режется.
 */
export function buildCoinView(
  positions: readonly WhalePosition[],
  coin: string,
  filter: CoinFilter = 'all',
  page = 1,
  perPage = COIN_PAGE_SIZE,
): CoinView {
  const ofCoin = positions.filter((position) => position.coin === coin)
  const selected = ofCoin.filter((position) => matches(position, filter))

  const pageCount = Math.max(1, Math.ceil(selected.length / perPage))
  // Кнопка из старого сообщения не должна приводить к пустому экрану: страницу
  // прижимаем, а не считаем ошибкой.
  const safePage = Number.isFinite(page) ? Math.min(Math.max(Math.trunc(page), 1), pageCount) : 1
  const rankOffset = (safePage - 1) * perPage

  return {
    coin,
    filter,
    page: safePage,
    pageCount,
    total: selected.length,
    coinTotal: ofCoin.length,
    longCount: ofCoin.filter((position) => position.isLong).length,
    shortCount: ofCoin.filter((position) => !position.isLong).length,
    rows: selected.slice(rankOffset, rankOffset + perPage),
    rankOffset,
    maxSizeUsd: ofCoin.reduce((max, position) => Math.max(max, position.sizeUsd), 0),
  }
}

/** «11–20 из 36» — только числа, слова остаются на стороне вызова. */
export function pageRangeLabel(view: CoinView): string {
  if (view.total === 0) return '0'
  const from = view.rankOffset + 1
  const to = view.rankOffset + view.rows.length
  return from === to ? `${from} из ${view.total}` : `${from}–${to} из ${view.total}`
}

const FILTER_CODES: Readonly<Record<CoinFilter, string>> = { all: 'a', long: 'l', short: 's' }
const CODE_FILTERS: Readonly<Record<string, CoinFilter>> = { a: 'all', l: 'long', s: 'short' }

/**
 * `cv:l2:SOL`. Отдельный префикс, а не расширение `coin:` — тот обработчик
 * жадный (`/^coin:(.+)$/`) и молча проглотил бы суффиксы вместе с названием.
 * Переменная часть — название монеты — идёт последней, поэтому разбор однозначен
 * даже если в тикере когда-нибудь появится двоеточие.
 */
export function encodeCoinView(coin: string, filter: CoinFilter, page: number): string {
  const safePage = Math.min(Math.max(Math.trunc(page) || 1, 1), 999)
  return `cv:${FILTER_CODES[filter]}${safePage}:${coin}`
}

export function parseCoinView(data: string): { coin: string; filter: CoinFilter; page: number } | null {
  const match = /^cv:([als])(\d{1,3}):(.+)$/.exec(data)
  if (!match) return null
  const filter = CODE_FILTERS[match[1] ?? '']
  const page = Number(match[2])
  const coin = match[3]
  if (filter === undefined || coin === undefined || !Number.isFinite(page)) return null
  return { coin, filter, page }
}
