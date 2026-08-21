import { describe, expect, it } from 'vitest';
import { formatTimerDuration, timerDurationParts, timerDurationSeconds } from '../../shared/timer-duration';

describe('timer durations', () => {
  it('splits and formats long durations as hours and remaining minutes', () => {
    expect(timerDurationParts(45_000)).toEqual({ hours: 12, minutes: 30 });
    expect(formatTimerDuration(45_000)).toBe('12 tim 30 min');
    expect(formatTimerDuration(43_200)).toBe('12 tim');
    expect(formatTimerDuration(900)).toBe('15 min');
  });

  it('combines editor fields and enforces the configured maximum', () => {
    expect(timerDurationSeconds(12, 30, 604_800)).toBe(45_000);
    expect(timerDurationSeconds(0, 0, 604_800)).toBeNull();
    expect(timerDurationSeconds(200, 0, 604_800)).toBe(604_800);
  });
});
