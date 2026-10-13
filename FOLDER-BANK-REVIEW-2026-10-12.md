# Folder workspaces and practice-bank archive

Implemented the seven annotated browser requests against the existing Pummy Site and plugin. The project, plugin, public audience, DB and BUCKET bindings remain unchanged.

## Behavior

- Folder pages now contain six compact navigation widgets: Interactive Tutor, Adaptive exam, Custom tests, Course & sources, Progress, and Exam history.
- The course dropdown lists its study subfolders first and retains the other-course switcher.
- One active folder follows navigation and browser Back/Forward. Opening a presentation updates its page and folder together, avoiding duplicate Back steps. Adaptive setup starts in that folder; source-based generation and authored custom questions retain its scope.
- Existing course sources appears first and opens by default. Add a presentation follows it and starts collapsed. Both source pickers and the saved-presentation list respect the active folder. New independent imports retain folder metadata; older attached PDFs remain supported without putting their file bytes in course-state responses.
- Exam history contains a durable archive of imported/generated question batches, adaptive follow-ups, and slide practice, including practice not yet added to the course bank. Old saved course questions and completed tutor responses are recovered into the same interface.
- Archive editing supports choices/keys, explanations, ordering, matching and diagram labels. Edits change the archive copy, preserving active exams, original course questions, recorded results and mastery. Concurrent edits reject stale revisions. Unsaved edits survive attempted navigation and background course refreshes.
- Each bank provides a Quizlet TXT download (tab between question/answer, newline between cards) and a JSON backup. Downloads within a folder include only its questions. Nested newlines/tabs are flattened so cards cannot split accidentally.

## Persistence and review

`0006_practice_banks` is an additive Drizzle-generated migration, with matching journal and snapshot. No backfill runs in migrations or request-time schema changes. Archive rows are private to user + course and are deleted with their course. Course writes and archive capture share a transaction gated by the winning snapshot token. Tutor responses and their archives likewise commit together. Archive data sits outside the 900 KB course snapshot and survives rolling import-receipt limits. Retry receipts prevent duplicate archives.

Reviewed navigation state, import paths, tool schemas, MCP output shapes/visibility, account isolation, source-storage behavior, archive writes, edit concurrency, export formatting, theme variables and responsive layout. MCP resource v21 is current; v20 and older aliases remain available for cached hosts.

## Verification

- Build and worker validation pass.
- 234 automated tests pass, including durable archives beyond 40 receipts, retries, losing compare-and-swap writes, cross-account access, edits isolated from active exams, legacy recovery, adaptive/tutor capture, interactive-question edits and all Quizlet question types.
- Twelve browser suites cover workspace navigation, explanations in the real MCP bridge harness, tutor annotation/save/export/recovery, multi-file uploads, bank imports, native PPT/PPTX and original byte preservation, local-folder sync and handle recovery, viewport docking/audio themes, and the new folder/archive workflow.
- New workflow coverage includes two folders plus course switching, linked and independent presentations, a legacy attached PDF, whole-course presentation Back navigation, folder-scoped exams, bank editing, unsaved-edit protection, real Quizlet download, all themes and phone widths.
- Evidence and logs are in ignored `work/folder-banks-qa/`, `work/folder-bank-unit-tests.log`, and `work/folder-bank-browser-tests.log`.

## Practical limits

Old questions whose original batch receipt was already discarded are grouped by saved set/source; their original generation boundaries cannot be reconstructed. Old independent presentations without a source link or folder metadata remain available from the whole-course tutor library, rather than being guessed into an arbitrary subfolder.

Quizlet's text import cannot include diagram image bytes. The TXT includes the question, diagram reference and correct labels; the JSON backup retains images. Quizlet format reference: https://help.quizlet.com/hc/en-us/articles/360029977151-Creating-sets-by-importing-content

Optional LibreOffice conversion is not exercised in this release. Direct PPT/PPTX viewing, audio, originals and exports are covered by browser regression tests.
