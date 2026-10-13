# Explain button and chat messages

The floating **Explain the slide** button sends exactly this MCP host message:

```json
{"role":"user","content":[{"type":"text","text":"explain this slide"}]}
```

This is the supported equivalent of typing the text in ChatGPT and pressing Enter. The button does not create a tutor request, call a server tool, capture a slide, allocate request IDs, store a queue, add instructions, or render a completion panel. It disables briefly while delivery is pending and shows an error if delivery fails; it never retries automatically. Reloading does not resend anything.

The existing background model context and `read_visible_slide` browser tool share the currently visible professor slide. The model treats the short message like a typed trigger: read the current slide using `read_slide_context` with `explain=true`, follow the returned explainer skill, explain the slide, cite the source, and put the practice question last. A standalone website has no access to ChatGPT's chat composer; sending requires the embedded MCP App host. The host owns message scheduling and native response placement.

Legacy `request_slide_tutor`, `read_slide_tutor`, `provide_slide_tutor`, delivery claims and independent saved checks remain supported for existing conversations and stored results. They are no longer invoked by the button. For an explicit legacy request, the model writes its explanation and citations before the final `render_slide_check` tool call. Existing checked answers, source materials, annotations and formal exam state remain intact.

## Verification

The local browser harness checks actual slide 4/5 clicks and asserts that both host messages contain only the exact short text, no tutor request or claim tools are called, and no completion panel appears. It verifies delivery errors do not replay after reload, a fresh click still works, legacy independent check widgets retain their results, and exam/presentation snapshots are unchanged. Build, artifact validation and automated tests cover the server and both UI resources. This harness does not reproduce ChatGPT's model or response placement.
