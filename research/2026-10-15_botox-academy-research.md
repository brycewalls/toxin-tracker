# Botox Academy: Research and Curriculum Rationale

Compiled 2026-10-15 for GitHub issue #69 (brycewalls/toxin-tracker). Companion file: `2026-10-15_botox-academy-content.json`, which the app loads directly. Builds on `2026-10-14_botox-injection-anatomy.md` and the `BT.muscles` ids in `app/core.js`.

All links were opened and checked on 2026-10-15. See the verification log at the end.

## Framing

The Academy is patient education at injector depth. Lessons cover anatomy, the published label patterns and units, consensus doses for off-label areas, and what goes wrong. Every technique lesson explains how a qualified injector approaches the concern and what the labeling and consensus say. Nothing in it teaches self-injection, sourcing toxin, or reconstitution for personal use. Where hands-on technique is the next step, lessons point licensed clinicians to accredited training (AAFE, National Laser Institute, Empire Medical Training, manufacturer programs) and explain who can legally inject. The certificate says plainly that it is an educational certificate of completion, not a credential, license or authorization to inject.

## Curriculum rationale

Three groups, in the order a patient needs them.

1. **Foundations (6 courses, 12 lessons).** Mechanism, products and units, anatomy, legal scope and vetting, treatment day and aftercare, intervals. These come first because every treatment lesson leans on them: you cannot read a dose without knowing that units are product-specific, and you cannot understand a side effect without the elevator and depressor anatomy.
2. **Treatments (12 courses, 16 lessons).** One course per concern on the face map. Each lesson names the muscle (linked to `BT.muscles` ids so the app can highlight it), gives the label pattern where one exists or the consensus range where it does not, and lists the area's specific risks. Labeled areas (glabella, crow's feet, forehead, platysma) get the exact label numbers. Off-label areas carry an info callout saying so.
3. **Safety (4 courses, 7 lessons).** Side effects, emergencies, counterfeits, contraindications. Kept as its own group so it can be required or highlighted, and so the emergency guidance is easy to find from anywhere.

Counts: 22 courses, 35 lessons, 116 quiz questions, 15 achievements, 94 unique verified URLs used across 140 resource slots (34 unique videos).

## Key facts by topic

