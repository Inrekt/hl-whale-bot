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
