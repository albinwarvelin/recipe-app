import { db, type OutboxOperation } from '../data/db';

// Upgrade unsent image-dependent writes too, so existing stuck imports recover.
// Once sent, an operation's payload stays immutable for idempotent retries.
export async function deferRecipeCovers(): Promise<void> {
  await db.transaction('rw', db.outbox, db.images, async () => {
    const entries = await db.outbox.orderBy('sequence').toArray();
    for (const entry of entries) {
      if (!['recipe-create', 'recipe-update'].includes(entry.type) || entry.attempt_count || !entry.payload?.image_key || entry.status !== 'pending') continue;
      const imageId = entry.payload.image_key;
      const image = await db.images.get(imageId);
      const upload = entries.find((item) => item.type === 'image-upload' && item.entity_id === imageId);
      const existing = entries.find((item) => item.type === 'recipe-cover' && item.entity_id === entry.entity_id && item.image_id === imageId);
      if (image?.remote && existing?.failure_kind !== 'permanent' || !upload && !existing) continue;
      await db.outbox.update(entry.sequence!, {
        payload: { ...entry.payload, image_key: null },
        depends_on: entry.depends_on === upload?.operation_id || existing?.failure_kind === 'permanent' && entry.depends_on === existing.operation_id ? null : entry.depends_on,
      });
      if (!existing && upload) {
        const attachment: OutboxOperation = {
          operation_id: crypto.randomUUID(), entity_id: entry.entity_id, type: 'recipe-cover', image_id: imageId,
          created_at: entry.created_at, last_attempt_at: null, attempt_count: 0,
          base_server_version: entry.base_server_version, local_version: entry.local_version,
          status: 'pending', last_error_code: null, failure_kind: null, next_attempt_at: null,
          depends_on: upload.operation_id,
        };
        attachment.sequence = await db.outbox.add(attachment);
        entries.push(attachment);
      }
    }
  });
}
