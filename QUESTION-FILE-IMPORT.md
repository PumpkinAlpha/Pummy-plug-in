# Question files and professor quizzes — v0.4.3

## Professor quizzes

Professor slides have reference priority 1, objectives/group activities 2, professor quizzes 3, course supplements 4, approved external references 5, other sources 6. Lower numbers are higher authority. Existing ranks can be changed explicitly.

This ranking governs retrieved reference context and conflict explanations, not grading. Supplied quiz questions retain their original keys and appear as Professor questions (`practice`). The default practice-first setting prefers those roots over generated bank questions. Import conversion is instructed to flag key conflicts rather than rewrite keys. Missing keys may only be inferred from supported course material and must be flagged; unsupported keys and missing-figure questions are omitted and reported. Model conversion still requires student review.

Source synchronization alone does not import quiz questions or generate a bank.

## Adding a question bank

Open a course in Pummy inside ChatGPT → Course & sources → Add question bank to this course. Select JSON/Pummy backup, TXT, Markdown, DOCX, or a text-based PDF.

JSON retains its existing direct structured import, including supported embedded images and spaced-review progress. Text/document files are extracted locally, without uploading the original file. Review/edit the text, choose a source type/priority, and optionally select a saved reference to update. Existing filename matches are selected when found; generated file reference IDs are stable by filename. Saving the same filename replaces its prior reference text, not existing questions. Selecting a different existing reference explicitly replaces its text.

Select Add questions with ChatGPT. The reviewed source is saved first, then ChatGPT is asked to read that source and append its existing questions with an idempotent request ID. The view only reports completion after the matching saved add_questions receipt exists, not when a message is sent. No exam is started, replaced or advanced; background reads remain data-only and never launch tabs. On a delayed request check the conversation for approval/errors; the same-request retry avoids duplicate appends.

Limits: files below 24 MB, extracted text at most 60,000 characters, PDFs at most 200 pages, and at most 200 questions per append/500 stored questions per course. Over-limit content is rejected, not truncated. Legacy .doc must be saved as .docx. Only main DOCX body/table text is read; headers, footnotes and images are not imported. PDF page markers correspond to real pages; TXT/DOCX do not manufacture page numbers. Scanned PDFs require OCR first; partial no-text PDF pages are listed. Images/diagrams and exact reading order are not guaranteed: figure-dependent questions must be omitted unless separately supplied with images.

Email addresses and labeled phone/contact lines are minimized before preview and again before saving. This is not complete personal-data detection: review for remaining identifiers. Contact permissions and project-file permissions are unchanged. The standalone website can preview text but requires ChatGPT for conversion; a Project link does not grant file access.

## Validation

71 automated tests pass, including actual PDF text extraction, DOCX paragraph/run/table order, TXT UTF-16 decoding, contact minimization, limits, scanned/password PDF failures, source-only staging, preserved active sessions and professor keys, idempotent append receipts, existing JSON/interactive imports, and non-rendering model tools. Browser checks of mock TXT, DOCX and PDF files verify preview and truthful standalone conversion blocking. The final ChatGPT model conversion/host approval flow has not been exercised against the real course, to avoid altering it.

Production dependencies: npm audit --omit=dev reports zero vulnerabilities. Existing development-only tooling advisories remain (drizzle-kit/esbuild chain and drizzle-orm); this change does not use that tooling to parse files or query production D1.

Extraction uses [unpdf](https://github.com/unjs/unpdf) and [fflate](https://github.com/101arrowz/fflate). Handoffs use the documented [MCP Apps UI message bridge](https://developers.openai.com/plugins/build/chatgpt-ui); no undocumented attachment IDs or external model API are required.
