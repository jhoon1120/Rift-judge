"use client";

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import BoardAnalyzer from "@/components/BoardAnalyzer";
import { loadIndex } from "@/lib/data";
import {
  QUICK_TOPICS,
  detectCards,
  rulingsForCard,
  rulesAround,
  searchIndex,
} from "@/lib/search";
import type { AppIndex, Card, Ruling, Rule, SearchHit } from "@/lib/types";

type Mode = "ask" | "board";

type Panel =
  | { type: "home" }
  | { type: "card"; card: Card }
  | { type: "ruling"; ruling: Ruling }
  | { type: "rule"; rule: Rule };

function costLine(card: Card): string {
  const bits: string[] = [];
  if (card.energy != null) bits.push(`${card.energy}E`);
  if (card.power != null) bits.push(`${card.power}P`);
  if (card.might != null) bits.push(`${card.might} Might`);
  return bits.join(" · ");
}

function ResultIcon({ kind }: { kind: SearchHit["kind"] }) {
  const label = kind === "ruling" ? "FAQ" : kind === "card" ? "CARD" : "RULE";
  const color =
    kind === "ruling" ? "var(--ember)" : kind === "card" ? "var(--teal)" : "var(--cream-dim)";
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.14em]"
      style={{ color, background: "rgba(239,230,210,0.06)", border: "1px solid var(--line)" }}
    >
      {label}
    </span>
  );
}

