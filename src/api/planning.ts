import type { PlanningChangePage, PlanningEntity, PlanningEntityType, PlanningOperation } from '../../shared/planning';
import { ApiError, AuthenticationRequiredError, apiErrorMessage, type ApiErrorDetail } from './recipes';

interface PlanningErrorBody {
  error?: ApiErrorDetail;
}

async function planningApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    redirect: 'manual',
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  });
  if ((response.type as string) === 'opaqueredirect' || response.status === 0 || response.status === 302) throw new AuthenticationRequiredError();
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as PlanningErrorBody;
    throw new ApiError(response.status, apiErrorMessage(response.status, body.error?.code), body.error?.requestId, undefined, body.error?.code, body.error?.details?.issues);
  }
  return response.json() as Promise<T>;
}

export interface PlanningSyncResult {
  operation_id: string;
  status: number;
  body: {
    entity_type?: PlanningEntityType;
    entity?: PlanningEntity;
    error?: ApiErrorDetail;
  };
}

export async function pushPlanningOperations(operations: PlanningOperation[]): Promise<PlanningSyncResult[]> {
  return (await planningApi<{ results: PlanningSyncResult[] }>('/api/planning/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'RecipeApp',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({ operations }),
  })).results;
}

export function getPlanningChanges(cursor: number): Promise<PlanningChangePage> {
  return planningApi<PlanningChangePage>(`/api/planning/changes?cursor=${cursor}&limit=100`);
}

