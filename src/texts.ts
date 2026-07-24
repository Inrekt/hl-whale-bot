// All user-facing RU strings. Wording follows the reference bot verbatim where
// captured from screenshots; /help and alert templates drafted by the local
// model (vault-rag/local.py) and hand-verified.

import type { WatchEvent } from './watch.js'
import { priceCompact, shortAddress, usdCompact } from './format.js'

export const WELCOME = [
  '🐳 Китовый отслеживатель Hyperliquid',
  '',
  'Я сам нахожу крупнейших трейдеров и слежу за их позициями в реальном времени. Ежедневный отчёт — в 10:00 МСК.',
  '',
  'Жми кнопки ниже 👇 или /menu в любой момент.',
].join('\n')

export const MENU_TITLE = [
  '🐳 Китовый отслеживатель · Hyperliquid',
  '',
  'Слежу за крупнейшими трейдерами в реальном времени. Выбери, что показать:',
].join('\n')

export const HELP = [
  '❓ Помощь',
  '',
  '/menu — меню: Топ китов, Настроение, По монете, Лидерборд, Слежка за китом, PDF-отчёт, Подписка',
  '/whales — свежий PDF-отчёт прямо сейчас',
  '/btc /eth /hype … — киты по конкретной монете',
  '/stop — отписаться от ежедневного отчёта',
  '/help — эта справка',
  '',
  '🐙 Слежка за китом: добавь адрес кошелька (0x…) — пришлю личный алерт, когда кит откроет/закроет/перевернёт позицию или изменит её на 25%+.',
  '📄 Ежедневный отчёт приходит в 10:00 МСК (кнопка «Подписка» — вкл/выкл).',
  '',
  'Данные: Hyperliquid public API · не инвест-рекомендация.',
].join('\n')

export const WATCH_INTRO = [
  '🐙 Слежка за китом',
  '',
  'Добавь адрес кошелька Hyperliquid — и я буду присылать тебе личные алерты, когда он открывает/закрывает/переворачивает позицию или меняет её на 25%+.',
  '',
  'Нажми «➕ Добавить кита» и пришли адрес (0x…).',
].join('\n')

export const WATCH_ASK_ADDRESS = 'Пришли адрес кошелька (0x…, 42 символа):'
export const WATCH_BAD_ADDRESS = 'Это не похоже на адрес Hyperliquid. Нужен формат 0x… (42 символа). Попробуй ещё раз:'
export const WATCH_ADDED = (address: string): string => `✅ Кит ${shortAddress(address)} добавлен. Слежу за его позициями.`
export const WATCH_EXISTS = 'Этот кит уже в твоём списке.'
export const WATCH_REMOVED = (address: string): string => `🗑 Кит ${shortAddress(address)} удалён из списка.`
export const WATCH_LIMIT = 'Лимит — 10 китов на пользователя. Удали кого-нибудь из списка.'

export const SUBSCRIBED = '🔔 Подписал! Отчёт будет приходить ежедневно в 10:00 МСК.'
export const UNSUBSCRIBED = '🔕 Отписал от ежедневного отчёта. Нажми ещё раз, чтобы подписаться.'
export const PDF_PREPARING = '📄 Готовлю свежий PDF-отчёт, ~минуту…'
export const SCANNING = '🔍 Сканирую китов, ~минуту…'
export const NOT_READY = 'Собираю данные, попробуй через минуту…'

export function alertText(address: string, event: WatchEvent): string {
  const side = event.isLong ? 'LONG' : 'SHORT'
  const base = `${shortAddress(address)} · ${event.coin}`
  const detail = `${usdCompact(event.sizeUsd)}, ${event.leverage}x, вход ${priceCompact(event.entryPx)}`
  switch (event.kind) {
    case 'open':
      return `🐳 Кит открыл позицию: ${base} ${side} — ${detail}`
    case 'close':
      return `🐳 Кит закрыл позицию: ${base} ${side} (была ${usdCompact(event.sizeUsd)})`
    case 'flip':
      return `🐳 Кит перевернул позицию: ${base} — теперь ${side}, ${detail}`
    case 'increase':
      return `🐳 Кит увеличил позицию на ${event.changePercent}%: ${base} ${side} — теперь ${detail}`
    case 'decrease':
      return `🐳 Кит уменьшил позицию на ${event.changePercent}%: ${base} ${side} — теперь ${detail}`
  }
}
