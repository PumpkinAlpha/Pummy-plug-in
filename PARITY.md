# Adaptive-exam parity audit

Reference: original Pummy `src/ui/Exam.jsx`, `src/engine.js`, `src/ui/Interactive.jsx`, `src/exam-preferences.js`, `src/ui/ExamCoverage.jsx`, `src/ui/Explain.jsx`, `src/srs.js` and warm HUD stylesheet.

| Original exam surface | Plugin implementation |
|---|---|
| Original adaptive scheduling, professor-first, due reviews, misses, climb, depth cap and retries | Reuses original engine, not a rewritten approximation |
| Size, adaptive switch, professor-first and reviews | Restored and saved per course |
| Week/source/objective/type and practice-set restriction | Strict filters; empty selection never silently becomes “all” |
| Continuous answer/feedback/Next flow | Restored, including instant single-choice and explicit multi/board submission |
| Number keys and continuation | Number keys select; Enter submits/continues; modifier, input and modal guards |
| Every key continues after feedback | Deliberately restricted to Enter/number keys to avoid accidental navigation from Tab |
| Foundation ladder and gap/return messages | Restored through deepest visited level, with active depth highlighted |
| Source/objective tags and review flags | Restored with source reading, objective modal and optional flag note |
| Label/order/match/image boards | Restored with embedded raster assets, redacted keys, tap and drag/drop/arrow controls |
| Figure enlargement | Restored in an accessible dialog |
| Ten-question review checkpoints | Restored with full question, correct answer and explanation reviews |
| Final summary and original correctness buckets | Restored; completed sessions also have retained history |
| Wrong-answer flash, streak/confetti and mastery | Restored, optional animation and reduced-motion support |
| Full explanation, choice “Explain more”, educational objective/table/figures/citations | Conversation-backed request/provide tools and safe rich rendering |
| Auto-explanation setting | Available but off by default to avoid unwanted conversation messages |
| Question Chat | Handoff to the ChatGPT conversation, not a separate local AI chat history |
| LocalAudio playback | Browser speech-synthesis alternative; host support not guaranteed |
| Spaced-review concept buckets and prerequisite links | Reuses original model/SRS logic; visible in Progress |
| Objective mastery | Tracked concepts including prerequisites, retained counts and original mastery celebration |
| Full-bank coverage auditing against detected source topics | Outside this exam port; tracked-objective mastery is not claimed as full material coverage |
| Backup question attempts and spaced-review intervals | Restored when present; exports roundtrip through plugin JSON |
| Existing desktop in-progress exam | Not migrated; existing cloud exams preserved during upgrade |
| Live synchronization with desktop | Not implemented; import/export is explicit |
| Original document viewer / source page thumbnails | Imported excerpts and embedded figure viewer; original office/PDF documents not hosted |
| Entire course library, source editing, AI bank builders, slide studio and Anki tools | Outside the requested adaptive-exam surface |

## Practical limits

The current snapshot architecture caps each saved course at 900 KB. Embedded images count toward that budget; large image banks need compression or separate banks. JSON files can restore up to 500 questions in resumable batches of at most 200 questions per tool call and a conservative 1.35 MB UTF-8 payload budget, with 30-source/200-objective limits. Missing backup images are reported as omissions. No original desktop files or cloud sessions are silently changed.

## Verification

Seventeen backend/protocol tests pass. Native browser verification completed a six-format isolated local exam, checked correct feedback, final rich review results, progress, desktop appearance, and a 390px layout without horizontal overflow. The upgraded interface opens in the actual installed host and resumes existing progress. This already-running conversation retains the old nine-tool trusted scope: newly added source, explanation, settings and end/download actions require a fresh plugin conversation. This limitation is shown plainly instead of exposing an internal scope error. Live audio/download support and new-tool interactions are not yet verified in a refreshed host session.

## v0.3 cleanup

Course creation, append-only bank/reference management, ChatGPT Project links, saved/editable custom question selections and source-based bank authoring handoff are now available. A Project link is not automatic source-file access or cross-project chat routing; open the plugin inside that Project chat. Bank practice avoids generation. Adaptive tutoring still runs through the conversation model. The export remains a question-bank/spaced-review backup, not a full course/project/custom-test configuration backup.
