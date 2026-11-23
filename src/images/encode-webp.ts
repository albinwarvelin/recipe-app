/** Use a short-lived worker so encoding neither blocks the UI nor retains its WASM heap. */
export function encodeWebp(pixels: ImageData, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./webp.worker.ts', import.meta.url), { type: 'module' });
    const fail = () => {
      worker.terminate();
      reject(new Error('Bilden kunde inte konverteras. Försök igen eller välj en annan bild.'));
    };
    worker.onmessage = (event: MessageEvent<ArrayBuffer | null>) => {
      if (event.data) {
        worker.terminate();
        resolve(new Blob([event.data], { type: 'image/webp' }));
      } else fail();
    };
    worker.onerror = fail;
    worker.onmessageerror = fail;
    try { worker.postMessage({ pixels, quality }, [pixels.data.buffer]); }
    catch { fail(); }
  });
}
