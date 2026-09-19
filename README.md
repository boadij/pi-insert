# Pi insert

**Paste large text into Pi without filling your prompt editor with it.**

Pi insert adds one command:

```text
/insert
```

Paste one or more text blocks. For each text block, `/insert` opens the content editor immediately. Pi insert derives a short label from the first Markdown ATX heading (# through ######) when present, otherwise from the first non-empty line, and uses that label for the temporary filename. Each block is shown in a compact native summary.

```text
/insert → content → summary
```

```text
Pi insert - 3 text files

Add more
Continue
1. successful-build.md   8.3 KiB  Embed      "successful build"
2. failed-build.md       21.4 KiB  Reference  "failed build"
3. text-3.md             72.4 KiB  Reference  recommended
```

`Add more` is the first selection. Select a file row to open its controls:

```text
failed-build.md

Mode: Reference
Edit label
Remove
```

Selecting the mode toggles between **Embed** and **Reference**. Files up to 64 KiB default to Embed; larger files default to Reference as a recommendation, but either mode can always be selected manually.

- **Embed** uses Pi-style `<file>` framing with the path, raw byte count, optional exact label, and full contents.
- **Reference** uses the same framing as a self-closing tag, so the agent gets the path, byte count, and optional exact label without the contents and can decide whether to `read`, `grep`, diff, or parse the temporary file.

To correct a label, select a file in the summary and choose `Edit label`. Editing a label renames its temporary file too. Duplicate labels get `-2`, `-3`, and so on. Removing a file deletes that temporary file. Remove is only offered when another file would remain.

Press Esc from the summary to cancel `/insert`. Esc from a file submenu returns to the summary. If no files have been added yet, `/insert` exits; otherwise you return to the summary.

## Example

An embedded file follows Pi's native file framing, with `bytes` added as explicit metadata:

```xml
<file name="/tmp/pi-insert-AbCd12/successful-build.md" bytes="8529" label="successful build">
...your pasted text...
</file>
```

A referenced file stays compact:

```xml
<file name="/tmp/pi-insert-AbCd12/failed-build.md" bytes="74231" label="failed build" />
```

`bytes` is the raw UTF-8 byte count. When present, `label` preserves the exact human label even when the generated filename is normalized, truncated, or deduplicated.

Selecting `Continue` prepares the files in Pi's normal input editor instead of submitting them immediately. Large prepared content uses Pi's native collapsed paste display, so it may appear as a compact `[paste #…]` marker.

- Continue prepares the content in Pi's editor with the cursor ready on the following line for additional instructions.

Add or edit your instructions in the normal Pi editor, then press Enter when you are ready to send. Text supplied after `/insert` is appended to the prepared file payload.

For example:

```text
Compare these logs and explain why the second run fails.
```

## Install

From npm:

```sh
pi install npm:pi-insert
```

From GitHub:

```sh
pi install git:github.com/boadij/pi-insert
```

For a one-off local test from this repository:

```sh
pi -e ./extensions/index.ts
```

## Temporary files

Pi insert deliberately leaves cleanup to the operating system's temporary-directory policy. It does not add persistence, configuration, indexing, MIME detection, or a custom UI.

## Requirements

A current version of [Pi](https://pi.dev) with extension commands and native extension UI support.

## Development

The extension is TypeScript, loaded directly by Pi. There are no runtime dependencies and no build step.

```sh
npm test
npm pack --dry-run
```

## License

Apache-2.0