export default function RiftJudgeApp() {
  const [index, setIndex] = useState<AppIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("ask");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [panel, setPanel] = useState<Panel>({ type: "home" });
  const [pinned, setPinned] = useState<Card[]>([]);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    loadIndex()
      .then((data) => {
        if (alive) setIndex(data);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "Could not load rules data");
      });
    return () => {
      alive = false;
    };
  }, []);

  const hits = useMemo(() => {
    if (!index || deferredQuery.trim().length < 2) return [] as SearchHit[];
    return searchIndex(index, deferredQuery, 28);
  }, [index, deferredQuery]);

  const mentioned = useMemo(() => {
    if (!index || deferredQuery.trim().length < 2) return [] as Card[];
    return detectCards(deferredQuery, index.cards, 4);
  }, [index, deferredQuery]);

  const rulingHits = hits.filter((h) => h.kind === "ruling");
  const cardHits = hits.filter((h) => h.kind === "card");
  const ruleHits = hits.filter((h) => h.kind === "rule");
  const showResults = deferredQuery.trim().length >= 2;

  function openCard(card: Card) {
    startTransition(() => setPanel({ type: "card", card }));
  }

  function openRuling(ruling: Ruling) {
    startTransition(() => setPanel({ type: "ruling", ruling }));
  }

  function openRule(rule: Rule) {
    startTransition(() => setPanel({ type: "rule", rule }));
  }

  function togglePin(card: Card) {
    setPinned((prev) => {
      if (prev.some((c) => c.oracleId === card.oracleId)) {
        return prev.filter((c) => c.oracleId !== card.oracleId);
      }
      return [...prev, card].slice(-3);
    });
  }

  function applyTopic(q: string) {
    startTransition(() => {
      setPanel({ type: "home" });
      setQuery(q);
    });
  }

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-16 pt-8 sm:px-6">
      <header className="rise mb-6 text-center">
        <p
          className="mb-3 text-[11px] font-semibold uppercase tracking-[0.28em]"
          style={{ color: "var(--ember)" }}
        >
          Table-side rulings
        </p>
        <h1
          className="brand-glow text-5xl font-bold leading-none tracking-tight sm:text-6xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Rift Judge
        </h1>
        <p className="rise rise-delay-1 mx-auto mt-4 max-w-md text-[15px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
          Ask a ruling, or build the board and check whether an interaction is legal.
        </p>
      </header>

      <div
        className="rise rise-delay-1 mb-5 flex justify-center gap-1 rounded-full border p-1"
        style={{ borderColor: "var(--line)", background: "rgba(16,24,38,0.65)" }}
        role="tablist"
        aria-label="Mode"
      >
        {(
          [
            { id: "ask" as const, label: "Ask a ruling" },
            { id: "board" as const, label: "Board check" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={mode === tab.id}
            onClick={() => {
              setMode(tab.id);
              setPanel({ type: "home" });
            }}
            className="min-w-[8.5rem] flex-1 rounded-full px-4 py-2 text-sm font-medium transition"
            style={{
              background: mode === tab.id ? "var(--ember-soft)" : "transparent",
              color: mode === tab.id ? "var(--cream)" : "var(--cream-dim)",
              boxShadow: mode === tab.id ? "inset 0 0 0 1px rgba(224,161,43,0.45)" : "none",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === "ask" && (
      <div className="rise rise-delay-2 sticky top-3 z-20 mb-5">
        <label className="ask-shell flex items-start gap-3 rounded-2xl border px-4 py-3 backdrop-blur-md"
          style={{
            background: "rgba(16,24,38,0.88)",
            borderColor: "var(--line)",
          }}
        >
          <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--ember)" }} />
          <textarea
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (panel.type !== "home") setPanel({ type: "home" });
            }}
            rows={2}
            placeholder="e.g. Where does a Flow spell go if Abandon counters it?"
            className="min-h-[3.25rem] w-full resize-none bg-transparent text-[16px] leading-snug outline-none placeholder:text-[rgba(239,230,210,0.35)]"
            autoFocus
            enterKeyHint="search"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => {
                setQuery("");
                setPanel({ type: "home" });
              }}
              className="mt-1 rounded-lg px-2 py-1 text-sm"
              style={{ color: "var(--cream-dim)" }}
            >
              Clear
            </button>
          )}
        </label>
      </div>
      )}

      {!index && !error && (
        <div className="mb-6 space-y-2" aria-label="Loading rules data">
          <div className="loading-bar rounded-full" />
          <p className="text-center text-xs" style={{ color: "var(--cream-dim)" }}>
            Loading cards, FAQ rulings, and Core Rules…
          </p>
        </div>
      )}
      {error && (
        <p className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          {error}. Refresh the page, or restart with <code>npm run build && npm start</code>.
        </p>
      )}

      {index && mode === "ask" && panel.type === "home" && (
        <section className={`space-y-6 ${showResults ? "mb-2" : "rise rise-delay-3"}`}>
          <div className="flex flex-wrap justify-center gap-2">
            {QUICK_TOPICS.map((topic) => (
              <button
                key={topic.label}
                type="button"
                onClick={() => applyTopic(topic.query)}
                className="rounded-full border px-3 py-1.5 text-sm transition hover:border-[rgba(224,161,43,0.5)]"
                style={{
                  borderColor:
                    deferredQuery.trim().toLowerCase() === topic.query
                      ? "rgba(224,161,43,0.55)"
                      : "var(--line)",
                  background:
                    deferredQuery.trim().toLowerCase() === topic.query
                      ? "var(--ember-soft)"
                      : "rgba(239,230,210,0.03)",
                  color: "var(--cream)",
                }}
              >
                {topic.label}
              </button>
            ))}
          </div>
          {!showResults && (

          <div
            className="rounded-2xl border px-5 py-5"
            style={{ borderColor: "var(--line)", background: "rgba(16,24,38,0.55)" }}
          >
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--ember)" }}>
              How to use
            </h2>
            <ol className="space-y-2 text-sm leading-relaxed" style={{ color: "var(--cream-dim)" }}>
              <li>1. Type a card name, keyword, or the whole interaction question.</li>
              <li>2. Open an FAQ hit first—those cite Core Rules.</li>
              <li>3. Pin up to three cards to compare text side by side.</li>
            </ol>
            <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--cream-dim)" }}>
              {index.meta.cards} cards · {index.meta.rulings} FAQ rulings · Core Rules{" "}
              {index.meta.rulesVersion ?? "current"} · Unofficial helper; official rules win.
            </p>
          </div>
          )}
        </section>
      )}

      {index && mode === "board" && panel.type === "home" && (
        <BoardAnalyzer index={index} onOpenCard={openCard} onOpenRuling={openRuling} />
      )}

      {index && mode === "ask" && panel.type === "home" && showResults && (
        <div className="mt-4 space-y-6">
          {(mentioned.length > 0 || pinned.length > 0) && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--cream-dim)" }}>
                  Cards in play
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {[...pinned, ...mentioned.filter((m) => !pinned.some((p) => p.oracleId === m.oracleId))].map(
                  (card) => {
                    const isPinned = pinned.some((p) => p.oracleId === card.oracleId);
                    return (
                      <button
                        key={card.oracleId}
                        type="button"
                        onClick={() => openCard(card)}
                        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
                        style={{
                          borderColor: isPinned ? "rgba(224,161,43,0.55)" : "var(--line)",
                          background: isPinned ? "var(--ember-soft)" : "rgba(239,230,210,0.03)",
                        }}
                      >
                        <span>{card.name}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePin(card);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              togglePin(card);
                            }
                          }}
                          className="text-[11px] uppercase tracking-wide"
                          style={{ color: "var(--ember)" }}
                        >
                          {isPinned ? "Unpin" : "Pin"}
                        </span>
                      </button>
                    );
                  },
                )}
              </div>
            </section>
          )}

          {rulingHits.length > 0 && (
            <ResultSection title="FAQ rulings" count={rulingHits.length}>
              {rulingHits.map((hit) =>
                hit.kind === "ruling" ? (
                  <button
                    key={hit.ruling.id}
                    type="button"
                    className="hit-row flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left"
                    style={{ borderColor: "var(--line)", background: "rgba(16,24,38,0.45)" }}
                    onClick={() => openRuling(hit.ruling)}
                  >
                    <ResultIcon kind="ruling" />
                    <span className="min-w-0">
                      <span className="mb-1 block text-xs" style={{ color: "var(--ember)" }}>
                        {hit.ruling.card}
                      </span>
                      <span className="block text-[15px] font-medium leading-snug">{hit.ruling.question}</span>
                    </span>
                  </button>
                ) : null,
              )}
            </ResultSection>
          )}

          {cardHits.length > 0 && (
            <ResultSection title="Cards" count={cardHits.length}>
              {cardHits.slice(0, 10).map((hit) =>
                hit.kind === "card" ? (
                  <button
                    key={hit.card.oracleId}
                    type="button"
                    className="hit-row flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left"
                    style={{ borderColor: "var(--line)", background: "rgba(16,24,38,0.45)" }}
                    onClick={() => openCard(hit.card)}
                  >
                    <ResultIcon kind="card" />
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium">{hit.card.name}</span>
                      <span className="mt-0.5 block text-xs" style={{ color: "var(--cream-dim)" }}>
                        {hit.card.type}
                        {hit.card.domains.length ? ` · ${hit.card.domains.join("/")}` : ""}
                        {costLine(hit.card) ? ` · ${costLine(hit.card)}` : ""}
                      </span>
                    </span>
                  </button>
                ) : null,
              )}
            </ResultSection>
          )}

          {ruleHits.length > 0 && (
            <ResultSection title="Core Rules" count={ruleHits.length}>
              {ruleHits.slice(0, 8).map((hit) =>
                hit.kind === "rule" ? (
                  <button
                    key={`${hit.rule.n}-${hit.rule.c.slice(0, 24)}`}
                    type="button"
                    className="hit-row flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left"
                    style={{ borderColor: "var(--line)", background: "rgba(16,24,38,0.45)" }}
                    onClick={() => openRule(hit.rule)}
                  >
                    <ResultIcon kind="rule" />
                    <span className="min-w-0">
                      <span className="mb-1 block font-mono text-xs" style={{ color: "var(--teal)" }}>
                        {hit.rule.n || "—"}
                      </span>
                      <span className="block text-[14px] leading-snug" style={{ color: "var(--cream)" }}>
                        {hit.rule.c}
                      </span>
                    </span>
                  </button>
                ) : null,
              )}
            </ResultSection>
          )}

          {hits.length === 0 && (
            <p className="rounded-xl border px-4 py-6 text-center text-sm" style={{ borderColor: "var(--line)", color: "var(--cream-dim)" }}>
              No matches. Try a card name, keyword like “Deathknell”, or a rule number like 054.
            </p>
          )}
        </div>
      )}

      {index && panel.type === "card" && (
        <CardPanel
          index={index}
          card={panel.card}
          pinned={pinned.some((c) => c.oracleId === panel.card.oracleId)}
          onBack={() => setPanel({ type: "home" })}
          onPin={() => togglePin(panel.card)}
          onOpenRuling={openRuling}
          onOpenRule={openRule}
          onQuery={(q) => {
            setQuery(q);
            setPanel({ type: "home" });
          }}
        />
      )}

      {index && panel.type === "ruling" && (
        <RulingPanel
          index={index}
          ruling={panel.ruling}
          onBack={() => setPanel({ type: "home" })}
          onOpenCard={(name) => {
            const card = index.cards.find((c) => c.name.toLowerCase() === name.toLowerCase());
            if (card) openCard(card);
          }}
          onOpenRule={openRule}
        />
      )}

      {index && panel.type === "rule" && (
        <RulePanel
          index={index}
          rule={panel.rule}
          onBack={() => setPanel({ type: "home" })}
          onOpenRule={openRule}
        />
      )}

      {index && mode === "ask" && pinned.length > 0 && panel.type === "home" && showResults && (
        <section className="mt-8 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--cream-dim)" }}>
            Pinned comparison
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {pinned.map((card) => (
              <button
                key={card.oracleId}
                type="button"
                onClick={() => openCard(card)}
                className="rounded-xl border p-4 text-left"
                style={{ borderColor: "var(--line)", background: "rgba(16,24,38,0.55)" }}
              >
                <div className="mb-1 text-sm font-semibold">{card.name}</div>
                <div className="mb-2 text-xs" style={{ color: "var(--cream-dim)" }}>
                  {card.type} · {costLine(card) || "—"}
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--cream)" }}>
                  {card.text || "No rules text."}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-auto pt-12 text-center text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
        {index ? (
          <>
            Rulings from{" "}
            <a href={index.meta.rulingsSource.url} target="_blank" rel="noreferrer">
              {index.meta.rulingsSource.name}
            </a>
            {index.meta.rulingsSource.license ? ` (${index.meta.rulingsSource.license})` : ""}. Card catalog via
            community data; Riftbound © Riot Games. Not affiliated with Riot.
          </>
        ) : (
          "Loading…"
        )}
      </footer>
    </div>
  );
}

function ResultSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--cream-dim)" }}>
          {title}
        </h2>
        <span className="text-[11px]" style={{ color: "var(--cream-dim)" }}>
          {count}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-4 block text-sm"
      style={{ color: "var(--ember)" }}
    >
      ← Back to results
    </button>
  );
}

function CardPanel({
  index,
  card,
  pinned,
  onBack,
  onPin,
  onOpenRuling,
  onOpenRule,
  onQuery,
}: {
  index: AppIndex;
  card: Card;
  pinned: boolean;
  onBack: () => void;
  onPin: () => void;
  onOpenRuling: (r: Ruling) => void;
  onOpenRule: (r: Rule) => void;
  onQuery: (q: string) => void;
}) {
  const rulings = rulingsForCard(index, card.name);
  return (
    <article className="rise rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "rgba(16,24,38,0.7)" }}>
      <BackButton onBack={onBack} />
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          {card.name}
        </h2>
        <button
          type="button"
          onClick={onPin}
          className="rounded-full border px-3 py-1 text-xs uppercase tracking-wide"
          style={{
            borderColor: pinned ? "rgba(224,161,43,0.55)" : "var(--line)",
            background: pinned ? "var(--ember-soft)" : "transparent",
            color: "var(--ember)",
          }}
        >
          {pinned ? "Pinned" : "Pin"}
        </button>
      </div>
      <p className="mb-4 text-sm" style={{ color: "var(--cream-dim)" }}>
        {card.type}
        {card.domains.length ? ` · ${card.domains.join("/")}` : ""}
        {costLine(card) ? ` · ${costLine(card)}` : ""}
        {card.set ? ` · ${card.set}` : ""}
      </p>
      <p className="mb-5 whitespace-pre-wrap text-[15px] leading-relaxed">{card.text || "No rules text."}</p>
      {card.keywords.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {card.keywords.map((kw) => (
            <button
              key={kw}
              type="button"
              className="rounded-full border px-2.5 py-1 text-xs"
              style={{ borderColor: "var(--line)", color: "var(--teal)" }}
              onClick={() => onQuery(kw)}
            >
              {kw}
            </button>
          ))}
        </div>
      )}
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--ember)" }}>
        FAQ rulings ({rulings.length})
      </h3>
      {rulings.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--cream-dim)" }}>
          No FAQ entry for this card yet. Search Core Rules for its keywords.
        </p>
      ) : (
        <ul className="space-y-2">
          {rulings.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onOpenRuling(r)}
                className="hit-row w-full rounded-xl border px-3 py-3 text-left text-[14px]"
                style={{ borderColor: "var(--line)" }}
              >
                {r.question}
              </button>
            </li>
          ))}
        </ul>
      )}
      {card.keywords[0] && (
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--cream-dim)" }}>
            Related rules
          </h3>
          <div className="space-y-2">
            {searchIndex(index, card.keywords[0], 4)
              .filter((h) => h.kind === "rule")
              .map((h) =>
                h.kind === "rule" ? (
                  <button
                    key={`${h.rule.n}-${h.rule.c.slice(0, 20)}`}
                    type="button"
                    onClick={() => onOpenRule(h.rule)}
                    className="hit-row block w-full rounded-xl border px-3 py-2 text-left text-sm"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <span className="font-mono text-xs" style={{ color: "var(--teal)" }}>
                      {h.rule.n}
                    </span>{" "}
                    {h.rule.c}
                  </button>
                ) : null,
              )}
          </div>
        </div>
      )}
    </article>
  );
}

