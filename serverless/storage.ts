import { getStore } from "@netlify/blobs";

export interface AtomicStore {
  read<T>(key: string): Promise<{ data: T; etag: string } | null>;
  write(key: string, value: unknown, etag?: string): Promise<boolean>;
}

export function blobStore(): AtomicStore {
  const store = getStore({ name: "market-rush-v1", consistency: "strong" });
  return {
    async read<T>(key: string) {
      const entry = await store.getWithMetadata(key, { type: "json", consistency: "strong" });
      if (entry && !entry.etag) throw new Error("Storage returned no version; refusing an unsafe write.");
      return entry ? { data: entry.data as T, etag: entry.etag! } : null;
    },
    async write(key, value, etag) {
      const result = await store.setJSON(key, value, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
      return result.modified;
    }
  };
}

// A fresh read and re-application of the command is required after every CAS conflict.
export async function mutate<T, R>(store: AtomicStore, key: string, change: (value: T | undefined) => { value: T; result: R }) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const previous = await store.read<T>(key);
    const { value, result } = change(previous?.data);
    if (await store.write(key, value, previous?.etag)) return result;
    await new Promise((resolve) => setTimeout(resolve, Math.min(100, attempt * 8)));
  }
  throw new Error("The room is busy. Please try again.");
}
