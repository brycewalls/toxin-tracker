# Recon: PepPedia (iOS) → Botox Tracker

Scope: rebuild PepPedia's UX/UI patterns (not content) as a neurotoxin injection tracker. Platform: mobile web, prototyped as a claude.ai artifact. Audience: Bryce, personal use / possible product.

## Sources
| source | url |
|---|---|
| App Store listing | https://apps.apple.com/us/app/peppedia/id6755275369 |
| iTunes lookup (8 screenshots) | https://itunes.apple.com/lookup?id=6755275369 |

## Screen inventory (from screenshots)
| ID | screen | purpose | key components |
|---|---|---|---|
| S01 | Vitals / dashboard (light) | body map of injection sites + metric cards | body diagram with leader-line labels (site, product, date), Front/Back segmented control, "Rotate sites" hint, active-level sparkline card, weight card |
| S02 | Compound detail | dosing table + timing note | back nav, Inj/Oral segmented pill, table w/ + buttons, blue tinted info callout, list rows w/ green pill |
| S03 | Insights story | full-bleed photo story, stat trio, AI summary | progress bars, bar chart, "Improving" pill |
| S04 | Interactions | list w/ tabs | underline tabs, check-circle rows, green pills, chevrons |
| S05 | Calculator | stepwise reconstitution | numbered step circles, unit toggles (mg/IU), chip grid (2/3/5/10 mL), segmented Daily/Twice/Weekly |
| S06 | Half-life tracker | levels over time | range chips 24h/7d/30d/60d, area chart, legend rows w/ value |
| S07 | Inventory | vials linked to protocols | vial thumbnail cards, "8 available · 1 used", Linked / Not linked pills, ⋮ menu, + header action |
| S08 | Home (dark) | greeting, stats, mood, today's doses | blue gradient hero, circular stat chips (RHR/Steps/Weight), "How are you?" 7-day face row, Today's Doses rows w/ time, check or Log button |

## Design language
Light: #F3F4F7 ground, white cards r≈20, hairline dividers, light-weight SF type, royal blue accent (#2F55E4), green success pills (#E6F6EC/#27A35A). Dark: near-black cards over a deep blue radial gradient hero. Thin outline icons. Lots of whitespace, small grey caps labels ("ACTIVE LEVELS").

## Flows
- F01 Log an injection: Today → + → pick product/vial → tap face sites → units per site → save (target ≤ 6 taps)
- F02 Check timers: Today → aftercare countdown card
- F03 Stock: Stock → + vial → linked status, units left auto-decrement on log
- F04 Photos: History/Face → before photo → after photo → side-by-side compare
- F05 Reaction: Injection detail → add reaction (type, severity, onset)
- F06 Live face map: Face → take/upload photo → align face guide → tap sites

## Data model (inferred for clone)
Injection {id, at, productId, vialId, sites:[{siteId, units}], totalUnits, provider, notes, cost}
Vial {id, productId, unitsTotal, unitsUsed, dilutionMl, lot, expiresAt, openedAt}
Reaction {id, injectionId, at, kind, severity 1-5, siteId, resolvedAt, notes}
Photo {id, injectionId, kind before|after, at, src}
Mood {date, score 1-5}

## Cannot clone
PepPedia's research library content, AI insights backend, Apple Health sync (no HealthKit on web). Live camera inside a claude.ai artifact is not available; the clone uses the phone's camera through the photo picker instead.

Size: M as a real app; S as this artifact prototype.
