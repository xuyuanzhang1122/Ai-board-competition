import type { Body, PendingRequest } from './types'

export interface Recovery {
  edit: { revision: number; body: Body; boardJson: string } | null
  pending: PendingRequest | null
}
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const key = (account: number, route: string) => `creation-recovery:v1:${account}:${route}`
export function readRecovery(
  storage: StorageLike,
  account: number,
  route: string,
): Recovery | null {
  const raw = storage.getItem(key(account, route))
  if (!raw) return null
  return JSON.parse(raw) as Recovery
}
export function writeRecovery(
  storage: StorageLike,
  account: number,
  route: string,
  value: Recovery,
): void {
  if (!value.pending && !value.edit) storage.removeItem(key(account, route))
  else storage.setItem(key(account, route), JSON.stringify(value))
}
