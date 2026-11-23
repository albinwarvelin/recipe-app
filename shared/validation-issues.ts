import type { ZodIssue } from 'zod';

export interface ValidationIssue { path: Array<string | number>; message: string; }

export function fieldPath(path: Array<string | number>): string {
  return path.reduce<string>((result, part) => typeof part === 'number' ? `${result}[${part + 1}]` : result ? `${result}.${part}` : part, '') || 'Receptet';
}

export function validationIssues(issues: ZodIssue[]): ValidationIssue[] {
  return issues.slice(0, 20).map((issue) => {
    let message = 'Kontrollera värdet.';
    if (issue.code === 'invalid_type') {
      const types: Record<string, string> = { number: 'ett tal', integer: 'ett heltal', string: 'text', array: 'en lista', object: 'ett objekt', null: 'null', undefined: 'inget värde', boolean: 'sant eller falskt' };
      message = `Förväntade ${types[issue.expected] ?? issue.expected}; fick ${types[issue.received] ?? issue.received}.`;
    }
    else if (issue.code === 'too_big') message = `Högst ${issue.maximum}${issue.type === 'string' ? ' tecken' : issue.type === 'array' ? ' poster' : ''} tillåts.`;
    else if (issue.code === 'too_small') message = `Minst ${issue.minimum}${issue.type === 'string' ? ' tecken' : ''} krävs.`;
    else if (issue.code === 'invalid_string') message = ['planned_date', 'week_start'].includes(String(issue.path.at(-1))) ? 'Ange ett giltigt datum i formatet ÅÅÅÅ-MM-DD.' : issue.validation === 'url' ? 'Ange en fullständig http- eller https-adress.' : 'Värdet har ett ogiltigt format.';
    else if (issue.code === 'invalid_enum_value') message = `Välj ett av: ${issue.options.join(', ')}.`;
    else if (issue.code === 'invalid_literal') message = `Förväntade ${JSON.stringify(issue.expected)}.`;
    else if (issue.code === 'unrecognized_keys') message = `Okända fält: ${issue.keys.join(', ')}.`;
    else if (issue.code === 'custom') {
      message = issue.message === 'Date must be a valid YYYY-MM-DD value.' ? 'Ange ett giltigt datum i formatet ÅÅÅÅ-MM-DD.'
        : issue.message === 'Tag names must be unique.' ? 'Varje tagg måste vara unik.'
        : issue.message.includes('http') ? 'Endast http- och https-adresser tillåts.'
        : issue.message.includes('timer') || issue.message.includes('duration') ? 'Timern får vara högst 7 dygn.' : 'Kontrollera värdet.';
    }
    return { path: issue.path, message };
  }).filter((issue, index, all) => all.findIndex((other) => fieldPath(other.path) === fieldPath(issue.path) && other.message === issue.message) === index);
}
