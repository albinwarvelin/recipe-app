import { describe, expect, it } from 'vitest';
import { readJson } from '../../worker/http';

describe('bounded Worker request bodies', () => {
  it('rejects a streamed JSON body that exceeds the actual byte limit', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"value":"'));
        controller.enqueue(new TextEncoder().encode('too large"}'));
        controller.close();
      },
    });
    const request = new Request('https://example.test/api/tags', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    });
    const result = await readJson(request, 'request-id', 10);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(413);
    await expect((result as Response).json()).resolves.toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });

  it('parses valid JSON within the limit', async () => {
    const request = new Request('https://example.test/api/tags', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"middag"}',
    });
    await expect(readJson(request, 'request-id', 100)).resolves.toEqual({ name: 'middag' });
  });
});
