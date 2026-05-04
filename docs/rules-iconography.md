# Rules Iconography Catalogue

Source reviewed: official Malifaux rules site pages:
- `https://malifauxrules.com/rules/47-fate-deck`
- `https://malifauxrules.com/rules/48-abilities-and-actions`
- `https://malifauxrules.com/rules/51-duels`
- `https://malifauxrules.com/rules/2-stat-card`
- `https://malifauxrules.com/rules/21-soulstones`

The rules site serializes inline rules icons as structured objects, for example `{ "soulstone": { "inline": true } }`. The app uses compact text-mark badges instead of copying official art assets, so the UI can reference the same concepts clearly without depending on proprietary image files or icon fonts.

## Core Rules Icons

| Icon key | Meaning | App mark | Where used |
| --- | --- | --- | --- |
| `soulstone` | Soulstone cost, pool, drain, or infusion | `SS` | Soulstone totals, costs, soulstone actions, trigger costs |
| `ram` | Rams suit, equivalent to hearts | `R` | Trigger suit badges |
| `mask` | Masks suit, equivalent to diamonds | `M` | Trigger suit badges |
| `tome` | Tomes suit, equivalent to clubs | `T` | Trigger suit badges |
| `crow` | Crows suit, equivalent to spades | `C` | Trigger suit badges |
| `positive` | Positive fate modifier | `+` | Future flip display |
| `negative` | Negative fate modifier | `-` | Future flip display |
| `melee` | Melee attack action type | `M` | Action/range chips |
| `missile` | Missile attack action type | `R` | Action/range chips |
| `magic` | Magic attack action type | `A` | Action/range chips |
| `pulse` | Pulse range or area effect | `P` | Action/range chips |
| `aura` | Aura range or area effect | `A` | Reserved for aura effects |
| `signature` | Signature action marker | `Sig` | Action chips |
| `fortitude` | Defensive ability category marker | `Ft` | Reserved for defensive ability display |

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

