import { splitRecordings } from "./split-recordings.mjs";
self.onmessage = async (event: MessageEvent<File[]>) => {
  try {
    const parts = await splitRecordings(event.data, (progress: unknown) =>
      self.postMessage({ progress }),
    );
    self.postMessage({ parts });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
