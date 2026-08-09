// Постоянные имена китов. Адрес 0x5b5d…c060 нечитаем: чтобы узнать вчерашнего
// кита в сегодняшней карточке, приходится сличать буквы. Имя выводится из
// самого адреса, поэтому один кошелёк всегда зовётся одинаково — и во всех
// карточках, и после перезапуска бота, без всякого хранилища.

// Навигационные звёзды: коротко, нейтрально и подходит теме «ориентиров».
const NAMES = [
  'Вега',
  'Ригель',
  'Альтаир',
  'Денеб',
  'Сириус',
  'Спика',
  'Мицар',
  'Канопус',
  'Арктур',
  'Полярис',
  'Антарес',
  'Процион',
  'Капелла',
  'Беллатрикс',
  'Алькор',
  'Атрия',
  'Гакрукс',
  'Мирах',
  'Алиот',
  'Шаула',
  'Мимоза',
  'Хадар',
  'Ахернар',
  'Дубхе',
  'Наос',
  'Сабик',
  'Расальхаг',
  'Альферац',
  'Менкар',
  'Алгол',
  'Электра',
  'Майя',
] as const

/** Устойчивый 32-битный хеш строки (FNV-1a) — одинаковый на любой машине и в любом запуске. */
function hash(value: string): number {
  let result = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 0x01000193) >>> 0
  }
  return result
}

/** Адрес в нижнем регистре → имя, которое человек задал сам. */
export type WhaleNames = Readonly<Record<string, string>>

/**
 * Имя кита по адресу. Совпадения имён возможны (китов больше, чем имён),
 * поэтому рядом всегда печатается укороченный адрес — он и остаётся точным
 * идентификатором, а имя нужно только чтобы узнавать своих.
 */
export function whaleName(address: string): string {
  const normalized = address.toLowerCase()
  const name = NAMES[hash(normalized) % NAMES.length]
  return name ?? 'Кит'
}

/** Своё имя важнее выданного автоматически. */
export function nameOf(address: string, names: WhaleNames): string {
  return names[address.toLowerCase()] ?? whaleName(address)
}

export const MAX_WHALE_NAME_LENGTH = 24

/** Имя пишется в карточку, поэтому режем длину и запрещаем перевод строки. */
export function sanitizeWhaleName(raw: string): string | null {
  const trimmed = raw.replace(/\s+/g, ' ').trim()
  if (trimmed.length === 0) return null
  return trimmed.slice(0, MAX_WHALE_NAME_LENGTH)
}
