# Pummy Interactive Tutor, version 0.5.0

Implemented in the existing ChatGPT MCP App and standalone worker. The original adaptive engine, course identifiers, stored questions, progress, active sessions, preferences, custom tests, and source hierarchy remain in place. No production database was modified or deployment performed during implementation.

## Architecture audit

The app uses React 18, the official MCP Apps bridge, a Cloudflare Worker, and D1. `worker/tools.js` registers tools; `worker/mcp.js` registers the fullscreen widget. `PluginCourse` serializes courses into revision-checked JSON snapshots capped at 900 KB. It already supports source indexing, source/page citations, append receipts, and adaptive/explanation handoffs to the conversation model. Existing attached PDFs are limited to 350 KB and the reference viewer already uses `unpdf`.

There was no PPTX renderer, large-file storage, annotation model, tutor conversation persistence, or server voice API. These were added alongside the existing course tables. The question bank and active exam still use the original engine. The desktop Pummy application was not replaced or modified; exports and the existing bank interface remain compatible.

## Implemented interface

**Course & sources → Manual import** accepts `.ppt`, `.pptx`, `.pdf`, `.docx`, `.txt`, and `.md` references without requiring a ChatGPT connection. The review dialog saves the source into the selected subfolder, with its title, authority type and priority. New imports create independent reference IDs; retry receipts prevent duplicates. Existing source text, questions and active exam state are preserved. Each file is limited to 24 MB and 60,000 extracted characters, with oversized content rejected rather than truncated. This flow imports source text only; professor speaker notes and visuals are not mixed into the slide reference.

