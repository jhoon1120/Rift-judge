"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import {
  PHASE_OPTIONS,
  ZONE_OPTIONS,
  analyzeBoardState,
  zoneLabel,
  type BoardAnalysis,
  type BoardPhase,
  type BoardPiece,
  type BoardZone,
  type FindingSeverity,
} from "@/lib/board";
import { searchIndex } from "@/lib/search";
import type { AppIndex, Card, Ruling } from "@/lib/types";

type Props = {
  index: AppIndex;
  onOpenCard: (card: Card) => void;
  onOpenRuling: (ruling: Ruling) => void;
};

function severityStyle(s: FindingSeverity): { color: string; label: string } {
  switch (s) {
    case "risk":
      return { color: "var(--danger)", label: "RISK" };
    case "watch":
      return { color: "var(--ember)", label: "CHECK" };
    case "ok":
      return { color: "var(--teal)", label: "FAQ" };
    default:
      return { color: "var(--cream-dim)", label: "NOTE" };
  }
}

export default function BoardAnalyzer({ index, onOpenCard, onOpenRuling }: Props) {
  const [pieces, setPieces] = useState<BoardPiece[]>([]);
  const [phase, setPhase] = useState<BoardPhase>("unknown");
  const [situation, setSituation] = useState("");
  const [addZone, setAddZone] = useState<BoardZone>("friendly");
  const [cardQuery, setCardQuery] = useState("");
  const deferredCardQuery = useDeferredValue(cardQuery);
  const [analysis, setAnalysis] = useState<BoardAnalysis | null>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const suggestions = useMemo(() => {
    if (!deferredCardQuery.trim() || deferredCardQuery.trim().length < 2) return [] as Card[];
    return searchIndex(index, deferredCardQuery, 8)
      .filter((h) => h.kind === "card")
      .map((h) => (h.kind === "card" ? h.card : null))
      .filter(Boolean) as Card[];
  }, [index, deferredCardQuery]);

  function addCard(card: Card) {
    const piece: BoardPiece = {
      id: `${card.oracleId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      card,
      zone: addZone,
      controller: addZone === "enemy" ? "opponent" : addZone === "battlefield" ? "shared" : "you",
    };
    setPieces((prev) => [...prev, piece]);
    setCardQuery("");
    setAnalysis(null);
  }

  function removePiece(id: string) {
    setPieces((prev) => prev.filter((p) => p.id !== id));
    setAnalysis(null);
  }

  function movePiece(id: string, zone: BoardZone) {
    setPieces((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              zone,
              controller: zone === "enemy" ? "opponent" : zone === "battlefield" ? "shared" : "you",
            }
          : p,
      ),
    );
    setAnalysis(null);
  }

  function runAnalysis() {
    startTransition(() => {
      const result = analyzeBoardState(index, { pieces, phase, situation });
      setAnalysis(result);
    });
  }

  async function onPhotoSelected(file: File | null) {
    if (!file) return;
    setBusy(true);
    setPhotoNote(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await fetch("/api/analyze-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: dataUrl,
          phase,
          situation,
          pieceNames: pieces.map((p) => p.card.name),
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        description?: string;
        cards?: string[];
        note?: string;
        error?: string;
        sample?: boolean;
      };
      if (!res.ok) throw new Error(data.error || "Photo analysis failed");
      if (data.description) {
        setSituation((prev) => (prev ? `${prev}\n${data.description}` : data.description!));
      }
      if (data.cards?.length) {
        for (const name of data.cards) {
          const card = index.cards.find((c) => c.name.toLowerCase() === name.toLowerCase());
          if (card && !pieces.some((p) => p.card.oracleId === card.oracleId)) addCard(card);
        }
      }
      setPhotoNote(
        data.sample
          ? data.note ||
              "Photo OCR needs an API key in production. Description was treated as sample guidance—add cards manually or paste what you see."
          : data.note || "Board photo parsed into the situation box.",
      );
    } catch (err) {
      setPhotoNote(err instanceof Error ? err.message : "Could not read that photo");
    } finally {
      setBusy(false);
    }
  }

  const grouped = ZONE_OPTIONS.map((z) => ({
    ...z,
    items: pieces.filter((p) => p.zone === z.id),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      <section
        className="rounded-2xl border px-4 py-4"
        style={{ borderColor: "var(--line)", background: "rgba(16,24,38,0.55)" }}
      >
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--ember)" }}>
          Board state
        </h2>
        <p className="mb-4 text-sm" style={{ color: "var(--cream-dim)" }}>
          Drop the cards you see, say what someone is trying to do, and Rift Judge flags timing risks, keyword clashes, and linked FAQ rulings.
        </p>

        <label className="mb-3 block text-xs uppercase tracking-[0.14em]" style={{ color: "var(--cream-dim)" }}>
          Phase
        </label>
        <div className="mb-4 flex flex-wrap gap-2">
          {PHASE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setPhase(opt.id);
                setAnalysis(null);
              }}
              className="rounded-full border px-3 py-1.5 text-sm"
              style={{
                borderColor: phase === opt.id ? "rgba(224,161,43,0.55)" : "var(--line)",
                background: phase === opt.id ? "var(--ember-soft)" : "transparent",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <label className="mb-2 block text-xs uppercase tracking-[0.14em]" style={{ color: "var(--cream-dim)" }}>
          What&apos;s happening?
        </label>
        <textarea
          value={situation}
          onChange={(e) => {
            setSituation(e.target.value);
            setAnalysis(null);
          }}
          rows={3}
          placeholder="e.g. Both units die in combat. Opponent wants to Deathknell target my unit that also died. I want to Reaction counter their Flow spell."
          className="mb-3 w-full resize-none rounded-xl border bg-transparent px-3 py-2 text-[15px] outline-none"
          style={{ borderColor: "var(--line)" }}
        />

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <label className="text-xs uppercase tracking-[0.14em]" style={{ color: "var(--cream-dim)" }}>
            Add card to
          </label>
          <select
            value={addZone}
            onChange={(e) => setAddZone(e.target.value as BoardZone)}
            className="rounded-lg border bg-transparent px-2 py-1 text-sm"
            style={{ borderColor: "var(--line)", color: "var(--cream)" }}
          >
            {ZONE_OPTIONS.map((z) => (
              <option key={z.id} value={z.id} style={{ color: "#111", background: "#efe6d2" }}>
                {z.label}
              </option>
            ))}
          </select>
        </div>
        <input
          value={cardQuery}
          onChange={(e) => setCardQuery(e.target.value)}
          placeholder="Search card name…"
          className="w-full rounded-xl border bg-transparent px-3 py-2 text-[15px] outline-none"
          style={{ borderColor: "var(--line)" }}
        />
        {suggestions.length > 0 && (
          <ul className="mt-2 space-y-1">
            {suggestions.map((card) => (
              <li key={card.oracleId}>
                <button
                  type="button"
                  onClick={() => addCard(card)}
                  className="hit-row flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm"
                  style={{ borderColor: "var(--line)" }}
                >
                  <span>
                    {card.name}
                    <span className="ml-2 text-xs" style={{ color: "var(--cream-dim)" }}>
                      {card.type}
                    </span>
                  </span>
                  <span className="text-xs" style={{ color: "var(--ember)" }}>
                    Add
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label
            className="cursor-pointer rounded-full border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--line)", color: "var(--teal)" }}
          >
            {busy ? "Reading photo…" : "Upload board photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={busy}
              onChange={(e) => onPhotoSelected(e.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            onClick={runAnalysis}
            className="rounded-full px-4 py-1.5 text-sm font-semibold"
            style={{ background: "var(--ember)", color: "#1a1205" }}
          >
            Analyze interactions
          </button>
          {pieces.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setPieces([]);
                setAnalysis(null);
              }}
              className="text-sm"
              style={{ color: "var(--cream-dim)" }}
            >
              Clear board
            </button>
          )}
        </div>
        {photoNote && (
          <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--cream-dim)" }}>
            {photoNote}
          </p>
        )}
      </section>

      {grouped.length > 0 && (
        <section className="space-y-3">
          {grouped.map((group) => (
            <div key={group.id}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--cream-dim)" }}>
                {group.label}
              </h3>
              <div className="space-y-2">
                {group.items.map((piece) => (
                  <div
                    key={piece.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-xl border px-3 py-2"
                    style={{ borderColor: "var(--line)", background: "rgba(16,24,38,0.45)" }}
                  >
                    <button type="button" className="text-left" onClick={() => onOpenCard(piece.card)}>
                      <div className="text-sm font-medium">{piece.card.name}</div>
                      <div className="text-xs" style={{ color: "var(--cream-dim)" }}>
                        {piece.card.type}
                        {piece.card.keywords.length ? ` · ${piece.card.keywords.slice(0, 3).join(", ")}` : ""}
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <select
                        value={piece.zone}
                        onChange={(e) => movePiece(piece.id, e.target.value as BoardZone)}
                        className="rounded-md border bg-transparent px-1.5 py-1 text-xs"
                        style={{ borderColor: "var(--line)", color: "var(--cream-dim)" }}
                        aria-label={`Move ${piece.card.name}`}
                      >
                        {ZONE_OPTIONS.map((z) => (
                          <option key={z.id} value={z.id} style={{ color: "#111", background: "#efe6d2" }}>
                            {z.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removePiece(piece.id)}
                        className="text-xs"
                        style={{ color: "var(--danger)" }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {analysis && (
        <section className="space-y-3">
          <div
            className="rounded-2xl border px-4 py-4"
            style={{ borderColor: "rgba(224,161,43,0.35)", background: "var(--ember-soft)" }}
          >
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--ember)" }}>
              Analysis
            </h2>
            <p className="text-[15px] leading-relaxed">{analysis.summary}</p>
          </div>

          {analysis.findings.map((finding) => {
            const tone = severityStyle(finding.severity);
            return (
              <article
                key={finding.id}
                className="rounded-2xl border px-4 py-4"
                style={{ borderColor: "var(--line)", background: "rgba(16,24,38,0.55)" }}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.14em]"
                    style={{ color: tone.color, border: `1px solid ${tone.color}` }}
                  >
                    {tone.label}
                  </span>
                  <h3 className="text-[15px] font-semibold leading-snug">{finding.title}</h3>
                </div>
                <p className="mb-3 text-sm leading-relaxed" style={{ color: "var(--cream)" }}>
                  {finding.detail}
                </p>
                {finding.relatedCards.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {finding.relatedCards.map((name) => {
                      const card = index.cards.find((c) => c.name === name);
                      return (
                        <button
                          key={name}
                          type="button"
                          className="rounded-full border px-2.5 py-1 text-xs"
                          style={{ borderColor: "var(--line)", color: "var(--teal)" }}
                          onClick={() => card && onOpenCard(card)}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                )}
                {finding.citations.length > 0 && (
                  <p className="mb-2 font-mono text-xs" style={{ color: "var(--cream-dim)" }}>
                    {finding.citations.join(" · ")}
                  </p>
                )}
                {finding.rulings.length > 0 && (
                  <ul className="space-y-1">
                    {finding.rulings.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => onOpenRuling(r)}
                          className="hit-row w-full rounded-lg border px-2.5 py-2 text-left text-xs"
                          style={{ borderColor: "var(--line)" }}
                        >
                          {r.question}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </section>
      )}

      {!analysis && pieces.length === 0 && !situation && (
        <p className="text-center text-sm" style={{ color: "var(--cream-dim)" }}>
          Tip: put contested units in their zones, put the spell being cast on the chain, then describe the disputed play.
        </p>
      )}

      {pieces.length > 0 && !analysis && (
        <p className="text-center text-sm" style={{ color: "var(--cream-dim)" }}>
          {pieces.length} card{pieces.length === 1 ? "" : "s"} on board
          {pieces[0] ? ` · first zone: ${zoneLabel(pieces[0].zone)}` : ""}. Tap Analyze when ready.
        </p>
      )}
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}