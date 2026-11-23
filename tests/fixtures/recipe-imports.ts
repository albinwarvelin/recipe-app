// Invented regression data only. Do not copy personal recipe exports here.
function recipe(grouped: boolean) {
  return {
    title: grouped ? 'Testrecept med grupper' : 'Testrecept med tomma fält',
    description: 'Syntetisk data för automatiska tester.',
    servings: 4, prep_minutes: 10, cook_minutes: 20,
    source_type: 'ai', source_name: null, source_url: null, image_url: null,
    notes: 'Bevara å, ä, ö, "citat" och {testvärde}.',
    ingredients: Array.from({ length: 12 }, (_, index) => ({
      name: `Testingrediens ${index + 1}`,
      amount: index % 3 === 0 ? null : String(index + 1),
      unit: index % 3 === 0 ? null : 'g',
      group: grouped ? `Testgrupp ${index < 6 ? 'A' : 'B'}` : null,
    })),
    instructions: Array.from({ length: 9 }, (_, index) => ({
      text: `Teststeg ${index + 1}: bevara svensk text åäö.`,
      timer_hours: index % 2 === 0 ? null : 0,
      timer_minutes: index % 2 === 0 ? null : index + 1,
    })),
    tags: ['Testtagg Å', 'Testtagg B'],
  };
}

export const syntheticRecipeImports = [
  ['nullable fields', JSON.stringify({ format: 'recipe-app', version: 1, recipe: recipe(false) }, null, 2)],
  ['grouped ingredients', JSON.stringify({ format: 'recipe-app', version: 1, recipe: recipe(true) })],
];
