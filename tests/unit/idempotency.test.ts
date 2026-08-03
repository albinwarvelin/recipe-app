import { describe, expect, it } from 'vitest';
import { requestFingerprint } from '../../worker/idempotency';

describe('idempotency request fingerprints', () => {
  it('is stable across object key order but changes with request semantics', async () => {
    const first = await requestFingerprint('POST', '/api/recipes', { title: 'Soup', nested: { b: 2, a: 1 } });
    const reordered = await requestFingerprint('POST', '/api/recipes', { nested: { a: 1, b: 2 }, title: 'Soup' });
    const changed = await requestFingerprint('PATCH', '/api/recipes', { nested: { a: 1, b: 2 }, title: 'Soup' });
    expect(first).toBe(reordered);
    expect(first).not.toBe(changed);
  });
});
