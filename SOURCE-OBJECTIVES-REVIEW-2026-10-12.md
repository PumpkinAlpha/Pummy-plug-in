# Objectives copied from supplied files

## Findings and changes

- The sync and question-import tools previously accepted objective text without checking the source. Objective writes now require an exact match to an objective paragraph in the supplied source, with its source ID and real slide/page where available. Paraphrases, shortened text, invented goals and wrong-page citations fail atomically.
- Source uploads and folder sync extract objective paragraphs directly without a model. PowerPoint objective sections and user-supplied objectives documents retain their wording and numbering; whitespace from wrapped lines is normalized. Editing a source type to Objectives also extracts its listed goals. Ordinary lecture topics do not become objectives.
- Course & sources includes a folder-scoped “Objectives from your files” list and “Pull objectives from files” action for previously saved material. Repeated pulls are no-ops. Source changes and deleted files exclude stale objectives until valid wording is supplied again.
- Explanations previously displayed a free-form model summary under “Learning objective” when no saved objective matched. That fallback is removed. Formal objective displays, progress coverage and grounding use only source-verified objectives. Long objectives remain complete within bounded grounding context.
- Standalone Interactive Tutor presentations supply objectives directly from their actual slide text, including source and slide references.
- Legacy objective records remain stored for recovery, but unverified records are excluded from official objective coverage. User-selected JSON backup restore preserves questions, attempts, concept schedules and legacy objective links through app-only restoration tools. Model-facing import and append tools retain strict objective validation.
- MCP instructions and all question/explanation prompt modes require verbatim supplied objectives and explicitly prohibit inferred goals. The current UI resource is v23; older resource aliases remain available.

## Verification

- `npm run build` and `npm run validate` passed for the final bundle.
- `npm test`: 247 passed, zero failures.
- All fourteen browser suites passed across the regression run and focused final reruns. The deletion fixture was updated to open a collapsed sidebar before navigation; source deletion, restoration and original bytes passed again against the final bundle. The objective suite verifies source wording, real slide references, no generated explanation banner, folder scope, repeated pulls, preserved exams, themes and phone layout.
- Unit coverage includes actual PPTX/DOCX extraction and uploads, standalone PowerPoint tutor context, rejected fabricated/paraphrased/shortened/uncited/wrong-page writes, legacy backup restoration and bounded complete objective context.
- Disposable databases/files were used for writes. No production student files, questions or results were deleted or rewritten during verification.

## Extraction limits

Only explicit objectives in searchable text are extracted. Image-only objective slides require searchable text or an OCR/text objectives document; Pummy reports no explicit objectives instead of inventing a replacement. A document with a generic filename can be marked with the Objectives source type. Originals remain unchanged.

The live respiratory source exposed Lecturio assignment lists immediately after objective sections. The extractor now stops at assignment headings and resumes at the next explicit objective heading. This is covered by a regression test; the live pull produced eleven source-backed objectives.
