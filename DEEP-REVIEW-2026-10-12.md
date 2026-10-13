# Pummy deep review — October 12, 2026

This update continues the version 47 audit. It reuses the existing Site, plugin, audience, DB and BUCKET. No new migration or conversion server is required.

## Findings fixed

| Finding | Resolution and evidence |
| --- | --- |
| Production PowerPoint opening depended on an unavailable native converter | Bundled @web-ppt/core 0.4.5 opens PPT/PPTX directly in the browser. Tests verify text, diagrams, embedded images, source bytes, notes/media, exports and project reimport without converter calls or external requests. |
| Legacy renderer displayed obsolete saved slide records | A validated current-revision adapter supplies a temporary CFB view. MiniFAT and regular FAT tests verify current text/order and unchanged original bytes. |
| Hover-only shell/editor controls were hard to find and collided with the canvas | Stable visible headers, explicit sidebar toggle, visible Back/Undo/Redo/Versions/export, calmer surfaces, mobile wrapping and keyboard tab navigation. Screenshots inspected at desktop and phone widths. |
| Import receipts disappeared after a reload | Account-scoped, 24-hour recovery journal stores only IDs/positions and an input digest. Reselecting the same file resumes saved receipts. Lost-response/reload browser regression verifies no duplicate course/questions. |
| Question-count batches could exceed UTF-8 request limits | Conservative 1.35 MB payload budget plus 200-question maximum. All course plans preflight before writes; oversized reference/question payloads fail with a clear message. |
| Original asset readiness could precede failed course validation/save | Original readiness now updates only inside the winning course transaction. Validation, rollback and successful publication tests added. |
| Recovered deletion of all slide annotations could fail to save | Dirty slide IDs include both prior server slides and recovered slides. Existing recovery/save tests remain green. |
| Streaming conversion bodies could allocate excessively | Early declared/streamed byte bounds; cancellation, 16 MiB optional conversion input, 24 MiB output and bounded errors. Optional converter admits jobs before reading bodies, limits queue/process time and probes executable health. |
| Deleted sources inflated home counts | Home source/folder counts now exclude recently deleted sources while retaining restore data. |
| Native slide SVG could contain active/external content | Sanitized SVG is rasterized as an inert image. Browser attack regression removes script, foreignObject, handlers and external references; no document-generated external requests occur. |

## Review scope

Line-by-line review focused on first-party import/source parsers, trusted identity/authorization, course persistence, source publication, request limits, PowerPoint/PDF rendering wrappers, annotation recovery/export, navigation, tabs, editor styling, MCP resource/CSP configuration and optional conversion service. Existing adaptive/explanation/source/custom-test regression suites also ran. Generated/minified assets and every line of third-party dependencies were not independently audited; dependency advisories and package version/license were checked. This is not a claim that every possible document or host combination is proven correct.

## Verification

- 220 automated tests passed; zero failures/skips.
- All eight browser suites passed: workspace, explanations/MCP bridge, editor integration, tutor/audio/exports, batch course uploads, recovery, bank import and native PowerPoint.
- Native PowerPoint and reload-recovery bank suites reran successfully after final focused changes. Native attack test, legacy current-revision test and UTF-8 batch preflight test passed.
- Build and artifact ESM/default.fetch validation passed.
- npm audit and npm audit --omit=dev reported zero vulnerabilities.
- Diff review found no first-party whitespace errors. Generated app/view.html contains a PDF-library template-string whitespace sequence; it is left intact.
- Live unauthenticated root redirected to the platform sign-in route, which redirected to auth.openai.com. No 404 was reproduced. A complete fresh OAuth callback/login roundtrip was not exercised.
- Disposable databases and mock users were used for state-changing tests. No student's live exam was answered or replaced.

Browser evidence is under ignored work/native-powerpoint, work/audit-browser, work/audit-tutor and related QA directories. Automated log: work/deep-review-tests-final.txt. Aggregate browser log: work/deep-review-browser-final.txt; subsequent focused runs are recorded in the release session.

## Remaining practical limits

Direct study views are static and may differ from PowerPoint for SmartArt, complex charts/equations, special fonts or embedded objects. Animations, video and interactive actions remain in the unchanged original. PPTX audio has a browser player; legacy audio is retained for playback in PowerPoint. A PowerPoint-exported companion PDF remains available for exact visuals. Original download byte equality and retained PPTX notes/media are tested; universal native Office compatibility is not claimed.

Course capacity remains 500 stored questions, 900 KB question/history snapshots, 30 sources, 60,000 searchable characters per source and 200 objectives. Byte-aware batches avoid transport failures but do not bypass saved-course capacity. Split large banks or compress embedded question images. Original-file chunk uploads have no fixed byte cap; parser/browser memory limits still apply.

The authenticated optional LibreOffice service is hardened and has a container recipe in converter/. Docker/LibreOffice are unavailable here, so its image/native process was not exercised in this review. Native opening works independently of that service. Model generation remains owned by the ChatGPT conversation; bridge/lifecycle behavior is tested with a host harness, not a guarantee of live model output quality. Physical stylus behavior and download restrictions need testing on the intended host/device.
