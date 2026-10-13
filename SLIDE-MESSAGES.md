# Slide explanations and ChatGPT message boundaries

Prepared for publication; native assistant message placement has not been verified in a live ChatGPT conversation.

## Inspected architecture

The initial local checkout only shared visible-slide context. Before publication, the update was reconciled onto hosted source d102bca, which already included a floating Explain button and lecture-aware tutor instructions. That button previously sent a generic "Explain the slide" message using mutable visible-slide context. Its docking, zoom and navigation controls are preserved; its action now queues a captured request. Older request/read/provide tutor tools stored request IDs, slide IDs, grounded context, answers and questions in `tutor_requests`; these records are reused without a database migration.

The supported boundaries are:

1. `updateModelContext` changes context for future interaction; it does not create an assistant turn.
2. MCP `tools/call` returns tool data. A completed `provide_slide_tutor` call does not mean the assistant has finished speaking.
3. `App.sendMessage({role:'user', ...})` sends a user follow-up through `ui/message` to the existing conversation. Its result acknowledges the request or reports an error; the installed bridge contract does not expose an assistant message ID, an idempotency key for host delivery, or an assistant-turn-completed event.
4. A tool with `_meta.ui.resourceUri` can return a focused inline UI. Its position and lifetime in the conversation are host-controlled.

Official references, inspected October 13, 2026: [MCP UI and message bridge](https://developers.openai.com/plugins/build/chatgpt-ui), [plugin UI reference](https://developers.openai.com/plugins/reference). The installed `@modelcontextprotocol/ext-apps` `App.sendMessage` declaration was also inspected. The app does not use separate API conversations to try to modify this ChatGPT conversation.

## Closest supported behavior

- Every Explain click allocates a fresh request ID and synchronously reserves a FIFO position before asynchronous image capture. Slide, presentation, course, region and annotation IDs are captured at the click. Original pixels are rendered for the captured slide if its current viewer image is not ready. No student overlay is promoted to a professor source.
- One initial request is dispatched. All later requests stay queued until the student confirms ChatGPT has finished. This includes later clicks after a successful send, even when no other slide was queued at the time.
- The queue is scoped to the signed-in user in this browser tab's session storage and survives viewer remounts/reloads. It spans courses/presentations within that viewer. The app never drains the queue merely because a message or tool call completed.
- Before sending, the server atomically claims the request's single delivery attempt. A lost acknowledgement or remount does not resend it. Ambiguous delivery is shown to the student. This trades automatic recovery for preventing duplicate sends: inspect the conversation before explicitly requesting the slide again. Closing the browser session clears the client queue; saved server requests, completed explanations and check results remain stored. Multiple independent host panels/tabs are not a global host-turn lock.
- Each prompt names exactly one saved request and requests one independent assistant response with A. Reading the Slide, B. Understanding the Material, C. What to Remember, D. Check Your Understanding. The server validates those headings and the question count/type before saving a new one-slide response. Ordinary typed questions and legacy practice requests keep their existing contracts.
- Bulk model reads exclude queued one-slide requests. Explicit reads include the selected request and bounded completed history with slide/request IDs. Prompts retain conversation continuity, discourage repetition and prohibit processing the next request in the same turn.
- Completed explanations are immutable. Retries return the original. For a testable slide, section D uses `render_slide_check` with that same request ID. The inline widget contains one selectable MCQ, not an artificial assistant bubble or an explanation transcript. Non-testable slides have no MCQ.
- Radio selection saves only the selection; **Check answer** grades only after that explicit click. Selections/results are server-persisted per request. Replayed old widget data refreshes from storage. A widget ignores another request's result, and checked answers are frozen. Formal adaptive exam answers, mastery, course data, sources and annotations are untouched.

## What cannot be guaranteed

The plugin cannot force ChatGPT to create a new independent assistant message or decide where the practice widget appears relative to the assistant's section D. It cannot verify that the student waited until the prior turn ended, detect an unrelated active ChatGPT turn, or prevent the host/model from merging, omitting, cancelling or formatting responses differently. It cannot enforce prose semantics such as whether a slide is testable or whether the model repeats earlier facts. The testable flag and textual content remain model judgments.

Thus acceptance criteria 1–3 (distinct retained native assistant messages), 4's placement inside each message, and 6's absolute host-level non-merging guarantee require live-host validation and cannot be promised by this integration. FIFO dispatch, exact request-to-slide association, one validated question per testable saved response, independent answer persistence, and preservation of existing data are enforced by the app. No HTML bubbles simulate unsupported ChatGPT message creation.

## Verification

Local results: The publication checkout passed **251/251 automated tests** and four browser suites (slide explanations, tutor, existing explanations, and docking/themes). Build, artifact validation, and `git diff --check` passed. Browser suites used the existing Chromium 1243 executable through `PUMMY_BROWSER_EXECUTABLE` and disposable local databases. Optional external PowerPoint conversion was not enabled. The two independent check widgets were also visually inspected.

- `npm test`: unit/integration coverage includes rapid captures completing out of order, explicit queue release, double confirmation, reloads, ambiguous delivery, concurrent delivery claims, section/question validation, foreign-slide rejection, immutable answers, user isolation, independent selections/results, and exact unchanged course/exam/presentation snapshots.
- `npm run build` and `npm run validate`: build both MCP UI resources and validate the worker artifact.
- `npm run test:slide-explanations-browser`: isolated MCP host with a disposable database, actual slide 4/5 clicks, two genuine iframe check widgets, reload/replay persistence, stale-result isolation, ambiguous delivery and unchanged exam/presentation. This harness does not reproduce ChatGPT's model or turn scheduler.
- Existing tutor and explanation browser suites check viewer, annotation, audio, export and background-conversation behavior.

For live acceptance, open the updated plugin in a single existing conversation, click Explain on slide 4 then immediately on slide 5, wait for the slide 4 assistant turn to finish, and press the queue's confirmation. Verify two native responses, source association, all four sections and separate selectable checks; answer each and revisit both. Also try host cancellation and iframe remount. Do not mark unconditional host-level guarantees as passed based on the mocked host.

## Files changed

- `app/slide-chat.jsx`, `app/slide-explanation-queue.js`, `app/interactive-tutor.jsx`, `app/interactive-tutor.css`: Explain action, captured context, FIFO and explicit release.
- `app/slide-check.jsx`: independent selectable practice UI.
- `worker/tutor-tools.js`, `worker/mcp.js`, `worker/slide-explainer-skill.js`: validation, single delivery claims, persistent checks, resource registration and model instructions.
- `scripts/build.mjs`, `package.json`: widget build and browser test command.
- `app/view.html`, `app/slide-check.html`: generated UI bundles.
- `test/slide-explanation-queue.test.mjs`, `test/interactive-tutor.test.mjs`, `test/mcp.test.mjs`, `test/slide-explanations-browser.mjs`: regression coverage. `test/tutor-browser.mjs` now waits for the sidebar after asynchronous course loading.
- `INTERACTIVE-TUTOR.md`, `SLIDE-MESSAGES.md`: behavior, boundaries and limitations.
