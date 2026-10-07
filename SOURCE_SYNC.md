# Project Source Sync — v0.4.2

## Walkthrough

1. Open the Anatomy 1 **ChatGPT Project**, then a chat inside it with access to its materials.
2. Open the installed **Pummy Adaptive Test** plugin in that chat; resume the existing Anatomy 1 course. Do not create a replacement course or restart its test.
3. Open **Course & sources**, then **Sync Project Sources**. Alternatively say: “Sync the current Anatomy 1 Project sources into Pummy. Preserve my bank and active exam.”
4. ChatGPT reads the files it can actually access, extracts text, supplied pages/slides and objectives, reads `read_course_state` for current IDs/revision, then calls `sync_course_sources`.
5. Check the tool summary and reference rows. ChatGPT must report inaccessible files rather than inventing their content. A sent request is not a completed sync.
6. Pummy uses the stored copy for adaptive prompts, explanations and `retrieve_sources`. Bank generation remains a separate, explicit action.

The Project link is navigation metadata only. This feature grants no new Project permissions, fetches no Project URLs and requires no manual text copying from the student. If files are inaccessible, open a chat in the Project or attach the missing files. A fresh chat may be required for newly added MCP tools to appear.

## Privacy and panel behavior

Before sending source payloads, ChatGPT is instructed to omit unrelated instructor/student email addresses, phone numbers and administrative contact blocks from text, every page and metadata. This preserves the educational content without sharing contact details unnecessary for studying. It is client-side extraction guidance, not a guarantee or a server-side filter; the host reviews the actual outgoing payload before the server receives it and may still request permission for sensitive content. This feature neither needs nor requests address-book access, and no app permission is automatically broadened.

Only the user-initiated, app-only `open_interface` entrypoint carries rendering metadata. The model cannot invoke it; `open_test` remains a legacy data-only alias with the same saved-state response. This also protects workflows that still call the old name. Use `read_course_state` to get the same redacted library/course/exam state without opening a panel. Startup, refresh, polling, tutor and sync handoffs use this data-only tool. Other data tools retain app/model visibility without a UI-template association, so they do not request another panel. Hosts may retain old descriptors until a fresh conversation.

## MCP contract

`sync_course_sources` accepts:

```json
{
  "courseId": "existing-course-uuid",
  "revision": 16,
  "requestId": "fresh-request-uuid",
  "sources": [{
    "id": "ppt-thoracic-viscera-5-6",
    "name": "Session 19–20 THORACIC VISCERA 5–6",
    "text": "Extracted document text, not a URL",
    "sourceType": "professor_slides",
    "rank": 1,
    "lecture": "Thoracic Viscera 5–6",
    "weekId": "week-10",
    "pages": [{"page": 15, "unit": "slide", "text": "Extracted slide text"}],
    "metadata": {
      "originalFileName": "lecture.pptx",
      "mimeType": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "pageCount": 40,
      "projectName": "Anatomy 1",
      "sourceOrigin": "project_conversation"
    }
  }],
  "objectives": [{
    "id": "thorax-objective-1",
    "text": "Extracted professor objective",
    "num": 1,
    "sourceId": "ppt-thoracic-viscera-5-6",
    "lecture": "Thoracic Viscera 5–6",
    "weekId": "week-10"
  }]
}
```

The example is a schema illustration, **not** actual Anatomy content. Source and objective arrays default to empty; at least one must contain an item. Existing course argument conventions require a UUID course ID and nonnegative revision. Source/objective IDs are stable strings, up to 180 characters, beginning with an alphanumeric and otherwise containing letters, digits, `.`, `_`, `:`, or `-`. Source `id`, `name`, and nonblank `text` are required. Remaining illustrated fields are optional. `unit` defaults conceptually to page when omitted. Objective `id` and nonblank `text` are required; `num` can be a finite number or string. Questions support both legacy `objective` and new `objectiveId` references.

Supported metadata is limited to `originalFileName`, `mimeType`, `pageCount`, `projectName`, `projectUrl`, `sourceOrigin`, and ISO `syncTimestamp`. `sourceOrigin` is one of `project_conversation`, `student_upload`, `manual`, or `import`. Unknown fields are rejected, not silently discarded. URLs are stored only, never fetched.

Return shape: `{state, sync, message}`. `sync` contains `requestId`, arrays `added`, `updated`, `unchanged`, `rejected`, objective arrays in `objectives`, `totalSources`, and resulting `revision`. Errors include useful messages; validation/business errors include a rejection summary where execution reaches the handler. MCP SDK schema/transport rejections can occur before that handler and return protocol validation errors instead. No part of an invalid batch is persisted.

### Identity, hashes, retries and concurrency

