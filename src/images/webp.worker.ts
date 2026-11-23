/// <reference lib="webworker" />
import encode from '@jsquash/webp/encode.js';

self.onmessage = async (event: MessageEvent<{ pixels: ImageData; quality: number }>) => {
  try {
    const buffer = await encode(event.data.pixels, { quality: event.data.quality * 100 });
    self.postMessage(buffer, { transfer: [buffer] });
  } catch {
    self.postMessage(null);
  }
};
