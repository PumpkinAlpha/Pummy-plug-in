# Pummy Adaptive Test — ChatGPT plugin

Latest repair: local-folder sync replaces ChatGPT Project sync. Course & sources lets you choose a study folder, review changes and sync without duplicate references. Supported standalone browsers can remember read-only access and auto-sync every 30 seconds while the page is open; embedded hosts use folder re-selection. PowerPoint uploads now show progress, use bounded parallel retries and open through memory-efficient server chunk decoding. A real 15 MB, 16-slide lecture passed upload, native rendering and byte-equal export. See `FOLDER-SYNC-2026-10-12.md`.

October 12 deep review: PPT and PPTX now open directly in the browser without a converter or companion PDF. Exact uploaded originals remain downloadable, including PowerPoint notes and media. The UI has a stable header, explicit sidebar controls, visible editor actions and keyboard tabs. JSON recovery survives reloads for 24 hours using account-scoped receipt IDs; batches obey both count and UTF-8 byte limits. See `DEEP-REVIEW-2026-10-12.md` for current verification and remaining limits. The interface resource is v18 with all earlier aliases retained.

Course reference text and slide/page segments now live in separate database rows, so they no longer consume the 900 KB question/progress snapshot allowance. Existing courses migrate on their next successful save, preserving sources, originals, questions, and active exams. Failed batch imports can be edited, retried, or removed; editing retains the uploaded original and source ID while issuing a fresh receipt. Apply all ordered migrations through `drizzle/0005_course_source_content.sql` before release.

Course deletion now removes tutor records and uploaded originals, including abandoned R2 chunks. Interrupted object cleanup stays visible in the library for a Delete course retry and blocks reuse of that course ID until cleanup finishes. PDF download failures clear the document cache so slides can be retried without restarting the app. Apply the new additive `drizzle/0005_course_source_content.sql` migration before releasing this worker.

Course file imports accept multiple files in one selection, with individual text review and upload results. Temporary object-storage errors (including R2 10001) retry up to three times with backoff; persistent failures keep completed chunks for a manual retry. Failed uploads can be retried without duplicating successful imports. Upload storage uses BUCKET so it cannot collide with the hosted static-assets service. The interface resource is v16, retaining all earlier aliases.

Uploads have no fixed file-byte cap. Files transfer in 180 KB slices into the `BUCKET` R2 binding; D1 stores ownership and immutable chunk receipts, and legacy D1 files remain readable. Processing limits on extracted text, pages, annotations and course snapshots remain. Display settings show only the authenticated ChatGPT profile; other sign-ins are selected in ChatGPT’s account menu, then Pummy must be reopened. The sidebar toggle precedes Back.

Figma Make integration (`PumpkinAlpha/Figma-Plug-in`, commit `d7b0b29142c48baeef17bd786086bbffa8399ea3`) adds an expanded slide editor, collapsible presentation imports, a movable slide-control toolbar, an Explain the slide conversation handoff, and editable copies of original slide text. Attached PowerPoint sources open directly; an optional companion PDF can supply exact PowerPoint-exported visuals. Original files and exam progress stay intact. The plugin retains its production MCP bridge and current exam-selector fixes; Figma-only Vite scaffolding and portable Linux Office installation are excluded. The UI resource advances to v13 with existing resource aliases retained.

Version 0.5.0 adds the course-level **Interactive Tutor**: original PDF/PPT/PPTX presentation storage, an editable SVG annotation canvas, autosave and version history, PDF/PPTX/project exports, source-grounded tutoring in the conversation beside Pummy, embedded PPTX audio playback, browser Back/Forward navigation, and append-only practice questions. See [INTERACTIVE-TUTOR.md](./INTERACTIVE-TUTOR.md) for setup, supported tools, verification and limitations. PowerPoint uploads automatically generate a slide PDF using the local LibreOffice converter; production requires the authenticated conversion service described in the guide. Apply the additive migrations through `drizzle/0005_course_source_content.sql` before releasing the updated worker.

