# Rules Iconography Catalogue

Source reviewed: official Malifaux rules site pages:
- `https://malifauxrules.com/rules/47-fate-deck`
- `https://malifauxrules.com/rules/48-abilities-and-actions`
- `https://malifauxrules.com/rules/51-duels`
- `https://malifauxrules.com/rules/2-stat-card`
- `https://malifauxrules.com/rules/21-soulstones`

The rules site serializes inline rules icons as structured objects, for example `{ "soulstone": { "inline": true } }`. The app uses custom SVG-style icons and standard card-suit glyphs instead of copying official art assets, so the UI can reference the same concepts clearly without depending on proprietary image files or icon fonts.

## Core Rules Icons

| Icon key | Meaning | App treatment | Where used |
| --- | --- | --- | --- |
| `soulstone` | Soulstone cost, pool, drain, or infusion | Gem icon | Soulstone totals, costs, soulstone actions, trigger costs |
| `ram` | Rams suit, equivalent to hearts | Heart suit glyph | Trigger suit badges |
| `mask` | Masks suit, equivalent to diamonds | Diamond suit glyph | Trigger suit badges |
| `tome` | Tomes suit, equivalent to clubs | Club suit glyph | Trigger suit badges |
| `crow` | Crows suit, equivalent to spades | Spade suit glyph | Trigger suit badges |
| `positive` | Positive fate modifier | Plus-in-circle icon | Future flip display |
| `negative` | Negative fate modifier | Minus-in-circle icon | Future flip display |
| `melee` | Melee attack action type | Crossed-swords icon | Action/range chips |
| `missile` | Missile attack action type | Crosshair icon | Action/range chips |
| `magic` | Magic attack action type | Sparkles icon | Action/range chips |
| `pulse` | Pulse range or area effect | Wave icon | Action/range chips |
| `aura` | Aura range or area effect | Circle-dot icon | Reserved for aura effects |
| `signature` | Signature action marker | Feather icon | Action chips |
| `fortitude` | Defensive ability category marker | Strength icon | Reserved for defensive ability display |

## Extracted Card Data Encoding

The current card JSON uses compact prefix letters for several imported rules symbols:

| Card text prefix | Rules concept |
| --- | --- |
| `y` in range | Melee action |
| `q` in range | Missile action |
| `z` in range | Magic action |
| `p` in range | Pulse |
| `f` before action name | Signature action |
| `s` before action name | Soulstone action |
| trigger condition `r` | Rams suit |
| trigger condition `m` | Masks suit |
| trigger condition `t` | Tomes suit |
| trigger condition `c` | Crows suit |
| trigger condition `s` / `ss` | Soulstone cost |

## App-Specific Icons

The app also adds matching utility icons for planning concepts that are not rules-site icons:

| Icon key | Meaning |
| --- | --- |
| `defense`, `willpower`, `speed`, `size` | Stat chips |
| `keyword`, `master`, `totem`, `unique`, `versatile` | Model identity chips |
| `strategy` | Strategy context and strategy fit |
| `collection` | Player collection availability |
| `prediction` | Predicted opponent picks |
| `draft` | Draft crew output |
| `score` | Recommendation score dimensions |
