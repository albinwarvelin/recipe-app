export function createCoalescedRunner(task: () => Promise<void>): () => Promise<void> {
  let active: Promise<void> | null = null;
  let requested = false;

  const drain = async (): Promise<void> => {
    while (requested) {
      requested = false;
      await task();
    }
  };

  const trigger = (): Promise<void> => {
    requested = true;
    if (!active) {
      active = drain().finally(() => {
        active = null;
        if (requested) void trigger().catch(() => undefined);
      });
    }
    return active;
  };

  return trigger;
}