The workspace fills the available screen width and adjusts on phones. Sidebar buttons share a consistent style and hover animation (disabled for reduced motion). Global and folder search have been removed. The tutor defaults to fitting the entire slide within the available window, updates when resized, and provides Fit width and zoom controls. Arrow keys change slides when nothing is selected and move selected annotations instead; text, dropdowns and audio controls retain their normal keys. Slide context is shared with the conversation in the background without a visible context panel. Expanded fullscreen editors render at the document root so shell layers cannot intercept their controls. All sidebar icons now use currentColor. The tutor uses one styled picker for presentations and Pummy projects. Adaptive setup includes **End exam** beside **Resume exam**, using the existing confirmation and saved-results flow. **Delete source** moves a reference to **Recently deleted**; **Restore** brings it back. Deleted references are excluded from source lists and new retrieval, while their contents, question provenance and exam progress are retained. Recently deleted references still count toward the existing 30-source storage limit.

The sidebar now names the current subfolder in the course overview, source manager and linked tutor presentations. The tutor's app header collapses to a small navigation strip, revealing on hover or keyboard focus; tap Show navigation to keep it open. Exams expand within Pummy without automatically requesting browser or ChatGPT fullscreen. Embedded tutor fullscreen expands only the app's own viewport; standalone fullscreen remains an explicit button action. Choice rationales appear as brief text after submission. Full explanations link saved source citations beside paragraphs and show source figures or a visual answer map; new explanation requests ask for inline citations and grounded graphics. Navy, warm and light themes use shared colors throughout the shell, editor, feedback and dialogs. Display settings include device-local custom background, surface, text and accent colors with readability adjustment and reset.

Version 0.4.6 updates the official MCP and MCP Apps SDKs to support current publishing discovery and authenticated tool calls while retaining legacy clients. It also includes import key preservation, custom-test limits and retries, course switching, and background-refresh fixes. It recreates the adaptive exam and its warm HUD-style interface inside a fullscreen ChatGPT/Codex MCP App. It reuses the original Pummy engine and does not change the desktop app.

This maintenance release preserves explicit supplied answer keys and flags conflicting explanation labels for review. TXT imports tolerate blank lines within questions and preserve drafts after a parse error. References with more than 60,000 characters are rejected before import instead of silently shortened. Exam setup offers All questions, Struggling questions, Professor questions and Custom; exams and saved selections can use the full bank. Custom tests include bank search and reuse saved questions on a failed-save retry. Study actions clear unrelated saved filters; course and session changes reset local selections. Background tool errors are surfaced and incomplete Markdown tables cannot crash the view.

Missing full explanations can be generated from Adaptive exam or Course & sources. The buttons show the missing count for the current filters or subfolder and open a depth selector: Quick, Comprehensive, or MCAT / UWorld level. Generation runs through the ChatGPT conversation in bounded batches using `read_bank_explanations` and `provide_bank_explanations`; existing explanations, keys, questions, progress and active exams are preserved. New-question and adaptive explanation settings use the same depths. The local preview offers the settings, but generation requires opening Pummy in ChatGPT.

## Use

Only the app-only `open_interface` entrypoint launches a panel when the user chooses the app. The legacy `open_test` tool is now a data-only alias, so even older model workflows cannot request a panel through it under current descriptors. Background reads use `read_course_state`; sync, retrieval and other data actions do not carry a UI template or open another tab. Sync prompts omit unrelated contact information before sending source payloads.

Open the installed **Pummy Adaptive Test** plugin. Import a Pummy backup or a question JSON, or ask ChatGPT to build a bank from your course materials. A five-question arithmetic demo is available when the library is empty.

Single-choice answers now require explicit submission by default. Instant answers remain available in Display settings. Select-all and interactive boards have a Submit button. Number keys select answers before submission; Enter submits. After feedback, press any ordinary key or click Next to continue. Typing, focused controls, Tab, Escape and modifier shortcuts retain their normal behavior. Display settings can switch instant answers off, change reading size/theme, and enable automatic full-explanation requests.

