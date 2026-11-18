# Plain-text manuscript import

## Sources and behavior

A source-first search of the retained `pocketjs_flutter_demo` parent, excluding `pocket_host/`, found no DOCX, XLSX, PDF, or visual-novel manuscript converter. The retained parent's `mini_apps/app_ui_showcase/main.js` provides general input and overlay behavior. The current SDK's `authoring.ts` and `interchange.ts`, and the Editor's `novel-authoring.js` and `novel.js`, already provide the canonical StoryDefinition, drafts, persistent history, and build pipeline. This feature adds a conversion from plain-text files to that document and reuses the existing story interpreter.

**Import manuscript** (导入手稿) in the Editor toolbar reads a UTF-8 `.txt` file. **Add to draft** (加入草稿) becomes available after the preview opens. Each nonempty line becomes one `say` and retains its source line number for review.

- `【Mira】不要把回声当成答案。` and `[Mira] Don't mistake an echo for an answer.` explicitly identify the speaker.
- `Mira：对白` or `Mira: dialogue` also identifies Mira when the current story already defines that speaker.
- The importer retains unrecognized colon-prefixed lines verbatim and displays a note. It leaves character creation to the author. A time such as `23:08` and a URL are kept as text.
- Unprefixed lines become narration, and empty lines are ignored. Each nonempty line is handled independently, with no Word layout recovery or automatic joining of wrapped lines.

Import adds a label without overwriting existing ones and keeps the original entry point by default. The author can select a new entry point in the preview. IDs use a prefix and sequence number, skipping existing line IDs. Authors can create scenes, branches, and endings in the existing Editor. Interpolation such as `{{variable}}` uses the existing engine semantics.

## Ablation and data boundaries

The public JS SDK's `parseNovelManuscript` is a pure function reused by the Editor browser runtime. Its output is the existing `say` AST, with no separate manuscript format to maintain. Adding to the draft uses the existing `historyMutation`, preserving undo, redo, reopening unsaved drafts, and normal saving without a separate import state machine. Cancellation, duplicate labels, invalid encoding, and parse errors leave the story untouched. Async file reads and preview application both check the existing draft version to prevent stale results from being applied.

Files must be valid UTF-8 and at most 2 MiB. The pure function limits input to 1,000,000 UTF-16 units, 5,000 nonempty lines, and 16,000 units per line. If parsing fails or reaches a limit, it returns no partial chapter. The preview uses a read-only text control and treats HTML or JS in the manuscript as text.

## Execution evidence and remaining scope

Asynchronous history checks also use the existing `historyBusy` gate. Import is disabled during the check and an already open preview cannot submit. A real keyboard regression added on 2026-11-07 presses Ctrl+Z in the preview and delays the server's history-head response. Submission must be rejected during the delay. Once the response is released, only the original undo runs, and redo restores only the original chapter. This regression and the SDK and pinned Guest flows passed three tests in 6.44 seconds. The final public SDK integration log is `/tmp/pocket-manuscript-import-race-integrated.log`.

On 2026-11-07, two SDK tests and the real Chromium Editor flow passed, for three tests total. See `/tmp/pocket-manuscript-import-final.log`. The browser verified source-line and speaker previews, cancellation, duplicate-label rejection, adding to the draft, reopening unsaved drafts, undo and redo, saving and reopening, and strict UTF-8 rejection. The test used the Editor's pinned `buildGuest` to build real QJBC, then clicked Start with native pointer input and observed the imported text being drawn. It used a temporary project and port and shut them down afterward. The normal Demo's Editor backend was never started.

Run `bun test packages/pocket_vn/test/manuscript.test.ts editor/test/novel_manuscript_browser.test.ts` from `sdk` with matching `POCKET_TOOLS_PACKAGE` and `POCKET_NATIVE_PROBE` settings.

I01 gains evidence for plain-text import and its review workflow only. Excel, Word, and text-based PDF parsing and field mapping are still unimplemented. Renaming a text file's extension does not add support for those formats.
