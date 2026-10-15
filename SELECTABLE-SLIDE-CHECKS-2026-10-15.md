# Default selectable slide checks

Runtime 0.6.1 / plugin 1.0.7 makes the native chat check the default after typed and app-triggered slide explanations.

The old native widget required a saved one-slide request. Typed explanations had only read-only source context and could not reach that renderer. The button also sent a short message while background context could still describe an earlier slide. The repair adds a fresh descriptor to explanatory context reads, a model-visible `prepare_slide_explanation` tool, immediate visible-slide IDs and a serialized app handoff bound to a saved source snapshot. Typed and clicked requests now share the same save, explanation-first, citation-first, render-last instructions and implementation.

Checks require one single-answer question and a feedback explanation. No option is preselected. Saving or selecting does not expose answer keys; checking reveals correctness and the source-grounded rationale. Question keys are excluded from completed one-slide save responses. Informal requests and answers remain in tutor storage and are excluded from automatic bank-archive recovery. Formal exam/course snapshots and presentation metadata remain untouched. Native resource versions advance with earlier addresses retained.

The persistent server instructions and embedded professor-aligned teaching skill require the native selectable workflow without another student preference request. Original source authority, A–D teaching structure, citations, independent per-slide responses, and the rule against inventing unsupported medical content remain in effect.

Verification covers the typed path using context supplied by the app, the actual app-click path, separate native widgets, initially unselected controls, hidden keys before checking, correct/incorrect feedback, selected-option explanations, request replay, rapid slide changes, uncertain delivery, and unchanged formal exam/presentation snapshots. The controlled host harness supplies authored explanations; real ChatGPT model behavior and host layout are outside that harness.

No database migration, audience change, extra API key or data reset is required.