After a miss, ChatGPT prepares a course-grounded foundation question. The engine can step down four levels, then climb back through fresh questions. The student, not the agent, presses Next. While a question or explanation is being prepared the view automatically refreshes. The standalone website can practice nonadaptive banks but needs the connected ChatGPT plugin for model-generated questions and explanations. No separate inference API key is required.

## Courses, custom tests, and speed

- Add an empty course directly. Rename it, append question banks, and add course excerpts without resetting progress.
- Associate each course with a ChatGPT Project name and URL. Open that Project, start/open a chat inside it, and open the plugin there to work with sources actually accessible to that chat. The URL is only a navigation reference: the plugin cannot enumerate or fetch Project files from a link, and does not relocate the current conversation. Use **Sync Project Sources** to ask ChatGPT to push the files actually accessible in that conversation into Pummy.
- Syncing sources does not generate questions. Stable source IDs prevent duplicates; unchanged resyncs do not bump the course revision. See `SOURCE_SYNC.md` for the MCP contract, limits and walkthrough.
- **Manual import** beside **Build questions from sources** imports PowerPoint (`.ppt`, `.pptx`), PDF, Word (`.docx`), TXT or Markdown references directly into the selected subfolder, including in the standalone preview. Review extracted text, title, source type and priority before saving. This adds a reference without generating questions or changing an active exam. It preserves the original file unchanged alongside a separate searchable text copy. Download original retrieves the exact upload; Add original file attaches bytes to older text-only references. Project text sync preserves existing originals but cannot recreate unavailable files. Use Interactive Tutor for original slide viewing.
- Build new questions from selected saved references or accessible Project sources through the conversation tutor. The request appends to the selected course, not a new unrelated bank.
- Save and edit named custom tests with individual question selections, size, source/objective/week/type/set filters, and adaptive mode. Active exams are never silently replaced.
- New course setups default to fast bank practice: no generation between answers. Existing active adaptive exams remain unchanged. Adaptive model latency still depends on the conversation model; there is no separate background inference service.
- Tutor handoffs omit long generation prompts in attached context, deduplicate requests for 90 seconds across views, re-check stale manual requests, display real sent/not-sent states, and refresh while pending. Unsupported foundations can include a replacement in one write. Duplicate model writes are idempotent; foundations cannot repeat a concept already in the chain.
- Versioned UI resource prevents the old layout from being reused by resource caches. A fresh ChatGPT conversation may still be needed for the host to authorize newly added tools.

## Restored exam features

- Single-choice, select-all, embedded-image identification, diagram labeling, ordering, and matching; drag/drop plus tap and arrow alternatives.
- Professor/flagged-first ordering, scheduled reviews, exam size, strict source/week/objective/type/set filters, persisted configuration, pause/resume, confirmed skip/end.
- Complete foundation ladder, gap diagnosis, out-of-scope handling, return versions, deferred nonadaptive retries, ten-question review checkpoints.
- Streaks, optional feedback animations and confetti, retained-objective celebrations.
- Answer and distractor feedback; deeper choice explanations; rich explanations with Markdown, tables, embedded figures, objectives, gaps, and clickable source references.
- Question-specific conversation handoff and optional browser speech synthesis.
- Flag notes, concept buckets, scheduled review intervals, prerequisite relationships, tracked-objective retention, completed-exam history, full review results.
- Pummy backup import including available raster images and spaced-review progress; JSON bank/progress download. Existing banks and cloud sessions are not overwritten by imports.
- Clean dark, question-first panel layout (original warm HUD is optional), responsive phone layout, light reading theme, adjustable type, keyboard controls, reduced-motion support.

See `PARITY.md` for scope and remaining host/desktop differences. This is an exam port, not the full Pummy course authoring/studio/document system.

## Limits and differences

