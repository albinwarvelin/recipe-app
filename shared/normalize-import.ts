import { normalizeIdentityValue } from './normalize';

export interface ImportNotice { path: string; message: string; }
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value);

export function normalizeImport(value: unknown, notices: ImportNotice[]): unknown {
  const notice = (path: string, message: string) => notices.push({ path, message });
  function fields(input: ObjectValue, allowed: string[], aliases: Record<string, string>, path: string): ObjectValue {
    const result: ObjectValue = {};
    for (const [key, item] of Object.entries(input)) {
      const target = aliases[key] ?? key;
      if (!allowed.includes(target)) { notice(`${path}.${key}`, 'Extra fält utelämnades.'); continue; }
      if (Object.hasOwn(result, target) && JSON.stringify(result[target]) !== JSON.stringify(item)) throw new Error(`${path}.${target}: flera olika värden angavs för samma fält.`);
      result[target] = item;
      if (target !== key) notice(`${path}.${key}`, `Lästes som ${target}.`);
    }
    return result;
  }
  function numeric(input: ObjectValue, keys: string[], path: string) {
    for (const key of keys) {
      const item = input[key];
      if (typeof item !== 'string') continue;
      const text = item.trim();
      if (!text || text.toLowerCase() === 'null') { input[key] = null; notice(`${path}.${key}`, 'Tomt värde lästes som ej angivet.'); }
      else if (/^[+-]?\d+(?:[.,]\d+)?$/.test(text)) { input[key] = Number(text.replace(',', '.')); notice(`${path}.${key}`, 'Text lästes som ett tal.'); }
    }
  }
  function nullText(input: ObjectValue, keys: string[], path: string) {
    for (const key of keys) if (input[key] === null) { input[key] = ''; notice(`${path}.${key}`, 'Null lästes som tom text.'); }
  }
  if (!object(value)) return value;
  let envelope: ObjectValue = value;
  if (!Object.hasOwn(value, 'recipe') && !Object.hasOwn(value, 'format') && !Object.hasOwn(value, 'version')
    && ['title', 'ingredients', 'instructions'].some((key) => Object.hasOwn(value, key))) {
    envelope = { recipe: value }; notice('recipe', 'Recept utan formatomslag identifierades.');
  }
  const result = fields(envelope, ['format', 'version', 'recipe'], {}, 'JSON');
  if (result.format === undefined) { result.format = 'recipe-app'; notice('format', 'Receptformatet kompletterades.'); }
  if (result.version === undefined) { result.version = 1; notice('version', 'Formatversion 1 användes.'); }
  if (result.version === '1') { result.version = 1; notice('version', 'Text lästes som ett tal.'); }
  if (!object(result.recipe)) return result;
  const recipe = fields(result.recipe, ['title', 'description', 'servings', 'prep_minutes', 'cook_minutes', 'source_type', 'source_name', 'source_url', 'image_url', 'notes', 'ingredients', 'instructions', 'tags'], {
    prepMinutes: 'prep_minutes', cookMinutes: 'cook_minutes', sourceType: 'source_type', sourceName: 'source_name', sourceUrl: 'source_url', imageUrl: 'image_url', photo_url: 'image_url', steps: 'instructions',
  }, 'recipe');
  result.recipe = recipe;
  nullText(recipe, ['title', 'description', 'notes'], 'recipe');
  numeric(recipe, ['servings', 'prep_minutes', 'cook_minutes'], 'recipe');
  for (const key of ['source_name', 'source_url', 'image_url']) if (typeof recipe[key] === 'string' && !recipe[key].trim()) {
    recipe[key] = null; notice(`recipe.${key}`, 'Tomt värde lästes som ej angivet.');
  }
  for (const key of ['source_url', 'image_url']) {
    if (typeof recipe[key] !== 'string') continue;
    try { const url = new URL(recipe[key]); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); }
    catch { recipe[key] = null; notice(`recipe.${key}`, 'Ogiltig webbadress utelämnades. Lägg till en giltig adress i redigeraren.'); }
  }
  if (recipe.source_type === 'online' && !recipe.source_url) notice('recipe.source_url', 'Originalets webbadress behöver fyllas i före sparande.');
  for (const key of ['ingredients', 'instructions', 'tags']) if (recipe[key] === null) { recipe[key] = []; notice(`recipe.${key}`, 'Null lästes som en tom lista.'); }
  if (Array.isArray(recipe.ingredients)) recipe.ingredients = recipe.ingredients.map((item, index) => {
    const path = `recipe.ingredients[${index + 1}]`;
    if (typeof item === 'string') { notice(path, 'Ingredienstext lästes som namn; mängd och enhet lämnades tomma.'); return { name: item }; }
    if (!object(item)) return item;
    const ingredient = fields(item, ['amount', 'unit', 'name', 'group'], { quantity: 'amount', group_name: 'group' }, path);
    if (typeof ingredient.amount === 'number' && Number.isFinite(ingredient.amount)) { ingredient.amount = String(ingredient.amount); notice(`${path}.amount`, 'Mängden lästes som text.'); }
    return ingredient;
  });
  if (Array.isArray(recipe.instructions)) recipe.instructions = recipe.instructions.map((item, index) => {
    const path = `recipe.instructions[${index + 1}]`;
    if (typeof item === 'string') { notice(path, 'Stegtext lästes som en instruktion.'); return { text: item }; }
    if (!object(item)) return item;
    const instruction = fields(item, ['text', 'timer_hours', 'timer_minutes', 'timer_seconds'], { timerHours: 'timer_hours', timerMinutes: 'timer_minutes', timerSeconds: 'timer_seconds' }, path);
    numeric(instruction, ['timer_hours', 'timer_minutes', 'timer_seconds'], path);
    if (instruction.timer_seconds != null) {
      if (instruction.timer_hours != null || instruction.timer_minutes != null) throw new Error(`${path}: ange timern antingen i sekunder eller i timmar och minuter.`);
      if (typeof instruction.timer_seconds === 'number' && Number.isInteger(instruction.timer_seconds) && instruction.timer_seconds >= 0 && instruction.timer_seconds % 60 === 0) {
        instruction.timer_minutes = instruction.timer_seconds / 60; delete instruction.timer_seconds; notice(path, 'Timer i sekunder omvandlades till minuter.');
      }
    } else delete instruction.timer_seconds;
    if (typeof instruction.timer_minutes === 'number' && instruction.timer_minutes >= 60 && typeof (instruction.timer_hours ?? 0) === 'number') {
      const minutes = instruction.timer_minutes;
      instruction.timer_hours = Number(instruction.timer_hours ?? 0) + Math.floor(minutes / 60); instruction.timer_minutes = minutes % 60;
      notice(path, 'Lång timer delades upp i timmar och minuter.');
    }
    return instruction;
  });
  if (Array.isArray(recipe.tags)) {
    const seen = new Set<string>();
    recipe.tags = recipe.tags.flatMap((item, index) => {
      const path = `recipe.tags[${index + 1}]`;
      if (object(item) && typeof item.name === 'string') { item = item.name; notice(path, 'Taggobjekt lästes som ett namn.'); }
      if (typeof item !== 'string') return [item];
      const key = normalizeIdentityValue(item);
      if (!key || seen.has(key)) { notice(path, 'Tom eller upprepad tagg utelämnades.'); return []; }
      seen.add(key); return [item];
    });
  }
  return result;
}
