import type { AppIndex, Card, Ruling, Rule, SearchHit } from "./types";

const STOP = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "and",
  "or",
  "if",
  "is",
  "are",
  "be",
  "do",
  "does",
  "can",
  "with",
  "from",
  "when",
  "what",
  "how",
  "does",
  "my",
  "me",
  "i",
  "it",
  "its",
  "this",
  "that",
  "into",
  "during",
  "about",
  "vs",
  "versus",
]);

export function tokens(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9.\- ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function includesScore(hay: string, needle: string): number {
  if (!needle) return 0;
  if (hay === needle) return 100;
  if (hay.startsWith(needle)) return 70;
  if (hay.includes(needle)) return 40;
  return 0;
}

function tokenHits(hay: string, toks: string[]): number {
  let score = 0;
  for (const t of toks) {
    if (hay.includes(t)) score += 12;
  }
  return score;
}

/** Find card names mentioned in free text (longest names first). */
export function detectCards(query: string, cards: Card[], limit = 6): Card[] {
  const q = query.toLowerCase();
  const hits: { card: Card; at: number; len: number }[] = [];
  for (const card of cards) {
    const name = card.name.toLowerCase();
    if (name.length < 3) continue;
    const at = q.indexOf(name);
    if (at >= 0) hits.push({ card, at, len: name.length });
  }
  hits.sort((a, b) => b.len - a.len || a.at - b.at);
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const h of hits) {
    if (seen.has(h.card.oracleId)) continue;
    seen.add(h.card.oracleId);
    out.push(h.card);
    if (out.length >= limit) break;
  }
  return out;
}

export function searchIndex(index: AppIndex, query: string, limit = 24): SearchHit[] {
  const q = query.trim();
  if (q.length < 2) return [];

  const qLower = q.toLowerCase();
  const toks = tokens(q);
  const mentioned = new Set(detectCards(q, index.cards).map((c) => c.name.toLowerCase()));
  const ruleNum = /^\d{1,3}(\.\d+[a-z]*)*$/i.test(q.trim()) ? q.trim().toLowerCase() : null;

  const hits: SearchHit[] = [];

  for (const ruling of index.rulings) {
    let score = 0;
    const question = ruling.question.toLowerCase();
    const answer = ruling.answer.toLowerCase();
    const card = ruling.card.toLowerCase();
    score += includesScore(question, qLower) * 1.4;
    score += includesScore(card, qLower) * 1.2;
    score += tokenHits(question, toks) * 1.5;
    score += tokenHits(answer, toks);
    score += tokenHits(card, toks) * 1.2;
    if (mentioned.has(card)) score += 80;
    if (score > 0) hits.push({ kind: "ruling", score, ruling });
  }

  for (const card of index.cards) {
    let score = 0;
    const name = card.name.toLowerCase();
    const text = card.text.toLowerCase();
    const type = card.type.toLowerCase();
    score += includesScore(name, qLower) * 2;
    score += tokenHits(name, toks) * 2;
    score += tokenHits(text, toks);
    score += tokenHits(type, toks);
    score += tokenHits(card.keywords.join(" ").toLowerCase(), toks) * 1.4;
    score += tokenHits(card.tags.join(" ").toLowerCase(), toks);
    if (mentioned.has(name)) score += 90;
    if (score > 0) hits.push({ kind: "card", score, card });
  }

  for (const rule of index.rules) {
    let score = 0;
    const n = rule.n.toLowerCase();
    const c = rule.c.toLowerCase();
    if (ruleNum) {
      if (n === ruleNum) score += 200;
      else if (n.startsWith(ruleNum)) score += 120;
      else if (ruleNum.startsWith(n) && n.length >= 3) score += 60;
    }
    score += includesScore(c, qLower) * 0.8;
    score += tokenHits(c, toks);
    if (toks.some((t) => n === t || n.startsWith(t + "."))) score += 40;
    // Prefer concrete rule text over section titles for free-text queries
    if (rule.t === "text") score *= 1.15;
    if (score > 0) hits.push({ kind: "rule", score, rule });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

export function rulingsForCard(index: AppIndex, cardName: string): Ruling[] {
  const key = cardName.toLowerCase();
  return index.rulings.filter((r) => r.card.toLowerCase() === key);
}

export function rulesAround(index: AppIndex, citation: string, radius = 2): Rule[] {
  const target = citation.toLowerCase();
  const i = index.rules.findIndex((r) => r.n.toLowerCase() === target);
  if (i < 0) {
    return index.rules.filter((r) => r.n.toLowerCase().startsWith(target)).slice(0, 5);
  }
  return index.rules.slice(Math.max(0, i - radius), i + radius + 3);
}

export const QUICK_TOPICS = [
  { label: "Showdown", query: "showdown" },
  { label: "Chain", query: "chain" },
  { label: "Can't vs can", query: "can't beats can" },
  { label: "Counter", query: "counter a spell" },
  { label: "Flow", query: "flow" },
  { label: "Hidden", query: "hidden" },
  { label: "Damage", query: "damage" },
  { label: "Deathknell", query: "deathknell" },
  { label: "Equip", query: "equip" },
  { label: "Reaction timing", query: "reaction" },
] as const;