Imports support up to 200 questions per write, 30 source excerpts of at most 60,000 characters, and 200 objectives per bank. Exams can include every matching saved question; Custom lets you choose a count up to the available bank size. Courses hold up to 500 stored questions. Saved questions and exam progress are bounded to 900 KB, including embedded question images; source text and slide/page segments are stored separately. Original uploads use object storage. Very large question banks should be split and embedded question images compressed. Missing question figures in backups are explicitly counted as omitted. Backup source excerpts are capped at 60,000 characters per source. Desktop in-progress exam sessions are not migrated; question attempts and concept schedules can be restored. There is no automatic desktop/cloud sync.

Full explanations and targeted question chat run through the ChatGPT conversation. Voice output and download behavior depend on the host/browser; no automatic source-document page rendering, native local audio service, or background model generation is added. Matching imports require unique right-hand labels because the original board uses each bank label once. Adaptive variants of interactive boards are reused/reshuffled by the original engine rather than generated as new diagrams.

## Architecture

- `lib/pummy-core.mjs`: bundled original engine, model, source retrieval, prompts, grading, spaced repetition and objective/prerequisite tracking, with injected host generation and adapted storage.
- `worker/course.js`: persisted course snapshots, pending generation, redacted views, review/history and deterministic board shuffles.
- `worker/tools.js`: thirty validated MCP tools, strict response/filter validation, idempotent retries, version checks, source reads, imports/exports and explanation requests.
- `worker/source-sync.js`: validated atomic source/objective upserts, canonical hashes, durable retry receipts and authority defaults.
- `worker/grounding.js`: extends the original retrieval index with supplied page boundaries, metadata matching, priority ordering, bounded prompts and citation provenance.
- `worker/repository.js`: per-user D1 keys and compare-and-swap revisions. Existing data is upgraded lazily without a schema change.
- `worker/mcp.js`: official MCP SDK, stateless Web Standards transport, registered inline/fullscreen MCP App resource and global/thread entrypoints.
- `app/`: React interface and official MCP Apps SDK bridge. No third-party fonts, remote images, scripts, or tracking.

Sites supplies trusted user identity. Private calls require it; public discovery contains no course data. Same-origin checks protect browser writes. Current and deferred-retry answer keys, board ordering and matching associations are withheld until submission, including related history entries. Export is an app-only explicit download and includes keys. Course text and model-generated strings render as escaped React content, never HTML instructions.

## Development and verification

Node 22.13+ is required for the local SQLite preview.

```sh
npm ci
npm run build
npm run validate
npm test
npm run dev
```

Local preview binds `127.0.0.1:8777`, supplies a mock user, and stores test data in ignored `work/local.sqlite`. Production does not include this mock identity server.

To refresh the original bundled code:

```sh
node scripts/vendor-core.mjs /absolute/path/to/Pummy/App
npm run build
npm test
```

Automated tests cover adaptive chains/depth, returns, deferred retries, skip/end correctness, six question formats, hidden keys, duplicate-answer idempotency, source/user isolation, concurrent writes, exact filters, backup/export roundtrips, checkpoints/history, explanation lifecycle, mastery, and authenticated MCP discovery/resource metadata. Source-sync tests additionally cover atomic batches, hash verification, legacy priorities, retained progress/sessions, exact retries, page reads, context budgets, citation validation, and authenticated MCP sync/retrieval. Browser checks use an isolated mock-user bank, never submit answers to the real student's cloud exam.

## Publishing

Reuse `.openai/hosting.json` and the existing Site/plugin identity. Build produces a self-contained HTML resource and a Cloudflare-compatible `dist/server/index.js` default.fetch. Keep the Site audience unchanged and do not create a replacement plugin.

The publishing scanner uses MCP `2026-07-28` and the `server/discover` request. The official MCP v2 handler serves current per-request metadata, discovery, tools and resources. Existing clients retain the legacy initialization handshake and JSON responses. Private tool calls still require Sites-authenticated identity. A domain verification success does not replace a successful connection and MCP scan.