### How neurotoxins work
- Botulinum toxin type A enters motor nerve endings and cleaves SNAP-25, blocking acetylcholine release; the junction recovers by sprouting over months ([Pirazzini et al., Pharmacol Rev 2017](https://pubmed.ncbi.nlm.nih.gov/28356439/); [Nigam, Indian J Dermatol 2010](https://pubmed.ncbi.nlm.nih.gov/20418969/)).
- Labeled duration for glabellar lines is about 3 to 4 months; chemical denervation begins 1 to 2 days after injection and builds through the first week ([Botox Cosmetic label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=485d9b71-6881-42c5-a620-a4360c7192ab)).
- Dynamic lines respond best; full effect takes about 2 weeks and lasts about 3 to 4 months ([Small, Am Fam Physician 2026](https://pubmed.ncbi.nlm.nih.gov/42202343/)).
- First cosmetic approval (glabellar lines) was 2002 ([Nestor et al., J Cosmet Dermatol 2021](https://pubmed.ncbi.nlm.nih.gov/34378298/)).

### Products, units and conversions
From the current FDA labels on DailyMed:

| Product | Cosmetic indication(s) | Labeled glabellar dose | Notes |
|---|---|---|---|
| [Botox Cosmetic](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=485d9b71-6881-42c5-a620-a4360c7192ab) (rev. 10/2024) | Glabellar, lateral canthal, forehead, platysma | 20U in 5 sites | Crow's feet 24U; forehead 20U plus glabella 20U; all three 64U; platysma 26/31/36U |
| [Dysport](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=71313a04-1349-4c26-b840-a39e4a3ddaed) | Glabellar | 50U in 5 aliquots of 10U | Contraindicated with cow's milk protein allergy |
| [Xeomin](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=3f35d6e0-3450-4abc-a0da-cc7b277e7c6e) | Upper facial lines (glabellar, forehead, lateral canthal) | 20U in 5 sites | 64U maximum for all three; median onset 2 to 7 days, duration up to 12 to 16 weeks |
| [Jeuveau](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=17a914c1-e54b-4b50-965d-b0fd9111bba4) | Glabellar | 20U in 5 sites | Headache 12%, eyelid ptosis 2% |
| [Daxxify](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=3aaa6e14-a3f7-4fb2-b9f9-d3a9c3ae1f74) | Glabellar | 40U in 5 sites of 8U | RTP004 stabilizing peptide; headache 6%, eyelid ptosis 2% |
| [Letybo](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=910e5d0e-4d0b-4de8-8e2d-97879a044181) (rev. 11/2024) | Glabellar | 20U in 5 sites | Approved Feb 29, 2024 ([FDA snapshot](https://www.fda.gov/drugs/drug-trials-snapshots/drug-trials-snapshots-letybo)); headache 2% |

- Every label: retreatment no more often than every 3 months; units cannot be compared to or converted into another product's units.
- Working ratios: Xeomin about 1:1 with Botox; Dysport about 3:1 or lower for medical uses ([Scaglione, Toxins 2016](https://pubmed.ncbi.nlm.nih.gov/26959061/)), while aesthetic practice often uses about 2.5:1. These are rules of thumb, not label instructions.
- Daxxify averages about 24 weeks of effect and onset in 1 to 2 days per surgeons quoted by [ASPS](https://www.plasticsurgery.org/news/articles/how-does-daxxify-compare-to-botox). No neutralizing antibodies developed in pooled phase 3 trials ([Gallagher et al., Toxins 2023](https://pubmed.ncbi.nlm.nih.gov/36668880/)).
- Korean-market products in the app's product list (Nabota, Meditoxin, Innotox, Coretox, Liztox/Hutox, Botulax, Wondertox) are not FDA approved for U.S. use. The Academy treats logging them as record keeping, not endorsement.

### Facial anatomy
- Frontalis is the only brow elevator; corrugators, procerus and lateral orbicularis oculi depress the brow. The label pairs forehead with glabellar treatment to minimize brow ptosis ([Botox Cosmetic label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=485d9b71-6881-42c5-a620-a4360c7192ab); [Carruthers et al., PRS 2004](https://pubmed.ncbi.nlm.nih.gov/15507786/)).
- Label ptosis-reduction steps: avoid the levator palpebrae superioris, place lateral corrugator injections at least 1 cm above the bony supraorbital ridge, keep volume and dose accurate and minimal, and do not inject closer than 1 cm above the central eyebrow.
- A supraorbital foramen in some people can act as a path from the brow toward the levator ([Nestor et al., 2021](https://pubmed.ncbi.nlm.nih.gov/34378298/)).
- Videos: [AnatomyZone](https://www.youtube.com/watch?v=3Z0nbAm2HPw), [Dr Tim Pearce on facial muscles](https://www.youtube.com/watch?v=dPbQWrd6iZs).

### Choosing an injector and legal scope
- Injecting toxin is the practice of medicine in every state. Physicians inject independently; NPs, PAs and RNs inject within state scope and supervision rules; dentists in many states within their practice area; estheticians cannot inject ([AmSpa, 2021](https://www.americanmedspa.org/news/what-are-the-rules-for-who-can-inject-neurotoxins/); [AAFE](https://facialesthetics.org/patient-info/facial-esthetics/botox-training-dermal-filler-training/)).
- Certification is a training credential after licensure, never a substitute for it (AAFE).
- Injector skill is the biggest factor in outcome ([ABCS](https://www.americanboardcosmeticsurgery.org/cosmetic-procedures/non-surgical/botox-type-injectables/)); the AAD recommends a board-certified dermatologist or a member of that doctor's staff and warns against non-medical spas, parties, salons and homes ([AAD FAQ](https://www.aad.org/public/cosmetic/wrinkles/botulinum-toxin-faqs)).
- Board certification explained by [ABMS](https://abms.org/board-certification/).
- Training pathway for licensed clinicians: [AAFE](https://facialesthetics.org/), [National Laser Institute](https://nationallaserinstitute.com/), [Empire Medical Training](https://www.empiremedicaltraining.com/), and manufacturer programs such as the Allergan Medical Institute (named in text only; its site returned only a country selector, so no link).

### Treatment day, aftercare, results timeline
- AAD aftercare: avoid rubbing, wait 2 hours before strenuous activity; bruising lasts about a week ([AAD FAQ](https://www.aad.org/public/cosmetic/wrinkles/botulinum-toxin-faqs)).
- Evidence for extended aftercare is thin: about 5,000 upper-face patients with only a 10-minute protocol had no eyelid ptosis and 90% very satisfied, with no control group ([Santorelli et al., Toxins 2025](https://pubmed.ncbi.nlm.nih.gov/40864048/)).
- Onset around days 3 to 4, full results 10 to 14 days ([Cleveland Clinic](https://my.clevelandclinic.org/health/treatments/8312-botulinum-toxin-injections)).

### Treatments
- **Forehead:** 20U in 5 sites plus 20U glabella, 40U; headache 9%, brow ptosis 2% ([label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=485d9b71-6881-42c5-a620-a4360c7192ab); [PRS GO review 2020](https://pubmed.ncbi.nlm.nih.gov/32537333/)). Consensus keeps points about 1.5 to 2 cm above the brow ([Sundaram et al., PRS 2016](https://pubmed.ncbi.nlm.nih.gov/26910696/)).
- **Glabella:** 5 sites on every label; eyelid ptosis 3% (Botox Cosmetic), 2% (Daxxify, Jeuveau). Ptosis onset 3 to 14 days, self-resolving; apraclonidine or oxymetazoline drops can partly reverse it ([Nestor et al., 2021](https://pubmed.ncbi.nlm.nih.gov/34378298/)).
- **Crow's feet:** 4U in 3 sites per side, 24U; first point about 1.5 to 2.0 cm temporal to the lateral canthus, just outside the orbital rim, bevel up and away from the eye; eyelid edema 1% (label).
- **Brow lift:** off-label; relaxing the superolateral orbicularis oculi raised the lateral brow in [Ahn et al., PRS 2000](https://pubmed.ncbi.nlm.nih.gov/10724275/).
- **Bunny lines:** a 2025 cadaver and ultrasound study found a non-muscular "bunny triangle" beneath the lines and suggests targeting the borders of procerus, nasalis, orbicularis oculi and LLSAN ([Ahn et al., Clin Anat 2025](https://pubmed.ncbi.nlm.nih.gov/39711041/)).
- **Lip flip:** systematic review of 7 studies, typically 4 to 6U in the orbicularis oris; mild transient whistling and straw difficulty ([Pitchford et al., Arch Dermatol Res 2025](https://pubmed.ncbi.nlm.nih.gov/40377719/)). Cleveland Clinic: about 2 to 4U upper and 2U lower lip, lasting 2 to 5 months ([Cleveland Clinic](https://my.clevelandclinic.org/health/treatments/22362-lip-flip)).
- **Gummy smile:** 1.25 to 7.5U per side in LLS, LLSAN and zygomaticus minor; about 2.5 mm reduction at 2 weeks and 2.2 mm at 3 months versus controls; skeletal and dental causes excluded ([Rojo-Sanchis et al., J Clin Med 2023](https://pubmed.ncbi.nlm.nih.gov/36835971/)).
- **DAO and mentalis:** 14-expert Italian consensus plus review of 16 international consensus papers: DAO mean 5.6U, single intramuscular point lateral to the marionette line; mentalis 8U (Italian) vs 6.5U (international); platysma 48.4U vs 38.2U ([Fundaro et al., Toxins 2026](https://pubmed.ncbi.nlm.nih.gov/42646760/)).
- **Masseter:** 5 RCTs, 536 participants; 48U and 72U regimens beat placebo; no optimal protocol definable ([Machado et al., JPRAS 2026](https://pubmed.ncbi.nlm.nih.gov/42379083/)). Good evidence for hypertrophy, equivocal for myogenous TMD, little for joint TMD ([Delcanho et al., 2022](https://pubmed.ncbi.nlm.nih.gov/35298571/)).
- **Temples:** the therapeutic Botox chronic migraine protocol is 155U every 12 weeks, including 40U in 8 temporalis sites ([Botox label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=33d066a9-34ff-4a1a-b38b-d10983df3300)). Cosmetic and tension use is off-label.
- **Platysma:** label (Oct 2024) 2U at 4 jawline sites per side plus 1U at 5 sites per band, 1 to 2 bands per side: 26, 31 or 36U in 18, 23 or 28 sites. Sponsor-funded phase 3 extension: one-grade improvement in 83.6% to 98% across four cycles; a few dysphagia events of special interest ([Mraz et al., PRS 2026](https://pubmed.ncbi.nlm.nih.gov/41329600/)). Jawline concept from the Nefertiti lift ([Levy, 2007](https://pubmed.ncbi.nlm.nih.gov/18236245/)).

## Where sources disagree

- **Dysport ratio.** Labels forbid conversion; Scaglione supports 3:1 or lower for medical indications; aesthetic practice commonly cites 2.5:1. The app should keep its Botox-equivalent figure labeled "approximate."
- **Duration.** Cleveland Clinic gives both 3 to 4 months and 3 to 6 months on the same page; the Xeomin label says up to 12 to 16 weeks; ASPS sources put Daxxify around 24 weeks. Lip flips are shorter (2 to 5 months).
- **Aftercare.** AAD says wait 2 hours before strenuous activity; many clinics add 4 hours upright and 24 hours without exercise; the 2025 retrospective study found a 10-minute protocol performed well but lacks a control group.
- **DAO placement.** The 2026 consensus favors a single point lateral to the marionette line; older expert sources (Levy vs Hexsel, see the 2026-10-14 anatomy note) differ on distance from the commissure.
- **Lower-face doses.** The Italian panel used higher mentalis (8 vs 6.5U) and platysma (48.4 vs 38.2U) totals than the international average.
- **Bunny lines.** Traditional teaching injects into the wrinkles over the nasalis; the 2025 anatomy study argues the muscle borders are the better target.
- **TMJ and bruxism.** Clinic marketing presents masseter toxin as a TMJ fix; systematic reviews call the evidence equivocal for pain and weak for joint disorders.
- **Credentials.** ABCS favors board-certified cosmetic surgeons; AAD favors board-certified dermatologists. Each board promotes its own members. The Academy presents both and teaches the shared criteria (license, specialty training, volume, authentic product, follow-up).

## Safety

### Common side effects
Injection-site redness, swelling, tenderness and bruising (about a week); headache (Botox Cosmetic forehead 9%, Jeuveau 12%, Daxxify 6%, Letybo 2%); eyelid edema after crow's feet (1%); dry eye. A meta-analysis of 16 placebo-controlled trials found more headache and eyelid ptosis than placebo for frown lines, and no significant increase except hematoma for crow's feet ([Jia et al., Aesthetic Plast Surg 2016](https://pubmed.ncbi.nlm.nih.gov/27495260/)).

### Complications
- **Eyelid ptosis:** levator weakness, 3 to 14 days after treatment, self-resolving; prescription apraclonidine or oxymetazoline drops can partly reverse it ([Nestor et al., 2021](https://pubmed.ncbi.nlm.nih.gov/34378298/)).
- **Brow ptosis and asymmetry:** the most common complications in [Kassir et al., 2020](https://pubmed.ncbi.nlm.nih.gov/31889407/). Spock brow from an active lateral frontalis.
- **Smile and lip changes:** DAO, mentalis, lip flip, gummy smile and masseter treatment can affect the depressor labii inferioris, risorius or zygomaticus.
- **Dysphagia and voice change:** mainly after neck treatment; the label warns deaths from severe dysphagia have been reported after botulinum toxin treatment (section 5.7).
- **Distant spread and the boxed warning:** every product carries "Distant Spread of Toxin Effect": asthenia, generalized weakness, diplopia, ptosis, dysphagia, dysphonia, dysarthria, urinary incontinence and breathing difficulty, hours to weeks after injection. The Botox Cosmetic label also notes no definitive serious reports of distant spread at labeled dermatologic doses.
- Neuromuscular disorders (myasthenia gravis, Lambert-Eaton, ALS, motor neuropathies) raise the risk of serious effects (label 5.6). Cardiovascular events have been reported, and hypersensitivity including anaphylaxis is rare (5.4, 5.5).

### Counterfeit and unapproved product
- [FDA, April 2024](https://www.fda.gov/drugs/drug-alerts-and-statements/counterfeit-version-botox-found-multiple-states): counterfeit Botox in multiple states; signs were lot C3709C3, "Botulinum Toxin Type A" instead of onabotulinumtoxinA, a 150-unit size, and non-English text. Report to FDA at 800-551-3989.
- [CDC HAN 00507](https://www.cdc.gov/han/2024/han00507.html): 22 people in 11 jurisdictions, 11 of 20 hospitalized, 6 given antitoxin, all treated by unlicensed or untrained people or in nonmedical settings.
- [MMWR July 2024](https://www.cdc.gov/mmwr/volumes/73/wr/mm7327a3.htm): 7 women, 4 hospitalized (2 ICU), a 150-unit carton carrying a batch number from a legitimate vial that expired in 2017.
- [MMWR 2025](https://www.cdc.gov/mmwr/volumes/74/wr/mm7438a1.htm): 3 women self-injected toxin bought online from overseas vendors; all hospitalized, one ventilated, all given antitoxin.
- [CDC DIY guidance, April 2026](https://www.cdc.gov/botulism/hcp/diy-botox/index.html): 13 severely ill patients in 10 months, many from unlabeled vials of white powder; "Do not self-inject botulinum toxin products"; watch the dose drawn from a labeled vial.
- [AAD statement](https://www.aad.org/news/aada-statement-counterfeit-injectables) and an [FDA OCI press release](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/doj-press-releases-involving-fda-oci/hells-kitchen-aesthetician-arrested-unlawfully-injecting-counterfeit-botox) on an aesthetician arrested for injecting counterfeit Botox.

### When to seek urgent care
- **Call 911 or go to the ER:** trouble breathing, trouble swallowing or choking on liquids, inability to hold up the head, weakness spreading to the arms or body.
- **Same-day urgent care:** double or blurred vision, both eyelids drooping, slurred speech, new hoarse voice, dry mouth with weakness.
- **Call the injector within a day or two:** a one-sided droop or asymmetry near the treated area, heavy brow, smile change.
- Bring product, date, areas, units and source. Suspected botulism goes to the health department and CDC's botulism service, which supplies antitoxin. Report reactions to [MedWatch](https://www.fda.gov/safety/medwatch-fda-safety-information-and-adverse-event-reporting-program).
- The CDC notes that asymmetric weakness near the injection site is less concerning than symmetric or descending weakness ([CDC DIY guidance](https://www.cdc.gov/botulism/hcp/diy-botox/index.html)).

### Pregnancy and interactions
- Label: no adequate human pregnancy data; animal studies showed reduced fetal weight and ossification at doses with maternal toxicity; no lactation data (8.1, 8.2).
- 29-year safety database: major fetal defects 0.7% among 152 live births, comparable to background 3 to 6%; sponsor-run, reporting bias, limited later-trimester data ([Brin et al., Neurology 2023](https://pubmed.ncbi.nlm.nih.gov/37137724/)). Cleveland Clinic lists pregnancy and breastfeeding as reasons to avoid treatment.
- Interactions (label section 7): aminoglycosides and other agents interfering with neuromuscular transmission, muscle relaxants, anticholinergics after treatment, and other botulinum toxin products.

## Deliberately left out for safety

- Reconstitution volumes, diluents, dilution math, and storage after mixing. The labels contain these; the Academy does not repeat them.
- Needle gauge, injection depth by muscle, needle angles beyond the label's patient-relevant "bevel up and away from the eye," and step-by-step marking. Two clinician technique videos (an injection depth guide and a brow-lift "how to" walkthrough) were left out for this reason.
- Any guidance on buying toxin, comparing online sellers, or using non-U.S. products at home.
- Doses tied to a specific individual or a calculator that turns a concern into units. The app's Botox-equivalent figure stays labeled as an approximation for the user's own history.
- Prescription drug names for ptosis are mentioned only as something a physician may prescribe, with no dosing.

## Verification log (checked 2026-10-15)

Method: `curl` with status and page title; WebFetch content reads; YouTube oEmbed (title and channel) for every video; NCBI E-utilities records plus a browser-pane title check for every PubMed link; DailyMed SPL downloads for every label fact quoted. For YouTube, presenter credentials were checked with practice pages, hospital or university profiles, and directories; channels whose presenter could not be confirmed were dropped.

**Verified and used:** 94 unique URLs (34 videos, 60 labels, articles, papers and training pages). Ten more verified registry entries are kept in the build script but not attached to a lesson.

**Dropped (42):**
- Blocked to automated checks, replaced with a stronger source: Drugs.com label pages for Botox Cosmetic, Dysport, Xeomin, Jeuveau, Daxxify, Letybo (replaced by DailyMed); MDPI Toxins 18/8/332 and two PMC pages (replaced by their PubMed records); hcp.daxxify.com; certificationmatters.org; fsmb.org.
- Broken or wrong: Cleveland Clinic `8952-botox-injections` (404), AAD `younger-looking/botox` (404), old ABCS `botox-guide` URL (404), Empire Medical Training `botox-training-courses` (404), NCSBN scope page (404), CDC HAN 00510 (wrong number; correct advisory is 00507).
- Did not contain what it claimed: ASDS neuromodulators URL (served general injectables content), docinfo.org (no content returned), Allergan Medical Institute (country selector only), MedlinePlus a619021 (prabotulinumtoxinA page, not needed).
- Videos dropped because the presenter's credentials could not be confirmed or the content was technique instruction: three Dr. Anil Rajani videos (no board listing found), Dr. Jason Emer (a directory flagged his license as on probation), Dermapedia, Jillian Gottlieb, Pacific Heights Plastic Surgery, Skin Care Fort Worth, two Danesthetics Medical videos, Dr. Jason Hall, Joseph B. O'Connell, Priya Kalyam, The Budget Dermatologist, West End Plastic Surgery, The Naderi Center, a Cosmetic Laser Dermatology frown-line video with no named presenter, a Dr Dray hooded-lid video (off topic), Dr Tim Pearce's injection depth guide, and Tansavatdi's procedure demonstration (part 2).

**Credential notes for kept videos:** several board certifications come from the physician's own practice materials (Vila, Vasyukevich, Tansavatdi) and are labeled that way in the JSON `source` field. Dr Tim Pearce is a U.K. GP (MBChB, MRCGP) whose channel is aimed at clinicians; U.K. practice norms differ from U.S. scope rules. AAFE and Empire Medical Training videos are clinician-training material and are labeled as such.
