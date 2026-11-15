import type { AppIndex } from "./types";

let cache: AppIndex | null = null;
let pending: Promise<AppIndex> | null = null;

export async function loadIndex(): Promise<AppIndex> {
  if (cache) return cache;
  if (pending) return pending;
  pending = fetch("/data/index.json")
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load index (${res.status})`);
      return res.json() as Promise<AppIndex>;
    })
    .then((data) => {
      cache = data;
      pending = null;
      return data;
    })
    .catch((err) => {
      pending = null;
      throw err;
    });
  return pending;
}