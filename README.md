# M4E Crew Optimizer

A Next.js web app for matchup-aware Malifaux Fourth Edition crew planning.

## Implementation Plan

1. Normalize the `m4e_cards.json` card pool into typed stat, crew, and upgrade card records.
2. Build a legal-hire catalog from faction and master keyword relationships.
3. Track player ownership separately from the complete legal model pool.
4. Score model recommendations equally across opponent master pressure, friendly crew synergy, and opposing crew composition.
5. Produce two complete point-limited rebuild paths: owned-only Available and unconstrained Optimal.
6. Present crew-level analysis and structured per-model recommendations in a dense planning UI.

## App Structure

- `src/lib/card-data.ts`: imports the JSON card pool, deduplicates repeated copies, extracts masters, keywords, traits, crew cards, upgrades, and tactical tags.
- `src/lib/crew-validation.ts`: validates model limit, point limit, copy limits, and faction/keyword legality.
- `src/lib/matchup-engine.ts`: scores and explains recommendations.
- `src/app/api/cards/route.ts`: backend card catalog route.
- `src/app/api/analyze/route.ts`: backend matchup-analysis route.
- `src/app/page.tsx`: crew entry, ownership tracking, opponent roster, point controls, and recommendation toggle.

## Strategy Model

The engine tags cards for pressure types such as damage, control, mobility, scheme play, markers, healing, card pressure, conditions, soulstone usage, attacks by resisted stat, and defensive tech. It then balances:

- Master abilities: how the recommended model answers the opposing master and crew card.
- Crew synergy: shared keywords and tactical overlap with the player's master and crew card.
- Composition matchup: whether the model fills gaps against the selected opposing roster.

## Running Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Notes

The delivered scope recommends model selections only. Upgrade cards are normalized and available in the data model for future expansion, but the analysis engine intentionally excludes upgrade recommendations.
