# Rift Judge

Table-side helper for **Riftbound** TCG rulings and card interactions.

Type a question, card name, or keyword to search:

- FAQ rulings (from [Riftbound FAQ](https://www.riftboundfaq.com), CC BY-SA 4.0)
- Card rules text
- Core Rules citations

## Develop

```bash
npm install
npm run dev
```

## Data

`public/data/index.json` is built from community card catalogs and FAQ rulings. Regenerate with:

```bash
# from project root after refreshing data/cards.json, data/rulings.json, data/core-rules.json
node scripts/build-index.mjs
```

Unofficial helper. Official Riftbound Core Rules always take precedence. Riftbound © Riot Games.