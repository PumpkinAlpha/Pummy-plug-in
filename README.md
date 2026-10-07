# Pummy Adaptive Test — ChatGPT plugin

Version 0.3 cleans up the panel layout and adds course/project setup and named custom tests. It recreates the adaptive exam and its warm HUD-style interface inside a fullscreen ChatGPT/Codex MCP App. It reuses the original Pummy engine and does not change the desktop app.

## Use

Open the installed **Pummy Adaptive Test** plugin. Import a Pummy backup or a question JSON, or ask ChatGPT to build a bank from your course materials. A five-question arithmetic demo is available when the library is empty.

Single-choice answers now require explicit submission by default. Instant answers remain available in Display settings. Select-all and interactive boards have a Submit button. Number keys select answers only; Enter submits or continues. Display settings can switch instant answers off, change reading size/theme, and enable automatic full-explanation requests.

After a miss, ChatGPT prepares a course-grounded foundation question. The engine can step down four levels, then climb back through fresh questions. The student, not the agent, presses Next. While a question or explanation is being prepared the view automatically refreshes. The standalone website can practice nonadaptive banks but needs the connected ChatGPT plugin for model-generated questions and explanations. No separate inference API key is required.

## Courses, custom tests, and speed

- Add an empty course directly. Rename it, append question banks, and add course excerpts without resetting progress.
- Associate each course with a ChatGPT Project name and URL. Open that Project, start/open a chat inside it, and open the plugin there to work with sources actually accessible to that chat. The URL is only a navigation reference: the plugin cannot enumerate or sync Project files from a link, and does not relocate the current conversation.
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

Imports support up to 200 questions, 30 source excerpts of at most 60,000 characters, and 200 objectives per bank; exams have up to 100 questions. Saved course state is bounded to 900 KB, including embedded images. Large courses should be split and images compressed. Original PDFs/PowerPoint/Word files are not uploaded, and missing image questions are explicitly counted as omitted. Backup source excerpts are capped at 60,000 characters per source. Desktop in-progress exam sessions are not migrated; question attempts and concept schedules can be restored. There is no automatic desktop/cloud sync.

Full explanations and targeted question chat run through the ChatGPT conversation. Voice output and download behavior depend on the host/browser; no automatic source-document page rendering, native local audio service, or background model generation is added. Matching imports require unique right-hand labels because the original board uses each bank label once. Adaptive variants of interactive boards are reused/reshuffled by the original engine rather than generated as new diagrams.

## Architecture

- `lib/pummy-core.mjs`: bundled original engine, model, source retrieval, prompts, grading, spaced repetition and objective/prerequisite tracking, with injected host generation and adapted storage.
- `worker/course.js`: persisted course snapshots, pending generation, redacted views, review/history and deterministic board shuffles.
- `worker/tools.js`: twenty validated MCP tools, strict response/filter validation, idempotent retries, version checks, source reads, imports/exports and explanation requests.
- `worker/repository.js`: per-user D1 keys and compare-and-swap revisions. Existing data is upgraded lazily without a schema change.
- `worker/mcp.js`: official MCP SDK, stateless Web Standards transport, registered fullscreen MCP App resource and global/thread entrypoints.
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

Automated tests cover adaptive chains/depth, returns, deferred retries, skip/end correctness, six question formats, hidden keys, duplicate-answer idempotency, source/user isolation, concurrent writes, exact filters, backup/export roundtrips, checkpoints/history, explanation lifecycle, mastery, and authenticated MCP discovery/resource metadata. Browser checks use an isolated mock-user bank, never submit answers to the real student's cloud exam.

## Publishing

Reuse `.openai/hosting.json` and the existing private Site/plugin identity. Build produces a self-contained HTML resource and a Cloudflare-compatible `dist/server/index.js` default.fetch. Keep the Site audience unchanged and do not create a replacement plugin.
