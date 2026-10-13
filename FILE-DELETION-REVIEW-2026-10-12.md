# File deletion verification

Verified against disposable courses, local files and object-storage fixtures; no student production files were deleted.

## Confirmed behavior

- Delete source requires confirmation; cancelling changes nothing. Confirming moves the source to Recently deleted, removing it from active source choices and retrieval. Questions, answer keys, exam sessions, results, mastery, archived practice banks, original file bytes and saved slide annotations remain intact.
- Restore works after a browser reload and returns the same original file and annotations. This is recoverable source removal, not permanent file erasure.
- Pummy has read-only access to the computer folder. Deleting a source in Pummy leaves the local file untouched. Removing a local file reports it missing and keeps its stored copy; disconnecting the folder also keeps saved sources.
- Deleting an entire course removes its source content, bank archives, tutor metadata, annotations, requests, revisions, conversions, uploaded chunks and object-storage files. Paginated cleanup covers abandoned uploads. Failed storage cleanup remains retryable; database cleanup failure rolls back. Stale revisions and other users cannot delete the course or its files.

## Fixed findings

1. Deleted sources were absent from folder-scoped tutor lists but their saved presentations remained visible in the whole-course tutor library. The server and UI now omit those linked presentations, and stale direct opens require restoring the source. Independent presentation copies remain independent; no bytes or annotations are discarded.
2. Folder rescans tried to recognize deleted sources by metadata omitted from the public deleted-source summary. The scanner now also matches the deterministic folder/path source ID, skipping deleted files without uploading them.
3. A scan prepared before deletion could later restore the source. Saving rechecks deleted IDs before upload, and the server rejects folder-sync updates to deleted sources even when deletion occurs during an upload. Restore remains an explicit student action. Ordinary explicit source upserts retain their existing behavior.

## Verification

- 237 automated tests passed. New coverage includes linked-presentation delete/restore, exact originals and annotations, unchanged practice archives and active exam state, rescans, stale prepared plans, deletion during upload, retries, and course cleanup of source content and bank archives.
- Thirteen browser suites passed, including the new deletion workflow and extended local-folder tests: cancel, confirm, whole-course tutor hiding, reload, restore, local file preservation, missing-local-file retention and disconnect.
- Build and worker validation passed. MCP resource v22 is current, with all prior resource addresses retained.
- Ignored evidence: `work/deletion-qa/`, `work/folder-qa/deleted-folder-file.png`, `work/deletion-unit-tests.log`, `work/deletion-browser-tests.log`.

No permanent individual-source purge is offered by the current product. Recently deleted sources intentionally retain their stored bytes for recovery. Unlinked standalone tutor presentations do not yet have a separate delete control; course deletion removes them.
