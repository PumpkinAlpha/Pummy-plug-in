# PowerPoint upload repair and local-folder sync

The user reported that PowerPoint still would not upload/open after version 49, and asked to remove ChatGPT Project sync in favor of choosing a computer folder.

## Changes

- Removed Project-link setup, Project-sync button and conversation sync polling from the interface. Existing saved Project metadata is retained for backward compatibility, with no UI sync flow. Source tools remain compatible with saved courses and authorized supplied content.
- Added Course & sources → Choose folder. Supported files: PDF, PPT, PPTX, DOCX, TXT and Markdown, recursively. Hidden directories/files, temporary Office files, node_modules and unsupported types are skipped. Folder access is read-only; Pummy never edits local originals.
- New/changed files are reviewed before Sync. SHA-256 hashes skip unchanged bytes; stable relative-path source IDs update existing sources, preserving citations, question banks, progress and active exams. Updated originals get separate immutable assets. Missing files remain in Pummy; deleted Pummy sources are not silently restored.
- Standalone browsers supporting File System Access can remember a read-only directory handle in account/course-scoped IndexedDB. Check for changes rescans it. Optional 30-second auto-sync runs only while this sources page is open and visible. Permission loss pauses auto-sync. Disconnect stops sync and keeps saved sources. Embedded/unsupported hosts use a directory input and require reselecting the folder for subsequent scans.
- Uploads use three bounded parallel chunk requests, visible percentage/chunk progress and transient-request retries with unchanged receipts. Manual retry skips confirmed chunks. Asset reads are deduplicated and use bounded parallel chunk reads.
- Server opening now decodes original bytes directly from individual chunks into one byte buffer. It avoids a whole-file base64 join and a large Array.from temporary allocation, which were unsuitable for memory-limited Workers. This is a code-supported failure mechanism; the user's exact earlier error was not supplied and is not conclusively attributed to it.
- Image-only PowerPoint references retain their originals and identify visual-only slides explicitly instead of rejecting the entire presentation. No OCR or inferred slide labels are invented. Open slides is available beside attached PDF/PPT/PPTX course sources.
- Interface resource v19 retains all earlier resource aliases. No new migration, Site identity, plugin identity, storage binding, account, hosting service or permission audience is introduced.

## Verification

226 automated tests passed, zero failures or skips. Ten browser suites cover workspace, bridge explanations, editor, tutor/audio/exports, batch file imports, recovery, bank recovery, native PowerPoint, folder selection/reconnect and remembered-handle/automatic sync. Build and artifact validation passed. npm audit reported zero vulnerabilities.

The real saved Cardiac 4 lecture was downloaded through the authenticated deployed interface. Its unchanged 15,470,800-byte PPTX was tested in an isolated browser/database with R2-style chunk storage and a Node process using a 128 MiB V8 heap limit. All 86 chunks uploaded; all 16 slides rendered through the direct PowerPoint viewer without a PDF/converter; exported original bytes matched exactly. This is stronger coverage than the synthetic fixture tests, but a V8 heap setting is not identical to a Cloudflare isolate memory limit.

Remembered directory handles and auto-sync use an origin-private filesystem test harness. The native OS directory-permission dialog itself is not automated; directory-input selection of a real test folder is exercised. Tests check reload, unchanged skip, updates with stable IDs, source capacity rejection before writes, lost-response retries, revoked-permission pause, disconnect, original preservation and phone layout. Physical stylus and live conversation-model quality remain outside these checks.

## Browser and capacity limits

A web page cannot keep syncing a computer folder after it is closed. File System Access requires browser support and user selection; embedded hosts may prevent retained handles. Re-selecting the same folder in the same browser keeps source identity when the saved folder connection remains available. Browser storage clearing or switching devices may require reconnecting and reconciling sources.

The folder scanner accepts up to 1,000 supported file entries for review; each course still holds 30 sources, 60,000 searchable characters per source and 500 questions. Over-capacity sync fails before uploading. Image-only PDFs still need OCR for searchable source import. PowerPoint viewing is static; exact complex visuals can use an optional PowerPoint-exported PDF. The original PPT/PPTX retains notes, media and animations.

Browser references: https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker and https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory.
