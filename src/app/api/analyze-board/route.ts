import { NextResponse } from "next/server";

type Body = {
  imageDataUrl?: string;
  phase?: string;
  situation?: string;
  pieceNames?: string[];
};

/**
 * Optional vision pass for board photos.
 * Uses OPENAI_API_KEY when set; otherwise returns sample guidance so the
 * board builder still works without secrets on this VM.
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const imageDataUrl = body.imageDataUrl?.trim() ?? "";
  if (!imageDataUrl.startsWith("data:image/") || imageDataUrl.length > 8_000_000) {
    return NextResponse.json(
      { ok: false, error: "Send a reasonable-size board photo as a data URL." },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return NextResponse.json({
      ok: true,
      sample: true,
      description:
        body.situation?.trim() ||
        "Photo received locally. Describe the disputed play in the situation box and add the visible cards by name for a rules check.",
      cards: body.pieceNames ?? [],
      note: "Vision analysis activates after OPENAI_API_KEY is bound for the published app. Until then, use the board builder + situation text.",
    });
  }

  try {
    const prompt = [
      "You help Riftbound TCG players resolve disputed board states.",
      "From the board photo, list visible card names (English) and one short paragraph describing the board and any obvious chain/showdown state.",
      "Return strict JSON: {\"description\": string, \"cards\": string[], \"note\": string}",
      `Known phase hint: ${body.phase ?? "unknown"}`,
      `Player notes: ${body.situation ?? ""}`,
      `Already listed cards: ${(body.pieceNames ?? []).join(", ")}`,
    ].join("\n");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        max_tokens: 600,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { ok: false, error: `Vision provider error (${res.status})`, detail: errText.slice(0, 300) },
        { status: 502 },
      );
    }

    const payload = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = payload.choices?.[0]?.message?.content ?? "{}";
    let parsed: { description?: string; cards?: string[]; note?: string } = {};
    try {
      parsed = JSON.parse(raw) as { description?: string; cards?: string[]; note?: string };
    } catch {
      parsed = { description: raw, cards: [], note: "Model returned non-JSON; used raw text." };
    }

    return NextResponse.json({
      ok: true,
      sample: false,
      description: parsed.description ?? "",
      cards: Array.isArray(parsed.cards) ? parsed.cards.slice(0, 20) : [],
      note: parsed.note ?? "Parsed from board photo.",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Vision request failed" },
      { status: 500 },
    );
  }
}