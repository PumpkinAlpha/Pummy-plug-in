# Bank review with cached chat tools

Some connected chats continue to expose an earlier tool list after a Site update. New server rules correctly reject direct generated-bank imports, but those chats cannot name the staging/review tools. This formerly left generated drafts unsaved.

The runtime now supplies `context.bankWorkflow` through `read_course_state`. Prefer native tools when available. Otherwise use the existing `add_questions` tool with only courseId, revision, requestId and one envelope:

```json
{"questions":[{"type":"mcq","origin":"generated","stem":"PUMMY_BANK_OPERATION_V1","options":["Pummy workflow operation","Compatibility transport"],"answer":[0],"explanation":{"body":["{\"name\":\"describe\",\"arguments\":{\"tool\":\"begin_bank_repair\"}}"]}}]}
```

The description returns the current input schema. To execute, update the JSON in `explanation.body`: set `name` to the exact allowed operation and put its remaining parameters in `arguments`. Split JSON into strings of at most 8000 characters when needed (up to 12 strings); the server joins them without separators. The fixed question fields satisfy older connector schemas but are intercepted before any import; no framing question is saved. Course, revision and begin/stage request ID come from the outer call; nested overrides are rejected. Reads, source mapping, calibration, staging, review and completion all use the native implementations and access checks. No other tools, source uploads, exam answers or deletion operations can be invoked through the envelope. Regular imports retain their existing semantics and generated-origin restrictions.

The explicit **Prepare original figures** control in Course & sources renders the student's attached originals without generating questions or sending a conversation message. It uses the same source renderer as bank generation. `read_source` with an exact page then supplies the image and its current source/visual provenance. A prepared image-only page is readable even with no extracted page text. Missing original bytes or unavailable pages remain explicit blockers. Source evidence and professor focus must be verified from these originals, never inferred from unkeyed quiz options.

Regression checks cover a complete reviewed save through the older transport, rejected source-support review, unauthorized operation/course overrides, immutable course/exam data, image-only reads and actual browser preparation. The browser suite also verifies the existing question formats on desktop and mobile. The host still owns tool-list refresh; this compatibility path works without requiring a refresh.

For visual candidates, read the original page first. The transport may omit `figure.dataUrl` while supplying the exact saved `visualId`, `sourceId`, `page` and figure metadata. The runtime retrieves only that authenticated course’s stored original bytes, then applies the same native source and visual-identity checks. This avoids embedding large base64 diagrams inside the 96 KB JSON transport.
