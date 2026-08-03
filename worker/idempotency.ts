export interface ProcessedOperationRow {
  method: string | null;
  path: string | null;
  request_hash: string | null;
  response_status: number;
  response_json: string;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)])
    );
  }
  return value;
}

export async function requestFingerprint(method: string, path: string, body: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify({ method, path, body: stableValue(body) }));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function findProcessedOperation(db: D1Database, operationId: string): Promise<ProcessedOperationRow | null> {
  return db.prepare(
    'SELECT method, path, request_hash, response_status, response_json FROM processed_operations WHERE operation_id = ?1'
  ).bind(operationId).first<ProcessedOperationRow>();
}

export function processedOperationStatement(
  db: D1Database,
  operationId: string,
  method: string,
  path: string,
  fingerprint: string,
  status: number,
  body: unknown,
  now: string
): D1PreparedStatement {
  return db.prepare(
    'INSERT INTO processed_operations (operation_id, processed_at, response_json, method, path, request_hash, response_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
  ).bind(operationId, now, JSON.stringify(body), method, path, fingerprint, status);
}
