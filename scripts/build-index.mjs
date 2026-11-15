import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cardsRaw = JSON.parse(readFileSync(join(root, "data/cards.json"), "utf8"));
const rulingsRaw = JSON.parse(readFileSync(join(root, "data/rulings.json"), "utf8"));
const rulesRaw = JSON.parse(readFileSync(join(root, "data/core-rules.json"), "utf8"));

const TAG_RE = /<[^>]+>/g;
const SHORTCODE_RE = /:rb_[a-z0-9_]+:/g;
const WS_RE = /\s+/g;

function stripHtml(s) {
  if (!s) return "";
  return s
    .replace(TAG_RE, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(SHORTCODE_RE, " ")
    .replace(WS_RE, " ")
    .trim();
}

const setPriority = { OGN: 0, OGS: 1, SFD: 2, UNL: 3, VEN: 4, RAD: 5 };
const preferred = new Map();
for (const c of cardsRaw.cards) {
  const oid = c.oracleId || c.oracle_id || c.id;
  const score = [
    c.alt ? 1 : 0,
    c.sig ? 1 : 0,
    c.over ? 1 : 0,
    setPriority[c.set] ?? 50,
    c.num ?? 9999,
  ];
  const prev = preferred.get(oid);
  if (!prev || score < prev.score) preferred.set(oid, { score, c });
}

const cards = [...preferred.entries()]
  .map(([oid, { c }]) => {
    const text = c.text || "";
    const keywords = [...new Set([...(text.matchAll(/\[([A-Za-z][A-Za-z -]*?)\]/g) || [])].map((m) => m[1]))].sort();
    return {
      id: c.id,
      oracleId: oid,
      name: c.name,
      type: c.type || "",
      domains: c.domains || [],
      energy: c.energy ?? null,
      power: c.power ?? null,
      might: c.might ?? null,
      rarity: c.rarity || "",
      set: c.set || "",
      setName: c.setName || "",
      tags: c.tags || [],
      text,
      keywords,
      imgUrl: c.imgUrl || "",
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const rulings = [];
for (const entry of rulingsRaw.cards || []) {
  const cardName = entry.card || entry.title;
  for (const r of entry.rulings || []) {
    const html = r.html || "";
    let citations = [...html.matchAll(/title="Core Rules ([^"]+)"/g)].map((m) => m[1]);
    if (!citations.length) citations = [...html.matchAll(/#R([0-9.a-zA-Z]+)/g)].map((m) => m[1]);
    rulings.push({
      id: `${cardName}:${r.id}`,
      card: cardName,
      question: r.question || "",
      answer: stripHtml(html || r.comment || ""),
      citations,
      url: entry.url || "",
      rulesVersion: entry.rulesVersion || "",
    });
  }
}

const rules = [];
for (const row of rulesRaw.rules || []) {
  const content = (row.content || "").trim();
  if (!content) continue;
  rules.push({
    n: row.ruleNumber || "",
    t: row.ruleType || "",
    c: content,
    d: row.depth || 0,
  });
}

const out = {
  meta: {
    cards: cards.length,
    rulings: rulings.length,
    rules: rules.length,
    rulesVersion: rulesRaw.version,
    rulingsSource: {
      name: "Riftbound FAQ",
      url: "https://www.riftboundfaq.com",
      license: rulingsRaw.license,
      licenseUrl: rulingsRaw.licenseUrl,
      commit: rulingsRaw.commit,
      committedAt: rulingsRaw.committedAt,
    },
    cardsSource: "RiftHunt (community catalog; card text © Riot Games)",
    fetchedNote: "Unofficial helper. Official Core Rules always take precedence.",
  },
  cards,
  rulings,
  rules,
};

const outPath = join(root, "public/data/index.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out));
console.log(`wrote ${outPath} (${cards.length} cards, ${rulings.length} rulings, ${rules.length} rules)`);