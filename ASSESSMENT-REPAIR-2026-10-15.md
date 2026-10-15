# Assessment repair, cognitive difficulty and professor focus

Pummy runtime 0.6.0 / plugin package 1.0.6.

## Findings and changes

The old bank display counted an objective as covered when any question linked to it. It had no subtopic evidence ledger, persisted repair task, generation-review boundary, calibrated difficulty gate or retry budget. Most generation prompts described only the text-choice schema. `add_questions` also inherited the import default of `practice`, so AI banks could be classified as professor questions. Existing misclassified records are preserved; new AI banks must use the repair workflow. Original diagrams existed in uploaded assets but the model's reference tools returned extracted text only.

`begin_bank_repair` stores the selected sources and independent subtopics without changing official objective definitions. `calibrate_bank_difficulty` rates a deterministic, representative sample. `map_bank_subtopic` validates exact source quotes/pages or original visual IDs and records inspected sources, unsupported details, reasons and corrective actions. `stage_bank_questions` rejects stale evidence, invalid mappings, duplicate stems, weak cognitive metadata, inappropriate formats and incomplete explanations. A separate `review_bank_question` call independently assesses accuracy, ambiguity, actual subtopic use, source support, difficulty and format suitability before appending the candidate. Coverage is recomputed from available, reviewed questions and current source hashes. Three consecutive validation/review failures produce a technical blocker. Batch receipts survive retries. Accepted questions retain source/objective/subtopic associations and form one archive bank per repair run.

Generation receives the next work item and deficit-based format recommendations. A sufficiently large bank cannot finish with a single format when alternatives were mapped as suitable. The initial format proportions guide selection; they are not rigid quotas. Coverage reports never count unsupported subtopics as assessed. Legacy objective percentages are labeled **Objective links**; Progress displays verified subtopic coverage and remaining limitations.

The app renders actual attached PDF/PPT/PPTX pages through the existing viewer before bank generation, stores source-page rasters separately from course snapshots, and exposes them through `read_source_visual`. Label questions must reference those exact visual bytes and normalized source-image coordinates. Original-file colored text, highlights and circles are captured separately from student annotations. Flattened marks can be recorded after visually inspecting the original. Linked professor focus cues prioritize repair work and are retained on generated questions. Decorative logos and contact/footer text are excluded from educational focus.

MCQ, multiple-select, labeling, matching and ordering retain their genuine controls and exact grading. Format-specific explanations are mandatory for newly generated banks. Diagnostic partial credit rewards correct slots and penalizes extra multiple-select choices; adaptive mastery still requires full accuracy. Student selections survive reloads. Existing professor questions, original assets, attempts, sessions, statistics, preferences and history are not rewritten by repair.

## Cognitive rubric

`cognitive-v1` adds reasoning (1–4 meaningful steps), integration (0–3 related concepts), application (0–3, from recall to analysis) and discrimination (0–2 plausible misconception distinctions), giving a 1–12 educational design score. New bank candidates and independent reviews must meet `max(4, ceil(2 × baseline))`, with at least two distinct reasoning steps, two related relationships, and application/analysis. A target above the rubric maximum is a visible limitation; the target is not quietly lowered. This is a relative educational-design target, not an empirical ratio of student difficulty.

Adaptive follow-ups and replacements also require cognitive metadata and a source-grounded critique. They inherit the most recent calibrated bank target. Legacy courses without a calibration use a provisional minimum score of 4; that fallback does not establish a measured twofold comparison. Their original questions remain unchanged. Baseline origin metadata in old banks can be ambiguous because of the previous `practice` default; the deterministic sample falls back to the existing bank when there are no explicitly generated records.

## Session 21–22 source regression

A read-only audit inspected all six stored Anatomy 1 references. The 82-page professor PDF contains 19 pages with no extracted text. The supplied objectives document yields eleven intact objectives; its Session 22 heading no longer contaminates the preceding objective.

The five reported gaps were re-evaluated. Searchable text does not independently establish every diagram label, precise appendix/liver projection, sided trunk action, gallbladder visceral/referred pathway or the internal-thoracic division level. A multiple-choice option without a supplied key is not evidence of the correct answer. Branch-origin evidence is kept separate from division-level knowledge. These details remain source-unverified or technically blocked until original visuals are inspected. No anatomical coordinates, missing keys or textbook facts were invented to fill them. The live 96-question bank and its progress were not regenerated during this audit.

The automated course regression reads a private ignored fixture through `PUMMY_ANATOMY_SOURCE_FIXTURE` (default `work/anatomy-source-audit.json`). It ran against the actual extracted references locally. CI without that private fixture explicitly skips that one test; student source files are not committed to GitHub.

## Verification

- 291 automated tests pass, including the actual-source extraction regression, evidence freshness, independent review gates, duplicate rejection, bounded failures, professor preservation, rubric scoring, emphasis prioritization, migration compatibility and import/export metadata.
- The new five-format Chrome suite passes desktop/mobile input, original PDF rendering, responsive label positions, answer grading, explanations, adaptive result persistence and label save/resume.
- Existing bank-history and explanation browser suites pass, covering archived edits, grouping, source links, source preservation, explanation depth, host handoffs and saved audio preferences.
- Production build and artifact validation pass. Migration 0007 adds only the source-visual table.

Remaining verification: real anatomical diagrams and flattened professor marks must be inspected in the live embedded host before claiming that the five precise knowledge gaps are resolved. Model-mediated semantic reviews are persisted and structurally enforced; automated checks do not independently establish medical correctness. No new model API key, audience change or data reset is required.
