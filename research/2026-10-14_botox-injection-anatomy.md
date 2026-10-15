# Botulinum Toxin Injection Anatomy: Reference for the Botox Tracker App

Compiled 2026-10-14. Purpose: draw muscles on a front-view face and let a user tap freeform injection points, with caution zones. This is reference material for app design, not clinical advice. Every number below is a typical range; injectors individualize.

## How to read the evidence

- **FDA label (strongest):** glabellar, lateral canthal, forehead and platysma doses for Botox Cosmetic. Source: [Botox Cosmetic PI summary (PrescriberPoint)](https://prescriberpoint.com/therapies/botox-cosmetic-485d9b7), [AbbVie PI PDF](https://www.rxabbvie.com/pdf/botox-cosmetic_pi.pdf), [Drugs.com PI](https://drugs.com/pro/botox-cosmetic.html).
- **Consensus papers (good):** Carruthers et al., [Plast Reconstr Surg 2004;114(6):1S-22S](https://pubmed.ncbi.nlm.nih.gov/20337830/) and later Carruthers consensus updates; the [tailored frontalis consensus (Dove Press, CCID)](https://www.dovepress.com/tailored-botulinum-toxin-type-a-injections-in-aesthetic-medicine-conse-peer-reviewed-fulltext-article-CCID); a 2026 expert-panel consensus on mentalis, DAO and platysma ([Toxins 18(8):332](https://www.mdpi.com/2072-6651/18/8/332)).
- **Expert opinion and clinic material (weak):** nose, lip flip, brow lift, masseter, DAO. Flagged "expert opinion" below.
- Note: the PMC pages and some publisher pages blocked automated fetching, so a few anatomy and landmark details come from search summaries and standard anatomy rather than a full-text read. Those are marked "(verify)".

## Units and product conversion

Units are product-specific and not interchangeable. The FDA labels say so for every product.

- **Botox (onabotulinumtoxinA), Xeomin (incobotulinumtoxinA), Jeuveau (prabotulinumtoxinA), Letybo (letibotulinumtoxinA):** treated roughly 1:1 in practice. The frontalis consensus uses 1:1 for Botox and Xeomin ([Dove Press](https://www.dovepress.com/tailored-botulinum-toxin-type-a-injections-in-aesthetic-medicine-conse-peer-reviewed-fulltext-article-CCID)).
- **Dysport (abobotulinumtoxinA):** about 2.5 to 3 Dysport units per 1 Botox unit (same source). Glabellar label dose is 50 Dysport units (5 points x 10) versus 20 Botox units. A JAMA Dermatology head-to-head used 20 U Botox, 60 U Dysport, 20 U Jeuveau and 20 U Xeomin for glabellar lines.
- **Daxxify (daxibotulinumtoxinA):** its own scale. Glabellar label dose is 40 U (5 sites x 8 U). Do not convert from Botox. (From memory of the label; verify.)
- Letybo glabellar label dose is 20 U (5 x 4 U); Xeomin glabellar 20 U (5 sites); Jeuveau glabellar 20 U (5 x 4 U). (Memory of labels; verify.)
- **App implication:** store product plus raw units per point. Show a Botox-equivalent total only for 1:1 products and Dysport at roughly 1:2.5 to 1:3, labeled "approximate."

## Onset, peak, duration, retreatment

| Product | Onset | Peak | Typical duration |
|---|---|---|---|
| Botox | 3 to 5 days, can take up to 10 to 14 | about 2 weeks | 3 to 4 months |
| Dysport | about 2 to 3 days (faster in trial) | 1 to 2 weeks | 3 to 4 months |
| Xeomin | 3 to 7 days | 2 weeks | about 3 months |
| Jeuveau | about 3 days | up to day 30 in a sponsored study | 3 to 4 months, up to 5 |
| Letybo | 2 to 3 days (clinic source) | 7 to 14 days | 12 to 16 weeks |
| Daxxify | 1 to 2 days (clinic sources) | about 2 to 4 weeks (verify) | about 24 weeks, some report 6 to 9 months |

Sources: [JAMA Dermatology trial summary](https://s29.q4cdn.com/603291515/files/doc_news/Evolus-Announces-Publication-of-Independent-Study-in-JAMA-Dermatology-Demonstrating-Jeuveau-as-a-Top-Performer-Among-Leading-Neurotox-S0S7I.pdf) (manufacturer-sponsored), [ASPS on Daxxify](https://www.plasticsurgery.org/news/articles/how-does-daxxify-compare-to-botox), [Healio](https://www.healio.com/news/dermatology/20250610/botulinum-toxin-a-formulations-offer-varying-outcomes-for-frown-lines), [Letybo clinic summary](https://www.janeyoomd.com/?p=3701). Onset and duration figures vary by source; treat them as ranges.

**Retreatment:** the Botox label says no more often than every 3 months. Most people return at 3 to 4 months, when movement returns. Let the app default a reminder to about 12 weeks and let the user edit it.

## Aftercare and evidence quality

- Avoid rubbing or pressing the sites for the first hours: common advice, weak evidence of benefit.
- Stay upright 4 hours, no exercise 24 hours, no makeup for 12 hours: widely taught, but a literature review found several of these rules lack consistent scientific support ([RSD Journal](https://rsdjournal.org/rsd/article/view/50190)). A retrospective study of about 5,000 upper-face patients given only a 10-minute precaution protocol reported no upper eyelid ptosis and no loss of satisfaction ([PMC12390119](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12390119/)), with no control group.
- Practical framing for the app: "common clinic advice, low evidence." Complications track technique and dose more than aftercare.

**Common reactions and timelines:** small bumps at sites resolve in under an hour; redness and tenderness for hours; bruising for 3 to 10 days; headache in the first 1 to 3 days (the most frequent label-reported reaction in glabellar trials); brow heaviness or lid droop can show up around days 3 to 14 and lasts weeks (it fades as the toxin wears off). Seek urgent care for trouble swallowing, speaking or breathing (boxed warning for distant spread).

## Upper face

**Frontalis.** Thin, paired vertical sheet with no bony origin. Fibers run vertically from the galea at the hairline down to the brow skin, interdigitating with procerus, corrugator and orbicularis oculi. The two halves are often separated by a midline gap. It is the only brow elevator, so over-treating drops the brow. Treats horizontal forehead lines.
- Label: 20 U in 5 sites (4 U each), always with glabellar treatment (40 U total, 1 mL) to limit brow ptosis.
- Pattern: usually 4 to 8 points in one or two horizontal rows, 1.5 to 2 cm apart, at least 1.5 to 2 cm above the brow (frontalis consensus uses 1.5 to 2.0 cm; [Dove Press](https://www.dovepress.com/tailored-botulinum-toxin-type-a-injections-in-aesthetic-medicine-conse-peer-reviewed-fulltext-article-CCID)). Consensus per-point dose is 1 to 2 U for women, about 2 U for men. A second row suits a high forehead.
- Variation: V-shaped or central-only frontalis (inject centrally, spare laterals), lateral-only activity, full-width. Avoid the lateral frontalis edge to prevent a "Mephisto" (spocked) brow. Palpebral weakness or low brows get fewer, higher, more superficial points.
- Depth: superficial intramuscular, needle nearly perpendicular to skin, slightly raised bleb is fine. Dysport per point is about 5 to 10 U (Speywood consensus: 4 to 6 injections, 5 to 10 U each).

**Procerus.** Small pyramid-shaped midline muscle from the nasal bone and upper lateral cartilage up into the skin between the brows. Fibers vertical. Pulls the medial brow down and makes the horizontal "angry" line at the nasal root.
- One midline point, just above the nasal root, between the medial brows. 4 U (label glabellar site 1 of 5).
- Depth: deep intramuscular near periosteum is typical (verify per injector), needle aimed upward.

**Corrugator supercilii.** Origin on the medial supraorbital bone (frontal bone near the glabella); runs obliquely up and laterally, passing through the frontalis and orbicularis, inserting into skin of the mid-brow, roughly above the midpupillary line (verify landmark). Draws the brow medially and down: vertical "11" lines.
- 2 points per side: one at the medial belly just above the brow head, one 1 to 1.5 cm above the supraorbital rim, about at the mid brow. 4 U each (label), so 8 U per side. Lateral point must stay above the bony orbital rim and inside the midpupillary line to keep toxin away from the levator ([sources agree on the 1 cm above the superior orbital rim rule](https://pmc.ncbi.nlm.nih.gov/articles/PMC9032255), search summary).
- Depth: deep intramuscular, but keep a finger on the orbital rim and aim up and medially.

**Depressor supercilii.** Narrow slip from the medial orbital rim (frontal process of maxilla/nasal region) rising into the medial brow skin. Sometimes described as part of orbicularis oculi. Pulls the medial brow down. Usually covered by the medial corrugator point; some injectors add a small low-dose point 1 cm above the rim at the medial brow. Heavy risk zone: it sits close to the levator palpebrae.

**Glabellar total (label):** 20 U in 5 sites of 4 U (1 procerus, 2 per corrugator). Men often need up to 30 U or more; a 3-point version (procerus plus one per corrugator) is also used. Dysport 50 U (5 x 10).

**Orbicularis oculi, lateral (crow's feet).** Circular sphincter around the eye; the lateral part fans out from the lateral canthus over the lateral orbital rim and zygoma, with fibers radiating in a sunburst pattern. Creates radiating smile lines.
- Label: 24 U total, 12 U per side, in 3 points per side (4 U each). First point about 1.5 to 2.0 cm temporal to the lateral canthus, along the lateral orbital rim region; then 1 to 1.5 cm above and below it, in a vertical or slightly curved row.
- Variation: fan-shaped (inject the lateral fan), full (add a point), or "lower" pattern when lines concentrate low. Dysport 5 to 10 U per point, 3 per side.
- Depth: superficial intradermal/subcutaneous (the muscle is thin), bevel up, needle angle shallow (about 10 to 20 degrees), staying lateral to the bony rim.

**Orbicularis oculi, pretarsal (under-eye).** Thin strip of the lower lid just below the lash line over the tarsus. For a "jelly roll" or to open the eye slightly.
- Typically 1 to 2 U, one point per side, about 3 mm below the lash line at the midpupillary line, intradermal/very superficial. Expert opinion. Risks: lid laxity, ectropion, dry eye, under-eye bags or edema, a "snap test" check is standard before treating. Not for people with lax lower lids.

**Lateral brow tail (brow lift).** Treat the lateral orbicularis (the brow depressor part under the tail) so the frontalis can lift the tail. 1 to 3 U (some sources 2 to 4 U per side) at the tail, just under the brow, about 1 cm above and lateral to the lateral canthus, along the lateral brow margin. Expert opinion; sources conflict on dose. Depth: superficial.

**Nasalis (bunny lines).** Transverse part of nasalis over the side of the nose; fibers run obliquely and transversely across the nasal sidewall. Creates diagonal wrinkles on the nasal side wall when scrunching. A 2026 review says bunny lines sit over a nonmuscular interval and that nasalis thickens mainly in the alar-bridge region ([PMC12828243](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12828243/)).
- 1 to 2 points per side on the sidewall, about 2 U per point, 4 to 8 U total (clinic range 4 to 10). Superficial. Keep away from the medial canthus and the LLSAN edge to protect upper lip elevation.

**Depressor septi nasi.** Small muscle at the base of the nasal septum from the maxilla (above the central incisors) up into the columella and nasal tip. Pulls the tip down on smiling. 1 point at the columella base or in the upper lip philtrum base, 1 to 4 U (published range 2 to 6 U per side for alar nasalis plus DSN; [Hub Med Ed nose Botox review](https://www.hubmeded.com/blog/nose-botox-indications-limitations-and-effectiveness)). Risk: upper lip lengthening or smile change.

**Levator labii superioris alaeque nasi (gummy smile).** Origin on the frontal process of the maxilla; fibers run obliquely down beside the nose to the ala and upper lip. Lifts the lip and flares the nostril.
- Trial protocol: 2 U per side at the muscle bulge at the upper end of the nasolabial fold, 3 to 5 mm lateral to the ala (about 2 mm from the nasolabial fold); mild gummy smile (3 to 5 mm) 2 U per side, moderate (5 to 7 mm) 3 U, severe (7 mm or more) 5 U ([ClinicalTrials.gov NCT04820543](https://clinicaltrials.gov/study/NCT04820543), [NCT05127018](https://clinicaltrials.gov/study/NCT05127018)). The "Yonsei point" lies lateral to the ala where LLSAN, levator labii superioris and zygomaticus minor converge; [trial NCT04527744](https://clinicaltrials.gov/study/NCT04527744) splits dose between this and the LLSAN site.
- Depth: intramuscular, superficial-mid, shallow angle. Risk: smile flattening, upper lip heaviness, too much dose spreading to zygomaticus.

**Temporalis.** Fan-shaped muscle over the temple from the temporal fossa to the coronoid process. Used for temporal headache/bruxism and for a slightly different brow/temple contour. Not typically cosmetic. If included: 10 to 25 U per side across 3 to 5 points in a fan along the muscle belly, deep (into muscle, perpendicular), behind the lateral orbital rim and above the zygomatic arch. Risk: temple hollowing, chewing weakness, headache. Expert opinion; high variability.

## Lower face and neck

**Orbicularis oris (lip flip / lip lines).** Circular sphincter around the mouth; fibers run circumferentially in the lips. Perioral lines and a subtle lip eversion ("flip").
- Lip flip: 4 to 6 U total across 4 points (2 to 3 per upper lip, no more than 1 to 2 U per point), 1 to 3 mm above the vermilion border at the lip border, superficial. Lip lines: 1 to 2 U per point, 4 to 8 points. Clinic range 2 to 6 U ([clinic summary](https://www.dallascosmeticderm.com/blog/how-many-units-of-botox-for-a-lip-flip-why-the-right-dose-makes-all-the-difference/)). Keep the commissures free. Risk: trouble sipping, whistling, speech changes, lip incompetence. Strictly expert opinion/off-label.

**Depressor anguli oris (DAO).** Triangle from the mandible's oblique line (below and lateral to the commissure) up to the corner of the mouth, fibers vertical. Downturned corners ("marionette").
- 1 to 2 U (Botox) per side at the muscle belly, 7 mm lateral and 8 mm below the commissure (Levy), or superficial and at least 1.5 cm from the commissure (Hexsel, 0.5 to 1.0 U Botox per point, [Dermatology Times](https://www.dermatologytimes.com/view/treating-lower-face-botulinum-toxin)). Consensus points to superficial, low dose, above the mandible edge. Danger: drooping lower lip, asymmetric smile, drooling (spread to depressor labii inferioris, risorius, zygomaticus major).
- Consensus context: 14 experts on mentalis, DAO and platysma ([Toxins 2026](https://www.mdpi.com/2072-6651/18/8/332)).

**Mentalis.** Paired cone from the mandible above the chin tip (incisive fossa) inserting into chin skin; fibers vertical. Pebbled "peau d'orange" chin, dimpling, lip protrusion.
- Mean total about 6.5 U internationally, 8 U in the Italian panel; classic 2 points, 2 to 5 U each; Hexsel: 5 to 10 U Botox for a dimpled chin, 3 to 6 U for marionette support. Place low, near the chin tip, close to the midline, and deep (periosteal level or within the belly), staying below the mental crease and well away from the lower lip depressors. Danger: lip incompetence, drooling, smile asymmetry.

**Masseter.** Thick quadrilateral muscle from the zygomatic arch to the lateral mandibular ramus and angle; fibers run obliquely down and back. For jaw contouring (square jaw), bruxism, TMJ pain.
- Typical 20 to 50 U Botox total (10 to 25 U per side is the conservative end, 25 U per side is common in studies; reports of 40 U per site with Xeomin). Pattern: grid of 3 to 6 points in the lower two-thirds of the muscle belly, found by clenching, at least 1 cm above the mandibular border and clear of the anterior edge (risorius, zygomaticus). Dysport equivalent about 2.5x. Depth: deep intramuscular, needle perpendicular. Sources agree there is no standard protocol ([Dove Press](https://www.dovepress.com/article/download/82413) and search summary). Risks: smile change/cheek flattening, paradoxical bulge (3 in 324 patients at 25 U), chewing fatigue, dry mouth is rare.

**Platysma bands.** Thin sheet from the chest and shoulder fascia up over the clavicle and neck into the jawline and lower face; vertical bands show with neck tension. Treats vertical neck bands and a mild jawline pull.
- **Label (Oct 2024):** 2 U x 4 sites in the upper platysma below the jawline each side (8 U per side, 16 U), plus 1 U x 5 sites down each treated vertical band. One band per side = 26 U (18 sites), 31 U for 3 bands, 36 U for 2 bands per side. Repeat no more than every 3 months. ([AbbVie PI](https://www.rxabbvie.com/pdf/botox-cosmetic_pi.pdf), [PrescriberPoint](https://prescriberpoint.com/therapies/botox-cosmetic-485d9b7), [Healio on the approval](https://cm.healio.com/news/dermatology/20241021/fda-approves-botox-cosmetic-for-platysma-bands).)
- The Epocrates listing words the same schedule differently (8 U per jawline in 4 sites plus 5 U per band in 5 sites); the numbers agree once you add them up.
- Depth: very superficial (the muscle is thin and sits right under the skin), pinch the band and inject, needle at a shallow angle. Danger: neck weakness, dysphagia, dysphonia, aspiration; low dosing with abobotulinumtoxinA still caused dysphagia in a report ([JDD](https://jddonline.com/articles/dermatology/S1545961617P0929X)). Keep clear of the midline anterior neck and do not go deep.

## Muscles deliberately not injected (caution zones)

- **Levator palpebrae superioris:** lifts the upper lid; sits just under the orbital septum behind the brow. Misplaced or spread toxin causes eyelid ptosis. Rule: stay at least 1 cm above the superior orbital rim for glabellar and brow points, aim up and medially, finger on the rim.
- **Zygomaticus major and minor:** lift the corner of the mouth. Run from the zygomatic bone diagonally to the commissure. Toxin here flattens the smile. Keep masseter, DAO and LLSAN points away from this diagonal.
- **Risorius:** pulls the corner of the mouth laterally. Sits at the anterior masseter edge. Stay back from the anterior masseter border.
- **Depressor labii inferioris and orbicularis oris at the commissure:** lower lip control. Keep mentalis low and DAO lateral.
- **Levator labii superioris and zygomaticus minor** neighbors of the LLSAN site.
- **Procerus and frontalis boundaries:** treat the glabella with the forehead to avoid brow ptosis.
- **Orbicularis oculi lower edge:** avoid inferior to the inferior orbital rim region to prevent lid laxity and cheek heaviness (also zygomaticus involvement from lateral crow's feet points placed too low).
- **Neck midline:** swallowing and airway muscles lie deeper; keep platysma injections superficial.

## Safe-distance rules the app can show

1. 1 cm above the superior orbital rim for any brow, corrugator or procerus point.
2. 1.5 to 2 cm above the brow for frontalis (consensus), so the brow keeps its lift.
3. 1.5 to 2.0 cm lateral to the lateral canthus for the first crow's feet point; stay out of the zygomaticus below.
4. At least 1.5 cm from the oral commissure for DAO (Hexsel), 1 cm above the mandibular border for masseter.
5. Keep mentalis and DAO points below and lateral to the lower lip so the lip depressors keep working.

## Where sources disagree

- DAO: Levy (7 mm lateral, 8 mm below the commissure, 1 to 2 U) versus Hexsel (stay at least 1.5 cm away, 0.5 to 1 U Botox). Expert opinion either way.
- Mentalis totals: 5 to 10 U (Hexsel) versus 6.5 to 8 U (panel mean).
- Masseter: no standard; 10 to 25 U per side (low) to 40 U per site (high).
- Brow lift: 2 to 4 U per side vs 4 to 10 U total.
- Daxxify and Letybo onset: from clinic or manufacturer sources only.

## App table 1: muscle table

| id | label | side | group | typical points | typical units per side (Botox) | depth | caution note |
|---|---|---|---|---|---|---|---|
| frontalis | Frontalis | bilateral (shared midline) | upper face | 4 to 8, rows | 6 to 12 (label: 20 total, 5 pts x 4 U) | superficial IM | Stay 1.5 to 2 cm above brow; treat with glabella |
| procerus | Procerus | midline | upper face | 1 | 4 | IM, deeper | Keep above nasal root bony prominence |
| corrugator | Corrugator supercilii | bilateral | upper face | 2 | 8 (2 x 4) | deep IM | 1 cm above orbital rim; aim up and medially |
| dep_supercilii | Depressor supercilii | bilateral | upper face | 0 to 1 | 1 to 2 | IM | Close to levator palpebrae; usually covered by corrugator point |
| oo_lateral | Orbicularis oculi (crow's feet) | bilateral | upper face | 3 | 12 (3 x 4) | superficial | 1.5 to 2 cm lateral to canthus; avoid zygomaticus |
| oo_pretarsal | Orbicularis oculi (pretarsal) | bilateral | upper face | 1 | 1 to 2 | very superficial | Lid laxity, ectropion risk; skip if snap test is slow |
| brow_tail | Lateral brow tail | bilateral | upper face | 1 | 1 to 3 | superficial | Over-lift risk |
| nasalis | Nasalis (bunny lines) | bilateral | mid face | 1 to 2 | 2 to 4 | superficial | Keep off LLSAN and medial canthus |
| dsn | Depressor septi nasi | midline | mid face | 1 | 1 to 4 (total) | IM | Upper lip lengthening |
| llsan | LLSAN (gummy smile) | bilateral | mid face | 1 | 2 to 5 | IM, shallow | Smile flattening; avoid zygomaticus |
| oris | Orbicularis oris | midline | lower face | 4 to 8 | 1 to 3 | superficial | Lip incompetence; spare commissures |
| dao | Depressor anguli oris | bilateral | lower face | 1 to 2 | 1 to 2 | superficial IM | Stay 1.5 cm from commissure |
| mentalis | Mentalis | bilateral | lower face | 1 to 2 | 3 to 5 | deep IM | Keep low; away from lower lip depressors |
| masseter | Masseter | bilateral | lower face | 3 to 6 | 10 to 25 | deep IM | 1 cm above border; behind risorius |
| temporalis | Temporalis | bilateral | upper face | 3 to 5 | 10 to 25 | deep IM | Temple hollowing, chewing weakness |
| platysma | Platysma | bilateral | neck | 4 jawline + 5 per band | 13 per side with 1 band (8 jawline + 5 band) | very superficial | Dysphagia, neck weakness |

## App table 2: caution zones

| id | label | where (front view) | what to warn about | rule |
|---|---|---|---|---|
| levator | Levator palpebrae | just above upper lid, under brow | Eyelid ptosis | Stay at least 1 cm above superior orbital rim |
| zygomaticus | Zygomaticus major/minor | diagonal from cheekbone to mouth corner | Flattened or asymmetric smile | No points on this diagonal |
| risorius | Risorius | lateral to mouth corner, near anterior masseter | Asymmetric smile | Stay back from anterior masseter border |
| lower_lip | Lower lip depressors | below lower lip, lateral to chin | Lip incompetence, drooling | Keep mentalis and DAO points low and lateral |
| commissure | Oral commissure | mouth corners | Drooling, speech change | DAO at least 1.5 cm away |
| inferior_orbit | Lower eyelid and infraorbital | below lower lid | Ectropion, edema, cheek heaviness | Micro-dose only, superficial |
| brow_elevator | Lateral frontalis | upper lateral forehead | Mephisto brow | Spare lateral frontalis in most patients |
| neck_midline | Anterior neck | center of neck | Dysphagia, dysphonia | Superficial only, band-guided |
| angle_mandible | Mandibular angle and border | jaw line | Smile change, bruising | Stay 1 cm above the border |
