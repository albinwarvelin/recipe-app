import type { LocalIngredientCatalog, LocalMealPlanEntry, LocalRecipe } from '../data/db';
import { normalizeIdentityValue, normalizeUnit } from '../data/normalize';

interface ParsedAmount { minimum: number; maximum: number; }
interface UnitScale { family: string; factor: number; original: string | null; }
interface Accumulator {
  key: string;
  name: string;
  category: string;
  family: string;
  minimum: number;
  maximum: number;
  sources: Set<string>;
  signatureParts: string[];
}
interface UnparsedAccumulator {
  key: string;
  name: string;
  category: string;
  amount: string | null;
  unit: string | null;
  sources: Set<string>;
  signatureParts: string[];
}

export interface ShoppingListItem {
  key: string;
  name: string;
  category: string;
  amount: string | null;
  unit: string | null;
  sources: string[];
  sourceSignature: string;
  unparsed: boolean;
}

const categoryLabels: Record<string, string> = {
  vegetable: 'Grönsaker', fruit: 'Frukt', protein: 'Protein', dairy: 'Mejeri',
  grain: 'Spannmål och bröd', legume: 'Baljväxter', herb: 'Örter', spice: 'Kryddor', pantry: 'Skafferi',
};

function parseSingle(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  const unicodeFractions: Record<string, number> = { '¼': .25, '½': .5, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': .125, '⅜': .375, '⅝': .625, '⅞': .875 };
  if (unicodeFractions[normalized] !== undefined) return unicodeFractions[normalized];
  const unicodeMixed = normalized.match(/^(\d+)\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/);
  if (unicodeMixed) return Number(unicodeMixed[1]) + unicodeFractions[unicodeMixed[2]];
  const mixed = normalized.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed && Number(mixed[3]) !== 0) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = normalized.match(/^(\d+)\/(\d+)$/);
  if (fraction && Number(fraction[2]) !== 0) return Number(fraction[1]) / Number(fraction[2]);
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  return null;
}

export function parseIngredientAmount(value: string | null): ParsedAmount | null {
  if (!value?.trim()) return null;
  const range = value.trim().match(/^(.+?)\s*[–-]\s*(.+)$/);
  if (range) {
    const minimum = parseSingle(range[1]);
    const maximum = parseSingle(range[2]);
    if (minimum !== null && maximum !== null && maximum >= minimum) return { minimum, maximum };
    return null;
  }
  const amount = parseSingle(value);
  return amount === null ? null : { minimum: amount, maximum: amount };
}

function unitScale(rawUnit: string | null): UnitScale {
  const unit = normalizeUnit(rawUnit);
  if (unit === 'kg') return { family: 'mass', factor: 1_000, original: unit };
  if (unit === 'g') return { family: 'mass', factor: 1, original: unit };
  if (unit === 'l') return { family: 'volume', factor: 1_000, original: unit };
  if (unit === 'dl') return { family: 'volume', factor: 100, original: unit };
  if (unit === 'cl') return { family: 'volume', factor: 10, original: unit };
  if (unit === 'ml') return { family: 'volume', factor: 1, original: unit };
  if (unit === 'msk') return { family: 'spoon', factor: 15, original: unit };
  if (unit === 'tsk') return { family: 'spoon', factor: 5, original: unit };
  if (unit === 'krm') return { family: 'spoon', factor: 1, original: unit };
  if (unit === 'st') return { family: 'count', factor: 1, original: unit };
  return { family: `exact:${unit ?? 'none'}`, factor: 1, original: unit };
}

function displayUnit(family: string, minimum: number, maximum: number): { factor: number; unit: string | null } {
  const reference = Math.max(minimum, maximum);
  if (family === 'mass') return reference >= 1_000 ? { factor: 1_000, unit: 'kg' } : { factor: 1, unit: 'g' };
  if (family === 'volume') {
    if (reference >= 1_000) return { factor: 1_000, unit: 'l' };
    if (reference >= 100) return { factor: 100, unit: 'dl' };
    if (reference >= 10) return { factor: 10, unit: 'cl' };
    return { factor: 1, unit: 'ml' };
  }
  if (family === 'spoon') {
    if (reference >= 15 && Math.abs(reference / 15 - Math.round(reference / 15)) < .001) return { factor: 15, unit: 'msk' };
    if (reference >= 5 && Math.abs(reference / 5 - Math.round(reference / 5)) < .001) return { factor: 5, unit: 'tsk' };
    return { factor: 1, unit: 'krm' };
  }
  if (family === 'count') return { factor: 1, unit: 'st' };
  const exact = family.slice('exact:'.length);
  return { factor: 1, unit: exact === 'none' ? null : exact };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(Math.round(value * 100) / 100);
}

