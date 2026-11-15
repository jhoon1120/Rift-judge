import type { AppIndex, Card, Ruling } from "./types";
import { detectCards, rulingsForCard, searchIndex } from "./search";

export type BoardZone =
  | "friendly"
  | "enemy"
  | "battlefield"
  | "gear"
  | "chain"
  | "hand";

export type BoardPiece = {
  id: string;
  card: Card;
  zone: BoardZone;
  controller: "you" | "opponent" | "shared";
  notes?: string;
};

export type BoardPhase =
  | "unknown"
  | "main"
  | "showdown"
  | "combat-damage"
  | "end-step"
  | "chain-resolving";

export type FindingSeverity = "ok" | "watch" | "risk" | "info";

export type BoardFinding = {
  id: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  citations: string[];
  relatedCards: string[];
  rulings: Ruling[];
};

export type BoardState = {
  pieces: BoardPiece[];
  phase: BoardPhase;
  situation: string;
};

export type BoardAnalysis = {
  findings: BoardFinding[];
  mentionedCards: Card[];
  summary: string;
};

const ZONE_LABEL: Record<BoardZone, string> = {
  friendly: "Your units",
  enemy: "Opponent units",
  battlefield: "Battlefields",
  gear: "Gear",
  chain: "On the chain",
  hand: "Hand / proposed play",
};

export function zoneLabel(zone: BoardZone): string {
  return ZONE_LABEL[zone];
}

function hasKeyword(card: Card, kw: string): boolean {
  const key = kw.toLowerCase();
  return (
    card.keywords.some((k) => k.toLowerCase() === key) ||
    card.text.toLowerCase().includes(`[${key}]`) ||
    card.text.toLowerCase().includes(key)
  );
}

function textHas(card: Card, ...needles: string[]): boolean {
  const t = `${card.name} ${card.text}`.toLowerCase();
  return needles.some((n) => t.includes(n.toLowerCase()));
}

