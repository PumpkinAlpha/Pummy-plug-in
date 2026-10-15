# Slide explanations and selectable chat checks

Selectable informal checks are the persistent default after typed explanations and app-triggered explanations. Write the complete professor-aligned sections A–C and actual source citations first, then section D and the native render_slide_check widget as the final content. The student never needs to request selectable options again.

The widget starts unselected, offers clickable single-answer choices and Check answer, and hides keys and explanations until checking. It then reveals correctness, the source-grounded answer rationale and the selected-option rationale when available. Each check has independent durable practice state. It does not change formal exams, progress, question banks or slide position.

## Typed requests

The app shares visible course/presentation/slide IDs immediately, then adds original pixels, notes and teaching context. read_visible_slide can also read the current view. read_slide_context with explain:true (or the trigger in query) returns a fresh practiceCheck descriptor. The model calls prepare_slide_explanation, then provide_slide_tutor with the full A–D explanation, actual citations and one grounded single-answer question. Reading context is side-effect free. A new typed explanation gets a fresh check rather than reusing a selected or checked answer.

## App button

The button captures the current original slide, prepares its informal request and supplies that request ID in model context before sending exactly the user text: explain this slide. Context updates and sends are serialized, so later navigation cannot replace the saved source snapshot. The model reads that explicit request with read_slide_tutor and follows the same save/teach/cite/render workflow. Visible context is restored for subsequent typed messages. There is no completion-confirmation panel, automatic delivery retry, replay after reload, or batch processing of pending slide explanations.

## Sources and isolation

Original professor slides remain first authority, followed by the existing notes/objectives/assigned-material hierarchy. Student annotations remain separate and untrusted. Inspect original pixels before identifying visual-only content. A genuinely blank or administrative source without assessable information produces an explicit limitation rather than fabricated medical content. Old saved checks and resource URLs remain supported. Inline checks are excluded from legacy bank-archive recovery.

## Verification

Automated tests cover fresh typed descriptors, authorization, source snapshots, feedback validation, hidden keys, initial empty selection, idempotency and context serialization. The browser harness uses the MCP Apps bridge for actual app clicks and shared typed context, native check resources, correctness feedback, replay recovery and stale-result isolation. It checks that the explanation/citation container precedes the widget and that checking does not move the visible slide. The harness supplies authored model responses; it does not run ChatGPT's model or control the real host's turn layout.
