# Pummy Adaptive Test — ChatGPT plugin

An MCP App that brings Pummy.Ai's adaptive exam into ChatGPT, with a fullscreen/sidebar entrypoint, clickable answers, feedback, saved progress, source-grounded foundation questions, and spaced review.

## Use

Install the private plugin provisioned by this Site, then ask ChatGPT to open Pummy Adaptive Test. Import a question JSON or Pummy backup using the interface, or ask ChatGPT to build a bank from supplied course materials. A five-question arithmetic demo is available before importing any personal material.

The conversation model prepares foundation/return questions via `provide_question`; the backend validates, grades and persists them. No separate inference API key is required. When using the standalone website, open the connected plugin in ChatGPT for generated adaptive questions; nonadaptive practice works directly in the website.

This version supports text single-choice and select-all questions. Image, labeling, ordering and matching questions are deliberately excluded. A Pummy backup imports text questions and source excerpts; it does not upload original documents or images, migrate desktop attempt history, or synchronize the desktop library. The cloud plugin keeps its own progress. Limits: 200 questions per imported bank, 100 per test, 30 sources of at most 60,000 characters each, and 900 KB total saved course state.

## Architecture

- `lib/pummy-core.mjs`: bundled **existing** Pummy exam engine, course model, grading, source retrieval, prompts and spaced repetition. Its storage writes are adapted to isolated persisted course snapshots; AI generation is injected per exam. Original Pummy source files are unchanged.
- `worker/course.js`: host-generation adapter, persisted pending generation, redacted question view.
- `worker/tools.js`: nine validated MCP tools, idempotent imports and answer retries, revision checks.
- `worker/repository.js`: D1 course storage with per-user keys and compare-and-swap revision updates.
- `worker/mcp.js`: official MCP SDK with stateless Web Standards HTTP transport and registered MCP App resources.
- `app/main.jsx`: React UI using the official MCP Apps SDK; user actions call the same tools as chat.
- `db/schema.ts` / `drizzle/`: generated schema migrations.

The Sites boundary authenticates requests. Private tool data requires the trusted `oai-authenticated-user-id` header. Public discovery contains no user data. Browser API writes require a same-origin request. Answer keys are withheld from the current-question result until submission. Course text is reference data and does not authorize actions.

## Local development

Requires Node 22.13+ (the local preview uses `node:sqlite`).

```sh
npm ci
npm run build
npm test
npm run validate
npm run dev
```

Preview: http://127.0.0.1:8777. The local-only dev server supplies a mock user and writes to ignored `work/local.sqlite`. It binds only to loopback. Production does not contain this mock-auth server.

To refresh the vendored engine from the original app:

```sh
node scripts/vendor-core.mjs /absolute/path/to/Pummy/App
npm run build
npm test
```

## Deployment

`.openai/hosting.json` identifies the **same** private Site and its logical D1 binding. Publish updates to that Site, rather than creating a replacement plugin. The build emits `dist/server/index.js`, with default `fetch(request, env)`, and a self-contained HTML resource. The Sites publisher applies the generated Drizzle migrations and provisions the private plugin; do not wrap it in a second plugin.

Validation covers adaptive chains, nonadaptive retries, multi-select grading, persistence, idempotency, revision conflicts, user isolation, skip correctness, MCP discovery, protected calls, and UI resource metadata. Browser QA covers selection, feedback, retry, results, refresh, mobile layout, and simulated MCP App host communication. Actual ChatGPT placement and connection must be verified after installation.
