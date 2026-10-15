/* Reference injection patterns for the Live view (#65): one reviewed table, one entry per treatment area.

   STATUS: needs clinician review before release. Every pattern below is transcribed from the published source
   named in its `source` field (the FDA labels where one exists, otherwise consensus papers or expert opinion,
   as summarized in research/2026-10-14_botox-injection-anatomy.md and the Academy lessons in
   research/2026-10-15_botox-academy-content.json). It is a guide for understanding and logging what an injector
   did, never a plan to follow: no dose here is adjusted to the person, and nothing is framed as self-injection.

   BT.patterns.NOTE       the label every view that shows a pattern carries
   BT.patterns.REVIEW     'Needs clinician review'
   BT.patterns.areas      [{ id, label, evidence, source, total, notes, zones, points }]
     evidence             'FDA label' | 'Consensus' | 'Expert opinion'
     zones                safety zone ids drawn while the pattern is on (geometry in app/livecam.js ZONES)
     points               [{ siteId, at, side, units: [lo, hi], why }]
       siteId             muscle id from BT.muscles, written for the patient's left; side 'b' mirrors it to '-r'
       at                 where the point sits, in MediaPipe Face Landmarker landmark space:
                          [landmark, dx, dy] or [[landmarkA, landmarkB, t], dx, dy] (a point t of the way from A to B).
                          dx, dy are centimetres on the canonical face model (x toward the patient's left, y down), which
                          app/livecam.js fits to the person's own landmarks every frame, so offsets scale with their face.
                          Written for the patient's left; side 'b' mirrors the landmark and dx for the right.
       side               'b' both sides (two markers), 'c' a single midline marker
       units              reference range per point in Botox-type units (onabotulinumtoxinA; see the Units note in the
                          research doc for other products). lo === hi when the label gives one value.
   Areas without a published reference pattern are left out on purpose. Temporalis is medical-only and not here. */
