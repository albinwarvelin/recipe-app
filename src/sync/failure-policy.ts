import type { OutboxOperation } from '../data/db';

export function failureDispositionForStatus(status: number): 'transient' | 'permanent' {
  return status === 408 || status === 425 || status === 429 || status >= 500 ? 'transient' : 'permanent';
}

export function canAttemptOperation(entry: OutboxOperation, timestamp = new Date().toISOString()): boolean {
  if (entry.status === 'pending') return true;
  if (entry.status !== 'failed' || entry.failure_kind === 'permanent') return false;
  return !entry.next_attempt_at || entry.next_attempt_at <= timestamp;
}
