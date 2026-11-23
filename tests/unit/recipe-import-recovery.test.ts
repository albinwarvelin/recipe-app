import { syntheticRecipeImports } from '../fixtures/recipe-imports';
import { describe, expect, it } from 'vitest';
import { parseRecipeImport, RecipeImportError, MAX_RECIPE_IMPORT_CHARACTERS } from '../../shared/recipe-import';
import { recipeDraftSchema } from '../../shared/recipe-validation';

describe('AI recipe recovery', () => {
  it.each(syntheticRecipeImports)('accepts a complete import with %s without changing recipe text', (_name, raw) => {
    const original = JSON.parse(raw).recipe;
    const parsed = parseRecipeImport(raw);
    expect(parsed.notices).toEqual([]);
    expect(recipeDraftSchema.safeParse(parsed.draft).success).toBe(true);
    expect(parsed.draft.title).toBe(original.title);
    expect(parsed.draft.notes).toBe(original.notes);
    expect(parsed.draft.instructions.map((step) => step.text)).toEqual(original.instructions.map((step: {text: string}) => step.text));
  });

  it('repairs code fences, surrounding prose, comments, smart quotes, unquoted keys and trailing commas', () => {
    const parsed = parseRecipeImport('Här är receptet:\n```json\n{title: “Soppa”, // middag\n ingredients: [{name: "Ärtor", amount: 250,}],}\n```\nSmaklig måltid!');
    expect(parsed.draft).toMatchObject({ title: 'Soppa', ingredients: [{ name: 'Ärtor', amount: '250' }] });
    expect(parsed.notices.some((item) => item.path === 'JSON')).toBe(true);
  });

  it('normalizes clear type variations and aliases with a review notice for each change', () => {
    const parsed = parseRecipeImport(JSON.stringify({title:'Soppa',servings:'4', prepMinutes:'15', cook_minutes:'',description:null,notes:null, source_url:'',imageUrl:'',
      ingredients:[{name:'Ärtor',quantity:250,group_name:'Bas',extra:'text'}],steps:['Koka.',{text:'Vila.',timerHours:'0',timerMinutes:'90'}],tags:['Middag','middag','',{name:'Vego'}]}));
    expect(parsed.draft).toMatchObject({ servings:4,prep_minutes:15,cook_minutes:null,description:'',notes:'',source_url:null,
      ingredients:[{amount:'250',group_name:'Bas'}],instructions:[{text:'Koka.',timer_seconds:null},{timer_seconds:5400}],tags:[{name:'Middag'},{name:'Vego'}] });
    expect(parsed.notices.length).toBeGreaterThan(5);
  });

  it('keeps fractions and free-text amounts without guessing quantities', () => {
    const {draft} = parseRecipeImport(JSON.stringify({title:'Soppa',ingredients:[{name:'Salt',amount:'efter smak'},{name:'Grädde',amount:'1/2'}]}));
    expect(draft.ingredients.map((item) => item.amount)).toEqual(['efter smak','1/2']);
  });

  it('reports several exact field paths and constraints for ambiguous or out-of-range values', () => {
    try { parseRecipeImport(JSON.stringify({title:'Soppa',servings:'4 portioner',prep_minutes:-1,ingredients:[{name:'Ärtor',unit:42}]})); throw new Error('Expected an import error'); }
    catch (cause) {
      expect(cause).toBeInstanceOf(RecipeImportError);
      const error = cause as RecipeImportError;
      expect(error.issues).toHaveLength(3);
      expect(error.message).toContain('recipe.servings'); expect(error.message).toContain('recipe.ingredients[1].unit');
    }
  });

  it('reports unusable optional URLs without throwing a raw URL exception', () => {
    const parsed = parseRecipeImport('{"title":"Soppa","image_url":"javascript:alert(1)","source_url":"not a url"}');
    expect(parsed.imageUrl).toBeNull(); expect(parsed.draft.source_url).toBeNull();
    expect(parsed.notices.filter((item) => item.message.includes('Ogiltig webbadress'))).toHaveLength(2);
  });

  it('rejects conflicting aliases, unsupported versions, multiple recipes, and oversized input', () => {
    expect(() => parseRecipeImport('{"title":"Soppa","prep_minutes":5,"prepMinutes":10}')).toThrow('flera olika värden');
    expect(() => parseRecipeImport('{"format":"recipe-app","version":2,"recipe":{}}')).toThrow('version');
    expect(() => parseRecipeImport('[{"title":"A"},{"title":"B"}]')).toThrow(RecipeImportError);
    expect(() => parseRecipeImport('```json\n{"title":"A"}\n```\n```json\n{"title":"B"}\n```')).toThrow(RecipeImportError);
    expect(() => parseRecipeImport(' '.repeat(MAX_RECIPE_IMPORT_CHARACTERS) + '{}')).toThrow('för långt');
  });

  it('retains text that resembles HTML as plain recipe content', () => {
    expect(parseRecipeImport('{"title":"<script>alert(1)</script>","notes":"<b>Note</b>"}').draft.notes).toBe('<b>Note</b>');
  });

  it('preserves braces inside recipe text and refuses truncated values or several plain objects', () => {
    expect(parseRecipeImport('Här är det: {"title":"Soppa","notes":"Använd {salt} efter smak."} Klart.').draft.notes).toBe('Använd {salt} efter smak.');
    expect(() => parseRecipeImport('{"title":"Soppa","notes":"Avklippt')).toThrow('avklippt');
    expect(() => parseRecipeImport('{"title":"Soppa","servings":')).toThrow('avklippt');
    expect(() => parseRecipeImport('{"title":"A"}\n{"title":"B"}')).toThrow('ett recept i taget');
  });
});
