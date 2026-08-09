// Приватность: бот обслуживает одного владельца. Владелец закрепляется за первым,
// кто написал боту (или задаётся OWNER_ID), и дальше остальные не получают ответа —
// молчание не подтверждает даже факт существования бота.

export type AccessDecision = 'claim' | 'allow' | 'deny'

export function decideAccess(userId: number | undefined, owner: number | null): AccessDecision {
  if (userId === undefined) return 'deny'
  if (owner === null) return 'claim'
  return userId === owner ? 'allow' : 'deny'
}

/** OWNER_ID из окружения имеет приоритет над записанным в состоянии. */
export function configuredOwner(raw: string | undefined): number | null {
  const parsed = Number(raw ?? '')
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}
