import type { AppIndex } from "./types";

let cache: AppIndex | null = null;
let pending: Promise<AppIndex> | null = null;

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return res.json() as Promise<T>;
}

export async function loadIndex(): Promise<AppIndex> {
  if (cache) return cache;
  if (pending) return pending;
  pending = (async () => {
    try {
      const [meta, cards, rulings, rules] = await Promise.all([
        fetchJson<AppIndex["meta"]>("/data/meta.json"),
        fetchJson<AppIndex["cards"]>("/data/cards.json"),
        fetchJson<AppIndex["rulings"]>("/data/rulings.json"),
        fetchJson<AppIndex["rules"]>("/data/rules.json"),
      ]);
      const data: AppIndex = { meta, cards, rulings, rules };
      cache = data;
      return data;
    } finally {
      pending = null;
    }
  })();
  return pending;
}