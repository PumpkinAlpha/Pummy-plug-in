# Pummy Interactive Tutor

## Direct PowerPoint opening

PDF, PPT and PPTX originals open from the presentation picker or attached course source. PPT/PPTX use a bundled browser renderer; no conversion server, Office installation, external rendering service or companion PDF is required. Server-side parsers independently validate file structure, current slide order, dimensions, text and PPTX notes. Browser output must match slide count and aspect ratio. ZIP expansion and canvas pixel bounds limit memory growth.

The original is immutable. Downloads return the exact uploaded bytes. Annotations are stored separately; editable PPTX exports copy the original archive and add annotation objects while retaining original notes and media. Legacy PPT is retained unchanged and can be downloaded into PowerPoint. Its browser renderer receives a temporary in-memory view that suppresses obsolete saved records and follows the validated current revision. Both miniFAT and regular FAT files have regression coverage.

The study view is static. It does not play PowerPoint animations, transitions, video or interactive actions. Embedded PPTX audio has a separate browser player; legacy audio remains in the original PPT. Complex charts, SmartArt, equations, unusual fonts and embedded objects may render differently or be unsupported. Add a PDF exported by PowerPoint for exact visuals; export all slides in the original order. PDF count/aspect checks cannot prove matching visual content. No external links or document macros are executed. Generated slide SVG is sanitized, loaded as an inert image and rasterized locally.

## Interface and editing

The shell header and editor titlebar remain visible. Explicit sidebar controls replace hover-only navigation. Back, Undo, Redo, Versions and exports remain reachable; the ribbon can collapse. Courses/Info and custom-test tabs support Arrow keys, Home and End. Mobile panels wrap without horizontal page overflow. Deleted sources do not inflate home folder/source counts.

The original slide is the background. Separate editable annotations support pen/pencil, highlights, text, shapes, arrows, images, notes, selection, movement, resize, rotation, layers, grouping, alignment, undo/redo and version restore. Original text can be copied into an editable annotation. Original professor objects are not changed in storage. Connectors are independent line objects. Multiline text does not provide rich-text editing. Device-specific stylus pressure needs hardware verification.

The editor fits available width/height and supports zoom, fit-width, fullscreen and a host-compatible expanded fallback. Browser Back/Forward preserves view IDs. Navigation joins in-flight saves; failure retains the editor and draft. Local recovery is scoped by authenticated owner/course/presentation. Recovering a deleted slide annotation marks that slide dirty, so deletion reaches the server. A newer server revision requires explicit conflict recovery.

## Persistence and security

Original uploads transfer in 180 KB slices through the existing BUCKET R2 binding. There is no fixed original-file upload byte cap; processing/memory limits still apply. D1 stores trusted-user ownership, immutable receipts, presentation metadata, annotations and revision history. Legacy D1 original chunks remain readable. Course question/progress snapshots are capped at 900 KB; source text/page segments live in separate rows. No new database migration is introduced by this deep review; retain all existing ordered migrations through 0005.

Every operation authorizes the parent course. Presentation metadata and validated original availability are published atomically. Rejected source validation and rolled-back course saves never publish original assets. Durable request IDs, revisions and transactional saves prevent duplicate writes and concurrent overwrite. Originals never change during annotation save, project import, text sync or export.

PPTX media comes only from bounded local archive parts. External media is not fetched. Playback stops and object URLs are revoked when leaving the slide. Codec support varies. Course/model text is escaped; XML entities, corrupt/encrypted files and macro-bearing input are rejected. Input streams, optional conversion output, SVG resources and canvas sizes are bounded. Prompt boundaries reduce injection risk but do not prove perfect semantic detection.

## Exports

| Format | Behavior |
| --- | --- |
| Original | Exact PDF/PPT/PPTX bytes. |
| Slides PDF | Existing original/companion PDF when present; otherwise a static PDF rendered from the native deck. |
| Annotated PDF | Rendered slide visuals plus annotations; no editable PDF annotation fields. |
| Editable PPTX | Original PPTX plus native text/vector annotation objects, preserving notes/media. Conventional namespace prefixes required. Image annotations use flattened fallback; pressure is approximated by uniform strokes. |
| Flattened PPTX | Composite slide images with notes. Mixed page aspect ratios require PDF export. |
| Pummy project | Original, optional PDF, metadata and editable annotations. Reimport creates an independent presentation and new annotation IDs. |

Exports run locally. Downloads depend on the host/browser. Native opening does not require the optional converter described in [converter/README.md](converter/README.md).

## Verification

Run npm test, npm run build, npm run validate and npm run test:all-browser. Chrome/Chromium is required for browser checks. PUMMY_BROWSER_EXECUTABLE can select an installed browser. Tests use isolated users/databases and do not answer the student's live exam. Direct native opening is covered by default. PUMMY_TEST_CONVERSION=1 additionally enables a LibreOffice fixture workflow and requires PUMMY_SOFFICE; LibreOffice/Docker are unavailable in this audit environment.

See [DEEP-REVIEW-2026-10-12.md](DEEP-REVIEW-2026-10-12.md) for the current results and verification limits. Live ChatGPT model quality, native PowerPoint compatibility for every possible deck, OAuth callback completion and physical stylus behavior are outside the automated harness.
