import { describe, expect, it } from 'vitest';
import type { OutboxOperation } from '../../src/data/db';
import { canAttemptOperation, failureDispositionForStatus } from '../../src/sync/failure-policy';

function operation(patch: Partial<OutboxOperation> = {}): OutboxOperation {
  return {
    operation_id: crypto.randomUUID(), entity_id: crypto.randomUUID(), type: 'recipe-update',
    created_at: '2026-01-01T00:00:00.000Z', last_attempt_at: null, attempt_count: 1,
    base_server_version: 1, local_version: 2, status: 'pending', last_error_code: null,
    failure_kind: null, next_attempt_at: null, depends_on: null, ...patch,
  };
}

describe('sync failure policy', () => {
  it('classifies retryable server responses separately from permanent client errors', () => {
    expect(failureDispositionForStatus(429)).toBe('transient');
    expect(failureDispositionForStatus(503)).toBe('transient');
    expect(failureDispositionForStatus(422)).toBe('permanent');
  });

  it('skips permanent failures and honors transient retry times', () => {
    const now = '2026-01-02T00:00:00.000Z';
    expect(canAttemptOperation(operation({ status: 'failed', failure_kind: 'permanent' }), now)).toBe(false);
    expect(canAttemptOperation(operation({ status: 'failed', failure_kind: 'transient', next_attempt_at: '2026-01-03T00:00:00.000Z' }), now)).toBe(false);
    expect(canAttemptOperation(operation({ status: 'failed', failure_kind: 'transient', next_attempt_at: '2026-01-01T00:00:00.000Z' }), now)).toBe(true);
  });
});
