import { describe, expect, it } from 'vitest';
import { createCoalescedRunner } from '../../src/sync/coalesced-runner';

describe('coalesced sync runner', () => {
  it('runs again when another sync is requested during an active run', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let runs = 0;
    const trigger = createCoalescedRunner(async () => {
      runs += 1;
      if (runs === 1) await firstGate;
    });

    const first = trigger();
    await Promise.resolve();
    const second = trigger();
    expect(second).toBe(first);
    releaseFirst();
    await first;

    expect(runs).toBe(2);
  });

  it('coalesces several overlapping requests into one follow-up run', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let runs = 0;
    const trigger = createCoalescedRunner(async () => {
      runs += 1;
      if (runs === 1) await firstGate;
    });

    const active = trigger();
    await Promise.resolve();
    trigger();
    trigger();
    trigger();
    releaseFirst();
    await active;

    expect(runs).toBe(2);
  });
});