Legacy `.ppt` parsing reads only the required Compound File Binary streams and follows the latest saved persist directory and slide list. Bounds and cycle checks reject corrupt or encrypted files; macros and embedded objects are never executed. Its record traversal follows [Microsoft's MS-PPT live-record specification](https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-ppt/1fc22d56-28f9-4818-bd45-67c2bf721ccf). A real Apache POI legacy PowerPoint test file additionally produced both slides' expected text. Legacy `.ppt` visual editing now uses an automatically generated slide PDF while preserving the original `.ppt`. Legacy speaker notes are not extracted; PPTX notes remain available.

Open a course and choose **Interactive Tutor** in the sidebar or course menu. Open an attached source PDF, a new PDF, a PPT/PPTX that automatically generates its slide PDF, or an exported `.pummy` project.

The original slide is the canvas background. Student annotations are editable SVG objects with normalized coordinates. Tools include pressure-aware pen/pencil, transparent freehand or straight highlights, eraser, lasso, region selection, editable multiline text, rectangle/rounded rectangle, ellipse, line, arrow, connector, freeform, callout, image, sticky note and comment. Notes/comments are student annotation objects, not collaborative comment threads.

Selection supports shift-click, movement, resize and rotation handles, grouping/ungrouping, duplication, an internal copy/cut/paste clipboard, deletion, layer arrangement, alignment, distribution, font and border formatting, opacity, keyboard shortcuts, zoom, grid and snapping. Thumbnail, tutor and toolbar panels can collapse. Connectors are independent line annotations, not endpoints dynamically attached to shapes. The editor supports mouse, touch and browser pointer pressure; device-specific stylus behavior still needs hardware testing.

Undo/redo buttons remain in the editor header while drawing, with the ribbon collapsed, and in fullscreen; Ctrl/⌘ Z and Ctrl/⌘ Shift Z also work. Undo/redo uses bounded transactional snapshots per presentation editing session and stays independent of saving. Selecting/highlighting raster text uses visual regions; the app does not claim native text selection. Original professor objects are not editable in this app. Text boxes explicitly support multiline text; they do not provide a word processor or rich-text runs.

The app records course pages and presentations in browser history. Both the in-app Back button and browser Back/Forward restore the previous view, including the selected presentation and slide, without resetting an exam or replacing its answers. Selecting slides updates the current history entry, so Back returns to the previous page. Navigation waits for active annotation saves; a failed save keeps the editor and local work available. Browser history stores only view identifiers, not answer keys or file contents. Fullscreen uses a fixed editor layout as a fallback when the host does not allow browser fullscreen; Toolbar, undo/redo and Exit fullscreen remain reachable. Escape exits the expanded view.

## Import and rendering

Original PDFs, PPTs and PPTXs are immutable uploaded assets, split into 240,000-character base64 chunks to stay below the existing MCP request limit. Files are limited to 24 MB and presentations to 300 slides. The server checks file signatures, expanded archive size, XML entities, macros/ActiveX, slide relationships, slide count and dimensions, and independently extracts text/notes. Encrypted or corrupt PDFs fail without creating a presentation.

PDF.js through `unpdf` displays the original PDF page. The current PDF document, original bytes and a bounded set of slide images are cached; thumbnails render only when visible. PDF rendering disables eval support. PPTX XML supplies actual slide order and speaker notes, including nonsequential slide filenames. The matching PDF must use the same slide order and aspect ratio; the server can check count and aspect ratio, but cannot prove that the student exported the matching visual content.

**PPT and PPTX uploads automatically generate their slide PDF when selected.** The local preview uses LibreOffice's headless Impress PDF renderer through `scripts/presentation-converter.mjs`. It includes hidden slides and excludes notes pages, using the [official PDF export options](https://help.libreoffice.org/latest/en-US/text/shared/guide/pdf_params.html). Each conversion uses an isolated temporary profile with macro execution disabled, fixed filenames, bounded input/output and process time, and temporary-file cleanup. The server validates the input and resulting PDF before saving it. Original bytes remain separate and immutable. Completed conversions are cached by authenticated user, course and original asset ID, so retrying a lost response reuses the same PDF. The UI shows upload/conversion status and keeps an optional matching-PDF override for users who prefer PowerPoint's rendering. The sidebar and course menu use a PowerPoint icon.

LibreOffice rendering can differ from PowerPoint for unavailable fonts or unsupported features. Embedded PPTX audio is available under the slide as a separate player with playback, seeking, volume and download controls. Original PowerPoint sound/media parts remain untouched in original downloads, editable PPTX exports and `.pummy` projects. Animations, native PowerPoint playback timing, video and interactive PowerPoint behavior are not played. Legacy `.ppt` audio is preserved in the original file and can be played after downloading it into PowerPoint; it is not decoded in the browser. Production Cloudflare Workers cannot execute LibreOffice themselves; they need the configured authenticated converter described below. Missing configuration produces an actionable error without publishing a presentation.

Embedded PPTX audio is read lazily from the immutable original archive. Slide relationships determine which clips belong to each slide, in the presentation's actual slide order, following [Microsoft's Open XML audio structure](https://learn.microsoft.com/en-us/office/open-xml/presentation/how-to-add-an-audio-to-a-slide-in-a-presentation). Duplicate media references are deduplicated. Only bounded local media parts become blob URLs; linked external audio is not fetched. Playback stops and blob URLs are revoked when leaving the slide or editor. Browser codec support varies; unsupported formats offer a download and the original PowerPoint. The user's imported 16-slide lecture was inspected locally and contains audio references on six slides (`audio/mp4`); those source bytes were not changed or sent to any external service. No live lecture audio was played during verification; a generated PCM clip was used for browser decoding/playback checks.

## Persistence, security and versions

The additive migrations create seven user/course-scoped tables:

- `tutor_conversions`: durable original-to-PDF conversion receipts, committed atomically with generated PDF chunks.
- `tutor_assets` and `tutor_asset_chunks`: immutable original files and visual PDFs.
- `tutor_presentations`: presentation metadata, extracted slide text, notes and revision.
- `tutor_slide_annotations`: current editable annotation objects per slide.
- `tutor_revisions`: changed-object before/after deltas and ordering, with durable request receipts.
- `tutor_requests`: tutor requests, selected context, responses and practice drafts.

Annotation IDs, course/presentation/slide IDs, type, geometry, rotation, colors, opacity, stroke/pressure data, text/font, layer/group, timestamps and server-assigned author are retained. File upload retries reuse the same manifest, chunks and presentation ID within the import attempt. The client sends only upserts/deletions, debounced by 850 ms. D1 batches update the expected revision, changed slide and revision patch atomically. Different concurrent edits conflict; retries use the same request ID. Aggregate editable annotation data is capped at 1.4 MB, with up to 300 objects per slide. Revision history references the immutable originals and does not duplicate presentation files.

Presentation metadata and validated file availability are published atomically. Retries repair interrupted imports from the earlier implementation while preserving existing annotations. Concurrent imports cannot reuse a presentation ID for different files or course sources. The Drizzle migration journal and generated schema snapshot include the tutor tables and durable request uniqueness constraint.

The UI says Saved only after acknowledgment. Local drafts are namespaced by authenticated owner, course and presentation. Recovery is available when browser storage works. A newer server version does not silently accept a stale recovered draft: export local work, then reload the server version. Restoring a version creates another recoverable revision; original version 1 has no annotations. Undo history is session-local; durable version history survives reopening.

Every tutor/file operation authorizes the parent course using the authenticated hosting identity. No client-supplied user ID controls access. XML entities/macros are rejected; source text is treated as reference data; React text and escaped generated SVG do not execute source HTML. Source and question prompt injection is addressed through explicit boundaries and tool validation, not a claim of perfect semantic detection. Images must be embedded PNG/JPEG. Original files are never overwritten by annotation saves or exports.

## Exports

| Format | Implemented behavior |
| --- | --- |
| Original slide PDF | Byte-preserving generated or supplied visual PDF, available independently of annotations. |
| Annotated PDF | Original visual and SVG annotations composited at 2,000 pixels wide, preserving each page's aspect ratio/order. The exported PDF is a rendered visual copy; its annotations are not editable PDF fields. |
| Editable annotated PPTX | Copies the original PPTX archive, adding native vector/text annotation objects to its original slide XML. Original chart/image/table parts and speaker notes remain in place. Requires an original PPTX and conventional PowerPoint namespace prefixes. Image annotations currently require the flattened fallback. Variable pen pressure is approximated by a uniform PowerPoint stroke. Pummy grouping is retained in the project; native export emits individual editable objects. |
| Flattened PPTX | Composited slide images in a valid deck with a blank layout, master, theme and accessible professor notes. Clearly labeled flattened. Mixed PDF page aspect ratios require PDF export because PowerPoint uses a single slide size. |
| Pummy project | Original source bytes, visual PDF, metadata and complete editable annotation state in a versioned JSON `.pummy` file. Reimport creates a new presentation and new annotation IDs in the selected course, without replacing sources/exams. |
| Original source | Byte-preserving original PDF/PPT/PPTX download. |

Downloads depend on host support. When the host blocks file downloads, use the authenticated standalone interface or export through a supported host. Annotation exports are produced locally in the browser. Automatic PowerPoint rendering happens on the local converter in preview, or on the administrator-configured authenticated converter in production. No third-party conversion service is configured by default.

## Tutor and adaptive integration

The existing MCP Apps `updateModelContext`, `sendMessage` and `callServerTool` bridge is used. Current slide, selection and region identifiers update the model context. A request stores bounded current-slide text, speaker notes, relevant existing objectives and retrieved course excerpts. The original professor visual, or a cropped original region, is supplied as an actual MCP image content block. Student notes are supplied separately and marked untrusted/student-authored. Annotation overlays are not baked into the authoritative visual.

The conversation model calls `read_slide_tutor` and completes a request with `provide_slide_tutor`. Answers appear in the right panel with source/page citations. A short recent history supports follow-ups. Polling uses `summaryOnly` and does not repeatedly transmit image/context payloads. Unsupported details must be reported as “The provided materials do not explicitly state this.” General knowledge requires the explicit checkbox; bank questions still require professor provenance.

Practice questions require a supplied professor citation and slide text or original visual. Visual-only questions can carry the original figure. Server validation rejects invented source/page citations; semantic factual grounding remains the model's responsibility. Questions are reviewed in the widget, then **Save to Question Bank** uses the existing idempotent `add_questions` engine. Large lecture text is split into stable source parts under the existing 60,000-character source limit. Existing 30-source/500-question/900-KB course limits remain enforced. An explicitly linked existing source must contain the slide text before questions can be appended under that source ID.

Comprehension conversations live separately from formal exam mastery. Opening the tutor, asking questions and saving annotations never starts, resets or advances an exam. Saving practice questions appends rather than replaces the bank. Existing progress remains intact, though a new question can add source metadata to its existing concept.

The standalone editor can save pending requests; its AI responses require opening Pummy in ChatGPT. No new model API key is required. The deployed host handoff has not been exercised in a live ChatGPT conversation during this implementation; browser tests complete replies through the same server tools.

Integration references: [official MCP App UI documentation](https://developers.openai.com/plugins/build/chatgpt-ui). The Update Plugin workflow was used from the installed plugin-creator skill.

## Voice

Where available, browser SpeechRecognition provides user-triggered dictation with transcript and permission/error fallback. Browser speech synthesis provides read-aloud, pause, resume and stop. No credentials are shipped to the browser. The host/browser may deny microphone permission or lack recognition. Text always works. Native ChatGPT Voice and continuous realtime bidirectional audio are not claimed or implemented. Live microphone and speech playback were not tested on the user's account.

## New tools

The 30 existing tools remain, plus these 15. The new widget resource is `ui://pummy/adaptive-test-v12.html`; all older resource addresses, including v11, remain aliases. Tools other than the existing `open_interface` do not open new panels.

| Tool | Visibility/purpose |
| --- | --- |
| `list_presentations` | Model/app; bounded presentation summaries |
| `begin_presentation_upload` | App; immutable upload manifest |
| `upload_presentation_chunk` | App; retry-safe file chunk |
| `convert_presentation` | App; render uploaded PPT/PPTX and cache its generated PDF |
| `import_presentation` | App; validate and parse PDF or PowerPoint/PDF pair |
| `import_course_presentation` | App; reuse existing attached source PDF |
| `read_presentation` | App; metadata, editable layers and conversation |
| `read_presentation_chunk` | App; authorized original-file retrieval |
| `save_slide_annotations` | App; expected-revision upserts/deletions |
| `list_annotation_versions` | App; revision metadata |
| `restore_annotation_version` | App; recover a prior presentation version |
| `request_slide_tutor` | App; slide/region/note/practice request |
| `read_slide_tutor` | Model/app; bounded authoritative context, optional image/history or compact polling |
| `provide_slide_tutor` | Model/app; citation-checked response and practice drafts |
| `save_tutor_questions` | App; idempotent append using the existing engine |

## Files

Added: `app/interactive-tutor.jsx`, `app/interactive-tutor.css`, `app/tutor-session.js`, `app/tutor-files.js`, `lib/tutor/annotations.js`, `lib/tutor/presentations.js`, `worker/tutor-repository.js`, `worker/tutor-tools.js`, `drizzle/0001_interactive_tutor.sql`, `drizzle/meta/0001_snapshot.json`, `test/interactive-tutor.test.mjs`, `test/tutor-migrations.test.mjs`, `test/tutor-fixtures.mjs`, `test/tutor-browser.mjs`, `app/source-files.js`, `app/source-file-form.jsx`, `lib/tutor/legacy-ppt.js`, `test/source-fixtures.mjs`, `test/source-files.test.mjs`, `worker/presentation-converter.js`, `scripts/presentation-converter.mjs`, `scripts/converter-server.mjs`, `drizzle/0002_freezing_hemingway.sql`, `test/presentation-conversion.test.mjs`, `app/view-history.js`, `app/use-view-history.js`, `lib/tutor/audio.js`, `app/slide-audio.jsx`, `test/view-history.test.mjs`, `test/slide-audio.test.mjs`, `test/audio-fixture.mjs`, and this guide.

Updated: course navigation/main widget and bridge, `worker/tools.js`, MCP registration/resource aliases/version, worker health version, `worker/course.js` to retain imported question page provenance, `db/schema.ts`, the local database migration/batch adapter, MCP discovery tests, package/dependency files, README, and generated `app/view.html`/`dist` build outputs.

## Setup

Use Node 24+ for the local `node:sqlite` adapter. Install dependencies with `npm ci`, then run:

```sh
npm run build
npm test
npm run validate
npm run dev
```

The local adapter applies ordered additive migrations once; it recognizes an existing original courses table and preserves it. `npm run dev` uses the existing `work/local.sqlite`; the test suite uses disposable databases. Set `PUMMY_PREVIEW_PORT` to use another local port when 8777 is occupied. **Apply `drizzle/0001_interactive_tutor.sql` and `drizzle/0002_freezing_hemingway.sql` to the existing production D1 binding before releasing the worker**, using the project's established hosting migration process. Keep the existing project/app IDs and authenticated user-header trust boundary. The hosting manifest is unchanged. Production rollout and migration remain a release step, not something performed here.

Automatic conversion in the local preview requires `soffice` on PATH or `PUMMY_SOFFICE` pointing to its executable. The current desktop runtime supplies LibreOffice and both PPT/PPTX conversions have been exercised successfully. `npm run dev` connects the converter directly; no network conversion service or additional secret is required locally.

For production, run `npm run converter` on a LibreOffice-equipped Node 24+ host. Set `PRESENTATION_CONVERTER_TOKEN` to a strong secret of at least 32 characters, and optionally `PUMMY_SOFFICE`, `PUMMY_CONVERTER_PORT` (default 8879), and `PUMMY_CONVERTER_HOST` (default loopback). Place it behind your authenticated HTTPS hosting boundary. Configure the worker's `PRESENTATION_CONVERTER_URL` to the HTTPS `/convert` endpoint and `PRESENTATION_CONVERTER_TOKEN` through server-side secret configuration. The worker sends only the uploaded presentation bytes with the appropriate MIME type and bearer authentication; it never exposes the secret or endpoint to the widget and rejects redirects. The endpoint returns a raw PDF. A private `PRESENTATION_CONVERTER` fetch binding implementing the same contract is also supported. Run the renderer in an isolated host/container without access to other users' files or outbound document-resource fetching, install the required fonts, and size worker/service time limits for up to 120 seconds. These production settings were not deployed or changed here.

For browser verification:

```sh
npx playwright install chromium
PUMMY_TEST_CONVERSION=1 npm run test:browser
npm run test:explanations-browser
```

Set `PUMMY_TEST_CONVERSION=1` to also test real LibreOffice conversion of generated PPT and PPTX files, hidden slides, automatic upload status, and original-byte preservation. Omit it when the test host has no LibreOffice. Alternatively set `PUMMY_BROWSER_EXECUTABLE` to an already installed compatible Chromium executable. The browser test starts a temporary local server and an in-memory database, then closes them. Optional `PUMMY_TUTOR_QA_DIR` retains screenshots/downloads in a chosen writable directory. The repository has no separate typecheck script; esbuild compiles the production JavaScript/JSX modules.

After releasing, refresh plugin tool discovery/start a fresh ChatGPT conversation to expose the new tools. Existing banks, exams and source IDs persist. Open a course, choose Interactive Tutor, and upload a PDF or an original PPT/PPTX; its slide PDF generates automatically.

## Verification and release checklist

All **163 automated tests passed**, including the existing regression suite. `npm run build` and `npm run validate` passed; the full browser workflow also passed. Automated tests cover parsing/order/notes, corrupt files, user isolation, immutable originals, annotation ownership, transformation/history helpers, saves/retries/conflicts, multi-slide revision restoration, incremental patches, original source reuse, tutor source separation/citations/objectives/figures, question-bank appends and active-exam preservation. Additional checks cover atomic import rollback/recovery, conflicting concurrent imports, host/browser fullscreen routing, migration discovery, and preserving existing courses when upgrading/reopening a local database. Drizzle reports no outstanding schema changes. The existing adaptive/source/custom-test/MCP tests continue to run.

The real browser workflow additionally checks embedded audio playback, local media CSP, toolbar collapse/restore in fullscreen, undo/redo from the Draw tab in fullscreen, Back/Forward restoration, navigation joining an in-flight autosave, and retained audio bytes in editable PPTX exports. It checks original PDF rendering, pen/highlight/text/shape insertion, move/erase/delete/undo/redo, resize/rotation, normalized zoom, autosave/reopen, network-failure recovery after reload, PDF/native-object PPTX/flattened PPTX/project exports, project reimport, tutor response polling, navigation and original version restore. Exported PDFs are reopened by pdf-lib; PPTX archives are reopened by the parser and checked for editable annotation XML and retained notes.

The explanation browser workflow uses a disposable MCP host harness to verify actual bridge requests, scoped missing-explanation buttons, all three depths, progress polling and button disappearance after completion. It verifies generated explanations remain hidden until submission and that ordinary keys, Space and Enter advance feedback without intercepting focused controls. Saved content is supplied by the test harness; live model output quality and a live ChatGPT host were not tested. Bank tests verify bounded batches, revision conflicts, retry receipts, source validation, user isolation, unchanged keys, active exams and mastery progress.

Microsoft PowerPoint additionally opened the flattened test export with both slides, diagrams, annotations and speaker notes, without a repair prompt. Native object export is verified automatically; a second native Office opening could not be completed through the available UI automation and remains a manual check. Do not equate XML reopening with complete Office compatibility across all imported decks.

Before production release:

- Back up production D1 and apply both additive migrations through the established release workflow.
- Provision the authenticated HTTPS conversion service and worker secrets; check generated PDFs with the intended fonts.
- In ChatGPT, verify model handoff, image grounding and inline response refresh in the existing panel.
- Resume a real active exam, enter/leave the tutor and append reviewed questions; verify previous answers, flags and mastery are preserved.
- Check a representative professor deck with tables, equations, charts and speaker notes against its PowerPoint-exported companion PDF.
- Edit/group/rotate/undo, reopen, restore a revision and verify original download bytes.
- Open an editable annotated PPTX in PowerPoint and select/change its text/shape objects, especially for unusual namespaces/fonts.
- Verify downloads, mobile touch, stylus pressure, microphone denial, dictation and speech playback on intended hosts.

Dependency audit found five existing development-tool advisories (four moderate, one high), in Drizzle tooling and its nested esbuild. The new PDF/export/Playwright dependencies did not add reported production advisories. Address Drizzle tooling upgrades in a separate compatibility-reviewed change; this implementation does not force unrelated major upgrades.