function amountText(minimum: number, maximum: number, factor: number): string {
  const low = minimum / factor;
  const high = maximum / factor;
  return Math.abs(low - high) < .0001 ? formatNumber(low) : `${formatNumber(low)}–${formatNumber(high)}`;
}

function sourceSignature(parts: string[]): string {
  const value = [...parts].sort().join('|');
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

export function buildShoppingList(entries: LocalMealPlanEntry[], recipes: LocalRecipe[], catalog: LocalIngredientCatalog[]): ShoppingListItem[] {
  const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
  const combined = new Map<string, Accumulator>();
  const unparsed = new Map<string, UnparsedAccumulator>();

  for (const plan of entries) {
    const recipe = recipesById.get(plan.recipe_id);
    if (!recipe) continue;
    const scale = recipe.servings && plan.servings ? plan.servings / recipe.servings : plan.multiplier;
    recipe.ingredients.forEach((ingredient, index) => {
      const catalogEntry = ingredient.catalog_id ? catalogById.get(ingredient.catalog_id) : undefined;
      const category = categoryLabels[catalogEntry?.category ?? ''] ?? 'Övrigt';
      const identity = ingredient.catalog_id ? `catalog:${ingredient.catalog_id}` : `name:${normalizeIdentityValue(ingredient.name)}`;
      const parsed = parseIngredientAmount(ingredient.amount);
      const unit = unitScale(ingredient.unit);
      const sourcePart = `${plan.id}:${recipe.updated_at}:${ingredient.id ?? index}:${plan.servings ?? `x${plan.multiplier}`}`;
      if (!parsed) {
        const rawAmount = ingredient.amount?.trim() || null;
        const key = `raw:${identity}|${unit.family}|${normalizeIdentityValue(rawAmount ?? '')}`;
        const accumulator = unparsed.get(key) ?? {
          key, name: ingredient.name, category, amount: rawAmount, unit: unit.original,
          sources: new Set<string>(), signatureParts: [],
        };
        accumulator.sources.add(recipe.title);
        accumulator.signatureParts.push(sourcePart);
        unparsed.set(key, accumulator);
        return;
      }
      const key = `${identity}|${unit.family}`;
      const accumulator = combined.get(key) ?? {
        key, name: ingredient.name, category, family: unit.family,
        minimum: 0, maximum: 0, sources: new Set<string>(), signatureParts: [],
      };
      accumulator.minimum += parsed.minimum * scale * unit.factor;
      accumulator.maximum += parsed.maximum * scale * unit.factor;
      accumulator.sources.add(recipe.title);
      accumulator.signatureParts.push(`${sourcePart}:${parsed.minimum}:${parsed.maximum}:${scale}:${unit.factor}`);
      combined.set(key, accumulator);
    });
  }

  const parsedItems = [...combined.values()].map((item): ShoppingListItem => {
    const display = displayUnit(item.family, item.minimum, item.maximum);
    return {
      key: item.key,
      name: item.name,
      category: item.category,
      amount: amountText(item.minimum, item.maximum, display.factor),
      unit: display.unit,
      sources: [...item.sources].sort((left, right) => left.localeCompare(right, 'sv')),
      sourceSignature: sourceSignature(item.signatureParts),
      unparsed: false,
    };
  });
  const unparsedItems = [...unparsed.values()].map((item): ShoppingListItem => ({
    key: item.key,
    name: item.name,
    category: item.category,
    amount: item.amount,
    unit: item.unit,
    sources: [...item.sources].sort((left, right) => left.localeCompare(right, 'sv')),
    sourceSignature: sourceSignature(item.signatureParts),
    unparsed: true,
  }));
  return [...parsedItems, ...unparsedItems].sort((left, right) => left.category.localeCompare(right.category, 'sv') || left.name.localeCompare(right.name, 'sv'));
}