function RulingPanel({
  index,
  ruling,
  onBack,
  onOpenCard,
  onOpenRule,
}: {
  index: AppIndex;
  ruling: Ruling;
  onBack: () => void;
  onOpenCard: (name: string) => void;
  onOpenRule: (r: Rule) => void;
}) {
  return (
    <article className="rise rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "rgba(16,24,38,0.7)" }}>
      <BackButton onBack={onBack} />
      <button
        type="button"
        onClick={() => onOpenCard(ruling.card)}
        className="mb-2 text-sm font-semibold"
        style={{ color: "var(--ember)" }}
      >
        {ruling.card}
      </button>
      <h2 className="mb-4 text-xl font-bold leading-snug" style={{ fontFamily: "var(--font-display)" }}>
        {ruling.question}
      </h2>
      <p className="mb-5 whitespace-pre-wrap text-[15px] leading-relaxed">{ruling.answer}</p>
      {ruling.citations.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--cream-dim)" }}>
            Citations
          </h3>
          <div className="flex flex-wrap gap-2">
            {ruling.citations.map((cite) => {
              const nearby = rulesAround(index, cite, 0)[0];
              return (
                <button
                  key={cite}
                  type="button"
                  className="rounded-full border px-3 py-1 font-mono text-xs"
                  style={{ borderColor: "var(--line)", color: "var(--teal)" }}
                  onClick={() => nearby && onOpenRule(nearby)}
                >
                  {cite}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {ruling.url && (
        <a href={ruling.url} target="_blank" rel="noreferrer" className="text-sm">
          Open on Riftbound FAQ →
        </a>
      )}
    </article>
  );
}

function RulePanel({
  index,
  rule,
  onBack,
  onOpenRule,
}: {
  index: AppIndex;
  rule: Rule;
  onBack: () => void;
  onOpenRule: (r: Rule) => void;
}) {
  const nearby = rulesAround(index, rule.n || "000", 3);
  return (
    <article className="rise rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "rgba(16,24,38,0.7)" }}>
      <BackButton onBack={onBack} />
      <p className="mb-2 font-mono text-sm" style={{ color: "var(--teal)" }}>
        {rule.n || "—"} · {rule.t}
      </p>
      <h2 className="mb-6 text-xl font-bold leading-snug" style={{ fontFamily: "var(--font-display)" }}>
        {rule.c}
      </h2>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--cream-dim)" }}>
        Nearby rules
      </h3>
      <div className="scroll-thin max-h-[50vh] space-y-2 overflow-y-auto pr-1">
        {nearby.map((r) => (
          <button
            key={`${r.n}-${r.c.slice(0, 24)}`}
            type="button"
            onClick={() => onOpenRule(r)}
            className="hit-row block w-full rounded-xl border px-3 py-2 text-left text-sm"
            style={{
              borderColor: r.n === rule.n && r.c === rule.c ? "rgba(224,161,43,0.45)" : "var(--line)",
              background: r.n === rule.n && r.c === rule.c ? "var(--ember-soft)" : "transparent",
            }}
          >
            <span className="font-mono text-xs" style={{ color: "var(--teal)" }}>
              {r.n}
            </span>{" "}
            {r.c}
          </button>
        ))}
      </div>
    </article>
  );
}