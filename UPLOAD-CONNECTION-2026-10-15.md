# Course upload connection recovery

The reported course-source row showed `McpServerError: Connection failed.` for
`Session 21-22 - ABDOMEN 1-2.pdf`. Production reads succeeded during diagnosis,
and the production error log query returned no events. The original transport
failure could not be reproduced with the student's file; only its screenshot
was provided.

The uploader previously retried some network/storage errors for chunks, but
missed this MCP connection error and did not retry upload initialization,
the final course read, or source synchronization. These four import steps now
use bounded backoff (three attempts, waiting 250 and 500 ms). Writes reuse the
same asset IDs, chunk data, source IDs, revision and durable request receipt.
Confirmed chunks remain skipped on a manual retry. Validation, authentication
and tool-scope errors still fail immediately. Persistent connection failures
explain how to retry or reopen Pummy. No direct-network fallback was added.

The interface resource advances to v25, retaining all previous resource aliases.
No schema, course data, exam progress, identity or audience changes are required.

Verification: all 279 automated tests passed, including eight PDF integration
cases that inject the reported MCP error before/after each import step. Tests
verify lost-response idempotency, unchanged PDF bytes and active exams, bounded
retries, and skipping confirmed chunks. Artifact validation and desktop/mobile
batch-upload browser QA passed. The student's original PDF and live embedded
host upload were unavailable for verification.