function uniqFindings(findings: BoardFinding[]): BoardFinding[] {
  const seen = new Set<string>();
  const out: BoardFinding[] = [];
  for (const f of findings) {
    const key = `${f.severity}|${f.title}|${f.relatedCards.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

function severityRank(s: FindingSeverity): number {
  return { risk: 0, watch: 1, info: 2, ok: 3 }[s];
}

/** Build pieces from free-text board description by detecting card names. */
export function piecesFromDescription(
  index: AppIndex,
  text: string,
  defaultZone: BoardZone = "friendly",
): BoardPiece[] {
  const cards = detectCards(text, index.cards, 12);
  return cards.map((card, i) => ({
    id: `desc-${card.oracleId}-${i}`,
    card,
    zone: guessZone(card, text, defaultZone),
    controller: guessController(card, text),
  }));
}

function guessZone(card: Card, text: string, fallback: BoardZone): BoardZone {
  const t = text.toLowerCase();
  const name = card.name.toLowerCase();
  const around = t.includes(name) ? t.slice(Math.max(0, t.indexOf(name) - 40), t.indexOf(name) + name.length + 40) : t;
  if (card.type === "Battlefield" || around.includes("battlefield")) return "battlefield";
  if (card.type === "Gear" || around.includes("equip") || around.includes("gear")) return "gear";
  if (card.type === "Spell" || around.includes("cast") || around.includes("chain") || around.includes("playing"))
    return "chain";
  if (around.includes("hand")) return "hand";
  if (around.includes("opponent") || around.includes("their") || around.includes("enemy")) return "enemy";
  return fallback;
}

function guessController(card: Card, text: string): BoardPiece["controller"] {
  const t = text.toLowerCase();
  const name = card.name.toLowerCase();
  const at = t.indexOf(name);
  const around = at >= 0 ? t.slice(Math.max(0, at - 48), at + name.length + 24) : t;
  if (card.type === "Battlefield") return "shared";
  if (around.includes("opponent") || around.includes("their ") || around.includes("enemy")) return "opponent";
  return "you";
}

export function analyzeBoardState(index: AppIndex, state: BoardState): BoardAnalysis {
  const fromText = state.situation.trim().length >= 3 ? piecesFromDescription(index, state.situation) : [];
  const pieces = mergePieces(state.pieces, fromText);
  const cards = pieces.map((p) => p.card);
  const findings: BoardFinding[] = [];
  const situation = state.situation.toLowerCase();
  const phase = state.phase;

  if (pieces.length === 0) {
    return {
      findings: [
        {
          id: "empty",
          severity: "info",
          title: "No board yet",
          detail:
            "Add cards to zones, describe the board in plain language, or both. Then run analysis to check timing, targeting, and keyword clashes.",
          citations: [],
          relatedCards: [],
          rulings: [],
        },
      ],
      mentionedCards: [],
      summary: "Add cards or describe the situation to analyze interactions.",
    };
  }

  // Collect FAQ rulings for every card on the board
  const boardRulingPool: Ruling[] = [];
  for (const card of cards) {
    boardRulingPool.push(...rulingsForCard(index, card.name));
  }

  // Phase-aware Action / Reaction checks
  const chainSpells = pieces.filter((p) => p.zone === "chain" || p.zone === "hand");
  const actions = chainSpells.filter((p) => hasKeyword(p.card, "Action"));
  const reactions = chainSpells.filter((p) => hasKeyword(p.card, "Reaction"));

  if (phase === "showdown" && actions.length > 0) {
    for (const p of actions) {
      findings.push({
        id: `action-showdown-${p.id}`,
        severity: "watch",
        title: `${p.card.name} is an Action during a showdown`,
        detail:
          "[Action] spells can be played on your turn or in showdowns. Confirm open timing windows and that no closed-state restriction (for example after combat damage has begun resolving) blocks this play.",
        citations: ["Action", "showdown"],
        relatedCards: [p.card.name],
        rulings: rulingsForCard(index, p.card.name).slice(0, 2),
      });
    }
  }

  if ((phase === "combat-damage" || situation.includes("after damage") || situation.includes("combat damage")) && chainSpells.length > 0) {
    findings.push({
      id: "timing-combat-damage",
      severity: "risk",
      title: "Plays during combat damage need a legal window",
      detail:
        "Once combat damage is dealing/resolving, many players incorrectly try to insert Actions. Check whether a Reaction window, triggered ability, or Deathknell is actually open before allowing the play.",
      citations: ["combat", "damage", "Reaction"],
      relatedCards: chainSpells.map((p) => p.card.name),
      rulings: boardRulingPool.filter((r) => /damage|deathknell|showdown/i.test(r.question + r.answer)).slice(0, 3),
    });
  }

  // Can't beats can
  const forbids = cards.filter((c) => /can'?t|cannot|only .* if|prevent|stop/i.test(c.text));
  const allows = cards.filter((c) => /\bmay\b|you may|can /i.test(c.text));
  if (forbids.length && allows.length) {
    for (const bad of forbids) {
      for (const good of allows) {
        if (bad.oracleId === good.oracleId) continue;
        const overlap = verbOverlap(bad.text, good.text);
        const namedInSituation =
          situation.includes(bad.name.toLowerCase()) && situation.includes(good.name.toLowerCase());
        const disputeHint =
          /can'?t|cannot|prevent|stop|ignore|instead|illegal|allowed|may/i.test(situation);
        if (!(overlap || namedInSituation || (disputeHint && pieces.length <= 6))) continue;
        findings.push({
          id: `cant-can-${bad.oracleId}-${good.oracleId}`,
          severity: "watch",
          title: `“Can’t” vs “can” between ${bad.name} and ${good.name}`,
          detail:
            "Silver Rule 054: effects that forbid an action generally beat effects that allow it. If one card says something can’t happen and another says it can/may, the forbid usually wins unless a more specific card instruction applies.",
          citations: ["054", "054.1", "054.2"],
          relatedCards: [bad.name, good.name],
          rulings: [...rulingsForCard(index, bad.name), ...rulingsForCard(index, good.name)].slice(0, 3),
        });
      }
    }
  }

  // Deathknell ordering
  const deathknells = pieces.filter((p) => hasKeyword(p.card, "Deathknell"));
  if (
    deathknells.length >= 1 &&
    (phase === "combat-damage" ||
      situation.includes("die") ||
      situation.includes("dies") ||
      situation.includes("death") ||
      situation.includes("kill") ||
      situation.includes("combat"))
  ) {
    findings.push({
      id: "deathknell-order",
      severity: deathknells.length > 1 ? "risk" : "watch",
      title:
        deathknells.length > 1
          ? "Multiple Deathknells may need ordered resolution"
          : `${deathknells[0].card.name} Deathknell timing`,
      detail:
        "Deathknell triggers when the unit dies. If several die together (common in combat), determine the correct trigger order and legal targets—units that already left may no longer be legal targets. Check each Deathknell’s FAQ for same-batch targeting.",
      citations: ["Deathknell"],
      relatedCards: deathknells.map((p) => p.card.name),
      rulings: deathknells.flatMap((p) => rulingsForCard(index, p.card.name)).slice(0, 4),
    });
  }

  // Hidden
  const hidden = pieces.filter((p) => hasKeyword(p.card, "Hidden"));
  if (hidden.length && (situation.includes("target") || situation.includes("look") || situation.includes("reveal") || chainSpells.length)) {
    findings.push({
      id: "hidden",
      severity: "watch",
      title: "Hidden cards restrict information and interaction",
      detail:
        "Hidden objects are face-down / obscured. Confirm whether the proposed effect can legally target, look at, or interact with a Hidden card before allowing the play.",
      citations: ["Hidden"],
      relatedCards: hidden.map((p) => p.card.name),
      rulings: hidden.flatMap((p) => rulingsForCard(index, p.card.name)).slice(0, 3),
    });
  }

  // Deflect / Tank
  const deflect = pieces.filter((p) => hasKeyword(p.card, "Deflect"));
  const tank = pieces.filter((p) => hasKeyword(p.card, "Tank"));
  if (deflect.length && (situation.includes("damage") || situation.includes("spell") || chainSpells.length)) {
    findings.push({
      id: "deflect",
      severity: "watch",
      title: "Deflect may change who takes the hit",
      detail:
        "If a damaging spell or ability is aimed at a Deflect unit’s side, verify whether Deflect redirects or modifies that damage before resolving the effect as announced.",
      citations: ["Deflect"],
      relatedCards: deflect.map((p) => p.card.name),
      rulings: deflect.flatMap((p) => rulingsForCard(index, p.card.name)).slice(0, 2),
    });
  }
  if (tank.length && (situation.includes("combat") || situation.includes("attack") || phase === "showdown" || phase === "combat-damage")) {
    findings.push({
      id: "tank",
      severity: "info",
      title: "Tank affects combat assignment",
      detail:
        "Tank changes how combatants must be assigned or blocked. Confirm the Tank unit is still present and controlling the combat obligation before damage.",
      citations: ["Tank"],
      relatedCards: tank.map((p) => p.card.name),
      rulings: tank.flatMap((p) => rulingsForCard(index, p.card.name)).slice(0, 2),
    });
  }

  // Counter + Flow
  const counters = cards.filter((c) => textHas(c, "counter a spell", "counter that spell", "counter it"));
  const flow = cards.filter((c) => hasKeyword(c, "Flow"));
  if (counters.length && flow.length) {
    findings.push({
      id: "counter-flow",
      severity: "risk",
      title: "Counter interacting with Flow",
      detail:
        "Countering a Flow spell can change its destination via replacement effects. Do not assume the countered spell simply goes to trash/hand—check the specific counter text and Flow’s delayed replacement.",
      citations: ["Flow", "355.10", "426.1"],
      relatedCards: [...counters.map((c) => c.name), ...flow.map((c) => c.name)],
      rulings: [...counters, ...flow].flatMap((c) => rulingsForCard(index, c.name)).slice(0, 4),
    });
  }

  // Equip / Weaponmaster
  const gear = pieces.filter((p) => p.zone === "gear" || p.card.type === "Gear");
  const weaponmaster = pieces.filter((p) => hasKeyword(p.card, "Weaponmaster"));
  if (gear.length && (situation.includes("equip") || situation.includes("move") || weaponmaster.length)) {
    findings.push({
      id: "equip",
      severity: "info",
      title: "Equip / gear attachment check",
      detail:
        "Confirm the gear’s equip target is legal (correct unit type/controller) and whether Weaponmaster or other replacement effects change attach timing or cost.",
      citations: ["Equip", "Weaponmaster"],
      relatedCards: [...gear.map((p) => p.card.name), ...weaponmaster.map((p) => p.card.name)],
      rulings: [...gear, ...weaponmaster].flatMap((p) => rulingsForCard(index, p.card.name)).slice(0, 3),
    });
  }

  // Situation-driven FAQ retrieval
  if (state.situation.trim().length >= 8) {
    const hits = searchIndex(index, state.situation, 10).filter((h) => h.kind === "ruling");
    for (const hit of hits.slice(0, 4)) {
      if (hit.kind !== "ruling") continue;
      findings.push({
        id: `faq-${hit.ruling.id}`,
        severity: "info",
        title: hit.ruling.question,
        detail: hit.ruling.answer,
        citations: hit.ruling.citations.slice(0, 6),
        relatedCards: [hit.ruling.card],
        rulings: [hit.ruling],
      });
    }
  }

  // Per-card FAQ nudge when a card has rulings
  for (const card of cards) {
    const rs = rulingsForCard(index, card.name);
    if (rs.length === 0) continue;
    findings.push({
      id: `card-faq-${card.oracleId}`,
      severity: "ok",
      title: `${card.name} has ${rs.length} FAQ ruling${rs.length === 1 ? "" : "s"}`,
      detail: rs.map((r) => r.question).slice(0, 3).join(" · "),
      citations: [],
      relatedCards: [card.name],
      rulings: rs.slice(0, 3),
    });
  }

  // Golden rule reminder when card text looks exceptional
  if (cards.some((c) => /instead|ignore|as though|can't be|cannot be/i.test(c.text))) {
    findings.push({
      id: "golden-rule",
      severity: "info",
      title: "Card text beats general rules when they conflict",
      detail:
        "Golden Rule 002: if a card fundamentally contradicts the rules, follow the card. Still apply Silver Rule terminology and “can’t beats can” when interpreting permissions.",
      citations: ["002", "051", "054"],
      relatedCards: cards.filter((c) => /instead|ignore|as though|can't be|cannot be/i.test(c.text)).map((c) => c.name),
      rulings: [],
    });
  }

  const sorted = uniqFindings(findings).sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  const risks = sorted.filter((f) => f.severity === "risk").length;
  const watches = sorted.filter((f) => f.severity === "watch").length;
  const summary =
    risks > 0
      ? `${risks} likely timing/legality risk${risks === 1 ? "" : "s"} and ${watches} things to verify across ${pieces.length} cards.`
      : watches > 0
        ? `${watches} interaction${watches === 1 ? "" : "s"} to verify across ${pieces.length} cards—no hard red flags from heuristics.`
        : `Checked ${pieces.length} cards. No heuristic red flags; review linked FAQ entries for edge cases.`;

  return {
    findings: sorted,
    mentionedCards: dedupeCards(cards),
    summary,
  };
}

function mergePieces(primary: BoardPiece[], secondary: BoardPiece[]): BoardPiece[] {
  const out = [...primary];
  const seen = new Set(primary.map((p) => p.card.oracleId));
  for (const p of secondary) {
    if (seen.has(p.card.oracleId)) continue;
    seen.add(p.card.oracleId);
    out.push(p);
  }
  return out;
}

function dedupeCards(cards: Card[]): Card[] {
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const c of cards) {
    if (seen.has(c.oracleId)) continue;
    seen.add(c.oracleId);
    out.push(c);
  }
  return out;
}

function verbOverlap(a: string, b: string): boolean {
  const verbs = ["move", "play", "target", "damage", "ready", "exhaust", "kill", "banish", "recall", "equip", "attack", "defend"];
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  return verbs.some((v) => al.includes(v) && bl.includes(v));
}

export const PHASE_OPTIONS: { id: BoardPhase; label: string }[] = [
  { id: "unknown", label: "Not sure" },
  { id: "main", label: "Main / open" },
  { id: "showdown", label: "Showdown" },
  { id: "combat-damage", label: "Combat damage" },
  { id: "chain-resolving", label: "Chain resolving" },
  { id: "end-step", label: "End of turn" },
];

export const ZONE_OPTIONS: { id: BoardZone; label: string }[] = [
  { id: "friendly", label: "Your units" },
  { id: "enemy", label: "Opponent units" },
  { id: "battlefield", label: "Battlefields" },
  { id: "gear", label: "Gear" },
  { id: "chain", label: "On the chain" },
  { id: "hand", label: "About to play" },
];