# Pummy Adaptive Test 1.0.9

Runtime 0.6.3 adapts the review transport to the actual cached connector question schema: a reserved marker packet uses existing question fields, is intercepted before import and calls the same native repair operations. No framing question is saved. 298 automated tests pass, including real MCP input-schema validation, plus browser checks for original-figure preparation and all question formats. This corrects the connector-side validation discovered during live verification of 1.0.8. Source review and separate independent approval remain mandatory.

Previous release (1.0.8):

# Pummy Adaptive Test 1.0.8

Runtime 0.6.2 fixes bank generation in chats that still expose older Pummy tool descriptors. Current repair operations can be described and executed through a strictly scoped add_questions envelope, using the same native source validation, calibrated difficulty, staging and separate independent review. Generated questions remain generated; unsupported and failed items cannot bypass review. Saved course reads supply the persistent fallback instructions.

Course & sources now offers Prepare original figures separately from bank generation. Exact-page read_source calls return prepared original images and provenance, including pages with no extracted text. This makes source diagrams and professor emphasis available through the existing chat tool list. Preparing originals preserves questions, exams and history. Supplemental sources require student authorization and remain below professor materials in priority.

297 automated tests pass. Browser verification exercises the actual preparation button, image-only page reads, all five question formats, desktop/mobile input, explanations and preserved state. The actual supplied lecture PDF was recovered and visually inspected for source gaps; source findings and student study files stay in private local work storage, outside GitHub. Earlier resource URLs remain supported. No new permissions or database migration.

Previous release (1.0.7):

# Pummy Adaptive Test 1.0.7

Runtime 0.6.1 makes selectable native chat checks the persistent default after typed and app-triggered slide explanations. Typed context now supplies fresh check IDs; the app captures the original slide and a saved informal request before sending its short message. Full professor-aligned explanations and source citations precede the native widget. Options start unselected, Check answer reveals correctness and rationale, and informal checks cannot leak into automatic bank recovery or change formal exams/progress/slide position.

295 automated tests pass. The MCP Apps browser bridge verifies both request paths, native controls, explanation/citation ordering, hidden keys, fresh checks, replay isolation, slide capture and unchanged exam/presentation snapshots. Existing explanation and tutor/audio-control browser checks pass. The harness supplies authored explanations; live ChatGPT model behavior and turn layout remain host-controlled. Earlier check and interface resource URLs remain supported. No database migration or new permission is required.

Previous release (1.0.6):

Updates the existing Pummy App with runtime 0.6.0:

- Durable source-grounded subtopic repair, independent question review, bounded retries and visible unsupported gaps.
- A documented cognitive rubric, representative baseline calibration and enforced advanced generation targets.
- Genuine multiple-select, original-diagram labeling, matching and ordering, with format-aware explanations and saved responses.
- Professor focus from original highlights, circles and non-black educational text; student annotations remain separate.
- Correct classification of new generated banks and intact professor questions, source files, progress, history and audio preferences.

291 automated tests, the five-format desktop/mobile browser suite, bank-history browser suite and explanation browser suite pass. The actual Session 21–22 extracted sources were audited. Precise anatomical gaps remain explicitly unverified until their original diagrams have been visually checked in the live host; the existing 96-question Anatomy bank was not regenerated during release QA. Uncalibrated legacy adaptive questions use a provisional cognitive minimum until a bank baseline is established.

Production: https://pummy-adaptive-test.daniel-dehkordi1.chatgpt.site
Source: https://github.com/PumpkinAlpha/Pummy-plug-in

The existing App binding, plugin identity, presentation, prompts, audience and logo assets are preserved. No additional account permissions are added.
