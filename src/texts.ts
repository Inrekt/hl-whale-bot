// All user-facing RU strings. Wording follows the reference bot verbatim where
// captured from screenshots; /help and alert templates drafted by the local
// model (vault-rag/local.py) and hand-verified.

import type { WatchEvent } from './watch.js'
import { priceCompact, shortAddress, usdCompact } from './format.js'
import { nameOf, type WhaleNames } from './whales.js'

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
  '🎯 Ликвидации — где стоят принудительные закрытия китов: туда тянет цену',
  '/stop — отписаться от ежедневного отчёта',
  '/help — эта справка',
  '',
  '🐙 Слежка за китом: добавь адрес кошелька (0x…) — пришлю личный алерт, когда кит откроет/закроет/перевернёт позицию или изменит её на 25%+.',
  '📄 Ежедневный отчёт приходит в 10:00 МСК (кнопка «Подписка» — вкл/выкл).',
  '',
  'Данные: Hyperliquid public API · не инвест-рекомендация.',
].join('\n')

export const WATCH_INTRO = [
  '⭐ Избранные киты',
  '',
  'Добавь адрес кошелька Hyperliquid — и я пришлю уведомление, как только он откроет, закроет или перевернёт позицию либо изменит её на 25%+.',
  '',
  'Нажми «➕ Добавить кита» и пришли адрес (0x…). Кнопка с карандашом переименовывает кита: имя будет видно во всех карточках.',
].join('\n')

export const WATCH_ASK_ADDRESS = 'Пришли адрес кошелька (0x…, 42 символа):'
export const WATCH_BAD_ADDRESS = 'Это не похоже на адрес Hyperliquid. Нужен формат 0x… (42 символа). Попробуй ещё раз:'
export const WATCH_ADDED = (address: string, names: WhaleNames): string =>
  `✅ ${nameOf(address, names)} (${shortAddress(address)}) в избранном. Пришлю уведомление, когда он что-то сделает.`
export const WATCH_EXISTS = 'Этот кит уже в твоём списке.'
export const WATCH_REMOVED = (address: string): string => `🗑 Кит ${shortAddress(address)} удалён из списка.`
export const WATCH_LIMIT = 'Лимит — 10 китов на пользователя. Удали кого-нибудь из списка.'

export const RENAME_ASK = (address: string, names: WhaleNames): string =>
  `Как назвать этого кита? Сейчас — ${nameOf(address, names)} (${shortAddress(address)}). Пришли новое имя одним сообщением:`
export const RENAME_BAD = 'Пустое имя не подойдёт. Пришли что-нибудь читаемое:'
export const RENAME_DONE = (address: string, name: string): string =>
  `✏️ Готово: ${shortAddress(address)} теперь ${name}. Имя появится во всех карточках.`

export const SUBSCRIBED = '🔔 Подписал! Отчёт будет приходить ежедневно в 10:00 МСК.'
export const UNSUBSCRIBED = '🔕 Отписал от ежедневного отчёта. Нажми ещё раз, чтобы подписаться.'
export const PDF_PREPARING = '📄 Готовлю свежий PDF-отчёт, ~минуту…'
export const SCANNING = '🔍 Сканирую китов, ~минуту…'
export const NOT_READY = 'Собираю данные, попробуй через минуту…'

export function alertText(address: string, event: WatchEvent, names: WhaleNames = {}): string {
  const side = event.isLong ? 'LONG' : 'SHORT'
  const base = `${nameOf(address, names)} · ${event.coin}`
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
