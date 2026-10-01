# Content Script Structure

## Active Chrome Load Path

On this Mac, Chrome's unpacked Ready_Ai entry in the 재헌 profile points to:

`/Users/clean/Develop/project-extension/Ai_ready`

The Windows load paths below are historical; verify the current profile's actual path before copying files. The earlier Windows entry pointed to:

`C:\Users\dl971\Development\project-extension\Ready_Ai`

Do not assume that editing this git checkout alone updates the running Chrome extension. After changing the extension, mirror the committed extension files to that load path, then reload the unpacked extension in Chrome. If this path is missing, recreate it from the current committed extension root before debugging missing panels.

Chrome may also have the repo checkout itself loaded as another unpacked Ready_Ai extension:

`C:\Users\dl971\Development\DevTool\Dev-DevTool-Extension-ReadyAI`

Do not leave both Ready_Ai unpacked entries enabled during normal use. Two extension IDs inject separate isolated content scripts into the same ChatGPT page, which can duplicate follow-up buttons, make the panels fight over `#ready-ai-steering-host`, and freeze Chrome when more than one ChatGPT tab is open. The local canonical development extension id is `jmgnmeaiahlpbbgnocmognokfecofkma`; the older mirrored-path id observed on this PC is `ajnolilmicdilijebljgchoodgajnfeg`.

The content script has a page-level duplicate guard using `data-ready-ai-extension-owner`, `data-ready-ai-extension-id`, and `data-ready-ai-content-version`. Do not remove it. It lets one Ready_Ai instance own the ChatGPT page while duplicate instances answer `ping` but skip UI, status checks, and queue processing.

Do not bump the `readyAiContentVersion` handshake string for ordinary content changes. Chrome can keep an older service worker alive after files are updated; if the old worker expects the previous string and the newly injected content reports a newer string, the worker repeatedly reinjects the full content script set and can freeze ChatGPT tabs. Keep `READY_AI_CONTENT_VERSION` stable for compatibility, and put the actual build marker in `READY_AI_CONTENT_BUILD_VERSION` / `readyAiContentBuildVersion` / `data-ready-ai-content-version`.

Gemini and AI Studio use Google AI title safe mode. Do not inject the main-world title guard, attach the title reconciliation observer, or run badge stability rewrites on those hosts. Gemini changes its own title repeatedly when a conversation starts; competing writes can create a title feedback loop and runaway renderer memory. Their generation and queue status must remain visible in the extension panel without mutating `document.title`.

## Injection Rules

The extension must not declare the full split content scripts for ChatGPT in
`manifest.json`. ChatGPT uses only `src/content/chatgpt-bootstrap.js`, matched
to top frames. The shim sends `ensure_content_for_current_chatgpt_tab`, then
the background injects the split files into that same top frame. The bootstrap
runs at `document_end`; programmatic ChatGPT injection uses `injectImmediately`
so neither stage waits for `document_idle` or slow images/frames. If injection
arrives before `body` exists, a temporary observer starts monitoring as soon as it
appears, without waiting for deferred site scripts or `DOMContentLoaded`.
Concurrent bootstrap/navigation requests share an in-flight operation per document,
and known document IDs bind injection to that navigation, including same-URL reloads.
Do not add
`all_frames`, `match_about_blank`, or the full `part-*.js` files to the ChatGPT
manifest entry.

Gemini, AI Studio, and the other non-ChatGPT built-ins use the manifest-managed
split content entry, top-frame-only. This lets Chrome perform their normal
`document_idle` injection without background all-frame probing.

The background service worker manually injects the full content scripts only
for the current ChatGPT tab that requested bootstrap, active ChatGPT tabs,
queued ChatGPT tabs, or an explicit popup target tab. For ChatGPT, full
injection must stay top-frame-only.

When a top-level ChatGPT URL loads, the background must ensure the content script even if the tab-active cache is stale. Chrome can emit URL/status events before this extension's active-tab metadata catches up, which otherwise makes newly opened ChatGPT tabs miss the follow-up launcher. This is safe only because ChatGPT injection remains top-frame-only and `readyAiContentVersion` stays stable.

After an extension reload or update, Chrome does not automatically reinject manifest-managed content scripts into already-open Gemini or AI Studio pages. A completed top-level page may therefore retain a dead Ready_Ai host whose extension context no longer answers messages. Wait for normal `document_idle` injection first; only when the page is already complete and repeated ping attempts get no response may the background inject the split files once for recovery. Never recovery-inject over a responsive content instance.

Manual injection load order:

1. `src/sites.js`
2. `src/content/part-01.js` through `src/content/part-12.js`

`src/content.js` was removed to avoid maintaining two copies of the same content script. If content logic changes, update the split files that are listed in `CONTENT_SCRIPT_FILES` inside `src/background.js`.

Do not re-add a ChatGPT `content_scripts` block to `manifest.json`, do not set `all_frames: true`, and do not restore `match_about_blank` for ChatGPT. Those settings wake too many frames/tabs and can make Chrome lag when several ChatGPT tabs are open.

## Follow-up session recovery (0.3.14)

ChatGPT queues, drafts and actual file bytes are isolated by tab and conversation ID.
SPA navigation keeps each conversation's live state; returning restores that state
and resumes only its own queue after the matching conversation has rendered.
The first submission from a blank conversation migrates that same queue to its new
conversation ID and clears the blank-conversation backup.

The extension service worker stores metadata and bounded file chunks in its own
IndexedDB (`ready-ai-followups`), independent of ChatGPT storage. A full page reload
restores the queue paused for delivery review. Reinjection captures live state before
resetting globals, removes old event listeners and retains the same File objects.
Incomplete restoration must never overwrite a complete backup. Late asynchronous
send results cannot remove items from a different conversation.
Each restoration has its own sequence, so returning A -> B -> A cannot make an
older attachment load current again or unlock an unfinished newer restoration.
Restoration keeps the current visit's session token instead of adopting the saved
token; a send from an earlier visit cannot become current again on return.
Panel open/closed state participates in the persistence signature.
An older service worker accepts a newer compatible content build instead of
repeatedly reinjecting it. Compatibility handshake versions remain stable.

Response completion requires the new assistant turn's finalized UI; elapsed time,
an existing Pro response or a cleared composer cannot acknowledge a new queued send.
Only the confirmed item ID is removed, even if the user reorders during dispatch.

The popup's `지금 사용하기` / `지금 사용 안 하기` control uses `readyAiEnabled`.
Turning it off stops monitoring, UI, notifications and automatic dispatch while
preserving sessions, and pauses queues in every remembered conversation. Turning
it on preserves the pause on existing queued work.
Closing a tab deletes every conversation's metadata and file chunks for that tab.