- New ID inserts; existing ID upserts. Reuse existing IDs discovered through `read_course_state`—particularly **`quiz-19-20`**. Filename similarity is not fuzzy identity matching; clients must reuse IDs.
- Server computes SHA-256 over UTF-8 `JSON.stringify(canonical({text, pages}))`, where canonical recursively sorts object keys, omits undefined object values and retains array order, and absent pages become `[]`. This is **not** SHA-256 of raw text. Optional client `contentHash` is 64 hexadecimal characters and is verified; clients may omit it.
- Same text/pages and semantic metadata are unchanged. Changes to name, type, explicit priority, lecture/week or metadata also constitute updates even when the content hash is unchanged.
- Existing priority is retained unless `rank` is explicitly supplied. Type defaults apply only to new/unranked sources. Optional omitted fields retain old metadata. Changing text while omitting pages clears stale page segments; explicitly send `pages: []` to clear them.
- Insert/change stores hash, creation/update/last-sync timestamps and per-source status. A legacy identical source may remain without new stored hash fields until it changes; equality still hashes its stored content server-side.
- Successful request receipts survive restarts in the existing course snapshot. Same `requestId` and same semantic payload returns the saved result even with an old revision. Reusing an ID for a different payload fails. Fingerprints exclude client hash and metadata sync timestamp, but include array order.
- Receipts use the existing last-40 completed-request window shared with other idempotent operations. Outside it, stable IDs still prevent duplicate sources; read the latest revision and retry with a fresh request ID.
- Changing batches increment course revision once. Unchanged batches record completion/receipt without a revision bump, question changes or progress changes. Full-snapshot compare-and-swap also prevents losing these receipts during concurrent writes. On a conflict, read `read_course_state` and retry the same payload with the current revision.
- This tool never deletes sources or questions. It refreshes stale pending grounding requests but does not restart the exam or call model generation.

## Authority defaults and Anatomy IDs

| Stable ID | Type | Default rank |
|---|---|---:|
| `ppt-thoracic-viscera-5-6` | `professor_slides` | 1 |
| `objectives-thoracic-viscera-5-6` | `objectives` | 2 |
| `group-activity-thoracic-viscera-5-6` | `group_activity` | 2 |
| `quiz-19-20` | `professor_quiz` | 3 |
| `more-resources-thoracic-viscera-5-6` | `course_supplement` | 4 |
| `nova-mediastinum-great-vessels` | `approved_external` | 5 |
| `nova-cranial-nerves` | `approved_external` | 5 |
| other stable IDs | `other` | 6 |

Lower numbers mean higher authority. Explicit rank 1–6 overrides defaults. Existing Quiz 19–20 rank is not silently changed merely by adding a type. An explicit rank update can apply the new hierarchy at the student's request.

## Stored grounding and provenance

`retrieve_sources({courseId, query, sourceIds?, objectiveId?, budget?})` is read-only. It returns relevant excerpts, source IDs/names/ranks, supplied pages/slides, hashes, offsets, objectives and grounding rules. Budget is 1,000–12,000 characters (default 10,000), with reserved metadata overhead; each excerpt is at most 1,800 characters, at most two per source. This is a character budget, not a tokenizer-exact token count.

The original engine's term-frequency/chunk index is extended, not replaced by a separate vector service. Retrieval matches question/source/objective metadata and lexical text, sorts by authority then relevance with stable tie-breakers, and enforces `sourceIds` exactly, including an empty selection. It does not require reading the Project again. Standalone tutoring retrieval does not inherit the current exam question's objective or reveal its key.

Adaptive foundations/returns and full/deeper-choice explanation prompts carry bounded stored context. Formatted source grounding is capped at 12,000 characters with valid escaped JSON. Provenance records the actual included source/hash/page/offset references and objectives rather than duplicating their text. Source updates invalidate pending generation/explanation IDs so stale responses cannot be saved against changed context. Existing practice/original question provenance remains intact; the engine retains its established `followup`/`variant` labels for generated remediation rather than rewriting them.

Prompts instruct the model to prefer professor material, report disagreements under `conflicts`/gaps and identify unsupported facts. Explanation UI displays model-reported conflicts. Citation validation rejects unknown source names/IDs and invented pages; page-less excerpts do not acquire artificial pages. There is no automated semantic conflict detector or proof that every generated sentence is entailed by a cited excerpt: conflict recognition and faithful reasoning still depend on the conversation model.

Source text is untrusted reference data, rendered as escaped React text and delimited as escaped JSON in new grounding prompts. It cannot directly execute MCP actions, HTML or scripts. Prompt instructions and reference isolation reduce injection risk; they are not a guarantee that a language model can never be influenced by malicious text.

## Source reading and UI

`read_source` preserves complete-text reads with the previous 60,000-character maximum. Optional `metadataOnly`, `page`, `fromPage`, `toPage`, `offset` and `limit` support focused reads with `pageNumbers`, `truncated` and `nextOffset`. Page requests require supplied segmentation or recognized `--- Page N ---` / `--- Slide N ---` text markers. Citation links open the cited supplied page; large excerpts can be continued.

Course setup includes **Sync Project Sources**, truthful sent/pending/error/completed states, totals and reference rows showing type, priority, last sync and Not synced/Synced/Updated/Unchanged. Standalone local/web usage cannot read Project files and disables the ChatGPT sync handoff. It can still import manual text. Manual source type and rank selectors use the same sync action.

## Limits and migration

- Up to 30 sources and 200 objectives per course/batch.
- Source text and each page text: 60,000 characters; at most 1,000 supplied page segments per source.
- Objective text: 4,000 characters. Full sync payload: 750,000 UTF-8 bytes; stored course snapshot remains capped at 900,000 UTF-8 bytes including existing questions/images/progress.
- Split batches with fresh request IDs; large files need carefully selected excerpts or stable page-group source IDs that fit these limits. There is no original-binary upload or OCR parser added to the server.

Persistence remains the existing per-user D1 `courses.data` JSON snapshot, source metadata array/text map, objectives array and completed-request history. `courseId` remains implicit in its owning course, not a parallel source table. New fields are optional and lazily interpreted. **No SQL schema migration, database wipe, course replacement, question re-ID or exam reset is required.** Old resource URIs and existing MCP actions remain available. The new interface resource is `ui://pummy/adaptive-test-v7.html` with v6/v5/v4/v3/original aliases.

Implementation does not ingest the seven real Anatomy materials until ChatGPT can actually read and push them. The course link alone is never sufficient.
