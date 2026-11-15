# Rift Judge

Table-side helper for **Riftbound** TCG rulings and board-state checks.

## Modes

### Ask a ruling
Type a question, card name, or keyword to search FAQ rulings, card text, and Core Rules citations.

### Board check
Build the board (zones + phase + situation), optionally upload a photo, then **Analyze interactions** for timing risks, keyword clashes, Deathknell/Flow/counter issues, and linked FAQ answers.

Photo vision uses `OPENAI_API_KEY` when set; without it, use the board builder + situation text (fully offline heuristics).

## Run locally

```bash
npm install
npm run build
npm start
# open http://127.0.0.1:3000
```

Dev: `npm run dev`

## Data

`public/data/{meta,cards,rulings,rules}.json` is built from community catalogs and FAQ rulings:

```bash
node scripts/build-index.mjs
```

Rulings from [Riftbound FAQ](https://www.riftboundfaq.com) (CC BY-SA 4.0). Unofficial helper—official Core Rules always win. Riftbound © Riot Games.