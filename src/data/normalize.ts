const LONG_UNIT_ALIASES: Record<string, string> = {
  kryddmått: 'krm', kryddmatt: 'krm',
  tesked: 'tsk', teskedar: 'tsk',
  matsked: 'msk', matskedar: 'msk',
  milliliter: 'ml', centiliter: 'cl', deciliter: 'dl', liter: 'l',
  gram: 'g', kilogram: 'kg', kilo: 'kg',
  styck: 'st', stycken: 'st',
};

export function normalizeSearchValue(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('sv-SE');
}

export function normalizeDisplayName(value: string): string {
  const compact = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!compact) return '';
  const rest = compact === compact.toUpperCase() || compact === compact.toLowerCase()
    ? compact.toLocaleLowerCase('sv-SE')
    : compact;
  return rest.slice(0, 1).toLocaleUpperCase('sv-SE') + rest.slice(1);
}

export function normalizeUnit(value: string | null): string | null {
  if (!value?.trim()) return null;
  const normalized = normalizeSearchValue(value).replace(/\.$/, '');
  return LONG_UNIT_ALIASES[normalized] ?? normalized;
}
