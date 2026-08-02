import { describe, expect, it } from 'vitest';
import { isApprovedEmail } from '../../worker/auth/access';

describe('approved Access identities', () => {
  it('accepts explicitly configured emails without case sensitivity', () => {
    expect(isApprovedEmail('Alternate-Owner@Example.com', 'owner@example.com, alternate-owner@example.com')).toBe(true);
  });

  it('rejects identities that are not explicitly configured', () => {
    expect(isApprovedEmail('attacker@example.com', 'owner@example.com,alternate-owner@example.com')).toBe(false);
  });

  it('does not treat an empty allowlist entry as authorization', () => {
    expect(isApprovedEmail('', ',')).toBe(false);
  });
});
