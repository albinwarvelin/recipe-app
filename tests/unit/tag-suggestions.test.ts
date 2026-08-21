import { describe, expect, it } from 'vitest';
import { matchingTags } from '../../src/components/TagPicker';

const tags = [
  { id: '1', name: 'Middag', normalized_name: 'middag' },
  { id: '2', name: 'Midsommar', normalized_name: 'midsommar' },
  { id: '3', name: 'Snabbt', normalized_name: 'snabbt' },
];

describe('tag suggestions', () => {
  it('shows previously used tags before typing and ranks prefix matches first', () => {
    expect(matchingTags(tags, '').map((tag) => tag.name)).toEqual(['Middag', 'Midsommar', 'Snabbt']);
    expect(matchingTags(tags, 'mid').map((tag) => tag.name)).toEqual(['Middag', 'Midsommar']);
  });

  it('excludes tags already selected on the recipe', () => {
    expect(matchingTags(tags, '', new Set(['middag'])).map((tag) => tag.name)).toEqual(['Midsommar', 'Snabbt']);
  });
});