(function () {
  const BT = window.BT;
  if (!BT) return;

  const NOTE = 'Reference pattern from published labeling. Your injector decides placement and dose.';
  const REVIEW = 'Needs clinician review';
  const LABEL_BOTOX = 'Botox Cosmetic prescribing information (AbbVie)';

  const areas = [
    {
      id: 'forehead', label: 'Forehead lines', evidence: 'FDA label',
      source: `${LABEL_BOTOX}: forehead lines 20U in 5 sites of 4U, always with glabellar treatment. Frontalis consensus (Dove Press, CCID): points at least 1.5 to 2 cm above the brow.`,
      total: '20U in 5 sites (label)',
      notes: 'The label pairs forehead treatment with the glabella to reduce brow drop. Injectors move rows for forehead height and muscle activity.',
      zones: ['levator-palpebrae', 'brow-lateral'],
      points: [
        { siteId: 'frontalis-l', side: 'c', at: [151, 0, -0.8], units: [4, 4], why: 'Midline, about 2 cm above the brow' },
        { siteId: 'frontalis-l', side: 'b', at: [[336, 296, 0.23], 0, -2.2], units: [4, 4], why: 'About 2 cm above the brow' },
        { siteId: 'frontalis-l', side: 'b', at: [[296, 334, 0.52], 0, -2.1], units: [4, 4], why: 'Midpupil line, about 2 cm above the brow' },
      ],
    },
    {
      id: 'glabella', label: '11 lines (glabella)', evidence: 'FDA label',
      source: `${LABEL_BOTOX}: glabellar lines 20U in 5 sites of 4U (1 procerus, 2 per corrugator); the same 5-site pattern in the Xeomin, Jeuveau and Letybo labels.`,
      total: '20U in 5 sites (label)',
      notes: 'Lateral corrugator points stay at least 1 cm above the bony orbital rim and inside the midpupil line.',
      zones: ['levator-palpebrae'],
      points: [
        { siteId: 'procerus', side: 'c', at: [8, 0, -0.2], units: [4, 4], why: 'Procerus, between the brow heads' },
        { siteId: 'corrugator-l', side: 'b', at: [[285, 336, 0.5], -0.1, 0], units: [4, 4], why: 'Corrugator, medial belly above the brow head' },
        { siteId: 'corrugator-l', side: 'b', at: [296, -0.15, -0.4], units: [4, 4], why: 'Corrugator, about 1 cm above the orbital rim, inside the midpupil line' },
      ],
    },
    {
      id: 'crows', label: "Crow's feet", evidence: 'FDA label',
      source: `${LABEL_BOTOX}: lateral canthal lines 24U, 12U per side in 3 sites of 4U, the first about 1.5 to 2 cm temporal to the lateral canthus.`,
      total: '24U, 12U per side in 3 sites (label)',
      notes: 'Points stay outside the bony orbital rim. Points placed too low can reach the zygomaticus and affect the smile.',
      zones: ['zygomaticus', 'lower-lid'],
      points: [
        { siteId: 'oculi-l', side: 'b', at: [263, 1.75, 0], units: [4, 4], why: 'About 1.5 to 2 cm outside the eye corner' },
        { siteId: 'oculi-l', side: 'b', at: [263, 1.55, -1.15], units: [4, 4], why: 'About 1 to 1.5 cm above the first point' },
        { siteId: 'oculi-l', side: 'b', at: [263, 1.55, 1.15], units: [4, 4], why: 'About 1 to 1.5 cm below the first point' },
      ],
    },
    {
      id: 'browlift', label: 'Brow lift', evidence: 'Expert opinion',
      source: 'Expert opinion, no label: 1 to 3U (some sources 2 to 4U) per side under the brow tail, about 1 cm above and lateral to the lateral canthus (research doc, Lateral brow tail). Sources disagree on dose.',
      total: 'A few units per side (no label)',
      notes: 'Relaxes the brow depressor part of the orbicularis under the tail so the frontalis lifts it. Results are modest.',
      zones: ['levator-palpebrae'],
      points: [
        { siteId: 'browtail-l', side: 'b', at: [276, 0, 0.05], units: [1, 3], why: 'Under the brow tail' },
      ],
    },
    {
      id: 'bunny', label: 'Bunny lines', evidence: 'Expert opinion',
      source: 'Expert opinion, no label: 1 to 2 points per side on the upper nasal sidewall, about 2U per point, 4 to 8U total (research doc, Nasalis).',
      total: '4 to 8U total (no label)',
      notes: 'Kept high on the sidewall, away from the inner eye corner and the lip-lifting LLSAN.',
      zones: ['lip-lifters'],
      points: [
        { siteId: 'nasalis', side: 'b', at: [6, 0.8, 0.8], units: [2, 2], why: 'Upper nasal sidewall' },
      ],
    },
    {
      id: 'lipflip', label: 'Lip flip', evidence: 'Expert opinion',
      source: 'Systematic review and clinic sources, no label: about 4 to 6U total across 4 points, 1 to 2U at most per point, 1 to 3 mm above the upper lip border (research doc, Orbicularis oris).',
      total: 'About 4 to 6U total (no label)',
      notes: 'The mouth corners are left free to protect lip function. Can make straws and whistling harder for a few weeks.',
      zones: ['commissure'],
      points: [
        { siteId: 'oris', side: 'b', at: [267, 0, -0.15], units: [1, 1.5], why: 'Just above the upper lip border' },
        { siteId: 'oris', side: 'b', at: [269, 0, -0.15], units: [1, 1.5], why: 'Just above the upper lip border' },
      ],
    },
    {
      id: 'gummy', label: 'Gummy smile', evidence: 'Expert opinion',
      source: 'Clinical trial protocols (ClinicalTrials.gov NCT04820543, NCT05127018), no label: one point per side at the LLSAN, 3 to 5 mm lateral to the nostril; 2 to 5U per side in those protocols.',
      total: 'About 2 to 5U per side in trials (no label)',
      notes: 'Too much flattens the smile; the zygomaticus sits just outside this point.',
      zones: ['zygomaticus', 'lip-lifters'],
      points: [
        { siteId: 'llsan-l', side: 'b', at: [358, 0.4, 0.05], units: [2, 5], why: 'Beside the nostril, top of the smile fold' },
      ],
    },
    {
      id: 'dao', label: 'Downturned mouth corners (DAO)', evidence: 'Consensus',
      source: 'Expert consensus on DAO, mentalis and platysma (Toxins 2026;18(8):332) and Hexsel (Dermatology Times), no label: 1 to 2U per side, superficial, at least 1.5 cm from the mouth corner, above the jawline.',
      total: 'About 2 to 4U total (no label)',
      notes: 'Placed lateral to the marionette line. Too medial reaches the lower lip depressor.',
      zones: ['commissure', 'lower-lip'],
      points: [
        { siteId: 'dao-l', side: 'b', at: [291, 0.7, 1.4], units: [1, 2], why: 'About 1.5 cm below and outside the mouth corner' },
      ],
    },
    {
      id: 'chin', label: 'Chin', evidence: 'Consensus',
      source: 'International and Italian expert consensus (Toxins 2026;18(8):332), no label: mean 6.5 to 8U total, classically 2 points of 2 to 5U, low on the chin near the midline.',
      total: 'Mean 6.5 to 8U total (no label)',
      notes: 'Kept low and away from the lower lip depressors.',
      zones: ['lower-lip'],
      points: [
        { siteId: 'mentalis', side: 'b', at: [152, 0.5, -0.9], units: [2, 5], why: 'Low on the chin, near the midline' },
      ],
    },
    {
      id: 'masseter', label: 'Masseter', evidence: 'Expert opinion',
      source: 'No standard protocol (meta-analysis; research doc, Masseter), no label: 10 to 25U per side spread over 3 to 6 points in the lower rear belly, at least 1 cm above the jaw border, clear of the front edge.',
      total: '10 to 25U per side (no label, no standard)',
      notes: 'Per-point range is the per-side range spread over the points shown. Found by clenching.',
      zones: ['risorius', 'mandible-border', 'zygomaticus'],
      points: [
        { siteId: 'masseter-l', side: 'b', at: [397, -0.2, -1.1], units: [3, 8], why: 'Lower belly, 1 cm or more above the jaw border' },
        { siteId: 'masseter-l', side: 'b', at: [288, -0.4, -0.2], units: [3, 8], why: 'Lower rear belly' },
        { siteId: 'masseter-l', side: 'b', at: [[397, 288, 0.5], -0.5, -1.9], units: [3, 8], why: 'Mid belly, behind the front edge' },
      ],
    },
    {
      id: 'neck', label: 'Neck bands', evidence: 'FDA label',
      source: `${LABEL_BOTOX} (platysma bands, Oct 2024): 2U at 4 sites per side in the upper platysma below the jawline, plus 1U at 5 sites down each treated band; 26U for one band per side.`,
      total: '26U for one band per side, 18 sites (label)',
      notes: 'Very superficial. One band per side shown; the label adds 5 sites for each extra band. The neck is extrapolated from the face, so check it against the real band.',
      zones: ['neck-midline', 'mandible-border'],
      points: [
        { siteId: 'platysma-l', side: 'b', at: [400, 0, 1.0], units: [2, 2], why: 'Upper platysma, below the jawline' },
        { siteId: 'platysma-l', side: 'b', at: [378, 0, 1.0], units: [2, 2], why: 'Upper platysma, below the jawline' },
        { siteId: 'platysma-l', side: 'b', at: [379, 0, 1.0], units: [2, 2], why: 'Upper platysma, below the jawline' },
        { siteId: 'platysma-l', side: 'b', at: [365, 0, 1.0], units: [2, 2], why: 'Upper platysma, below the jawline' },
        { siteId: 'platysma-l', side: 'b', at: [377, 0.6, 1.8], units: [1, 1], why: 'Down the band' },
        { siteId: 'platysma-l', side: 'b', at: [377, 0.7, 2.6], units: [1, 1], why: 'Down the band' },
        { siteId: 'platysma-l', side: 'b', at: [377, 0.8, 3.4], units: [1, 1], why: 'Down the band' },
        { siteId: 'platysma-l', side: 'b', at: [377, 0.9, 4.2], units: [1, 1], why: 'Down the band' },
        { siteId: 'platysma-l', side: 'b', at: [377, 1.0, 5.0], units: [1, 1], why: 'Down the band' },
      ],
    },
  ];

  const fmtUnits = (u) => (u[0] === u[1] ? `${u[0]}U` : `${u[0]} to ${u[1]}U`);
  BT.patterns = { NOTE, REVIEW, areas, fmtUnits, find: (id) => areas.find((a) => a.id === id) || null };
})();
