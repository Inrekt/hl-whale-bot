import { describe, expect, test } from 'vitest'
import { configuredOwner, decideAccess } from './access.js'

describe('decideAccess', () => {
  test('first user claims an unowned bot', () => {
    expect(decideAccess(777, null)).toBe('claim')
  })

  test('owner keeps access, everyone else is denied', () => {
    expect(decideAccess(777, 777)).toBe('allow')
    expect(decideAccess(778, 777)).toBe('deny')
  })

  test('updates without a sender are denied even before an owner exists', () => {
    expect(decideAccess(undefined, null)).toBe('deny')
    expect(decideAccess(undefined, 777)).toBe('deny')
  })
})

describe('configuredOwner', () => {
  test('accepts a positive integer id', () => {
    expect(configuredOwner('8023293987')).toBe(8023293987)
  })

  test('ignores unset or malformed values', () => {
    expect(configuredOwner(undefined)).toBeNull()
    expect(configuredOwner('')).toBeNull()
    expect(configuredOwner('not-an-id')).toBeNull()
    expect(configuredOwner('-5')).toBeNull()
    expect(configuredOwner('1.5')).toBeNull()
  })
})
