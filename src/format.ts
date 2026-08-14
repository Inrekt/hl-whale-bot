// Shared display formatting — used by console smoke test now, card/PDF renderers next.

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function usdCompact(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}k`
  return `${sign}$${abs.toFixed(0)}`
}

export function priceCompact(value: number): string {
  if (value >= 1000) return Math.round(value).toLocaleString('en-US')
  if (value >= 1) return value.toFixed(2)
  return value.toPrecision(3)
}

export function signedUsd(value: number): string {
  return value >= 0 ? `+${usdCompact(value)}` : usdCompact(value)
}

/**
 * Русское склонение по числу. `forms` = [1 кит, 2 кита, 5 китов]. Правило
 * стандартное для русского: 11–14 всегда третья форма, иначе смотрим на
 * последнюю цифру. Прежний код в cards.ts проверял только `n < 5`, поэтому
 * «21 кит» печатался как «21 китов» — 21 % 10 === 1, но n=21 не проходило
 * порог `< 5`.
 */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs >= 11 && abs <= 14) return forms[2]
  if (last === 1) return forms[0]
  if (last >= 2 && last <= 4) return forms[1]
  return forms[2]
}
