# Pi insert

**Paste large text into Pi without filling your prompt editor with it.**

Pi insert adds one command:

```text
/insert
```

Paste one or more text blocks. After each paste, Pi insert asks for an optional short label; press Enter to skip it. Labels become readable temporary filenames; unlabeled blocks keep the `text-N.txt` fallback. Each block is shown in a compact native summary.

```text
Pi insert - 3 text files

Add more
Continue
1. successful-build.txt   8.3 KiB  Embed      "successful build"
2. failed-build.txt       21.4 KiB  Reference  "failed build"
3. text-3.txt             72.4 KiB  Reference  recommended
```

`Add more` is the first selection. Select a file row to open its controls:

```text
failed-build.txt

Mode: Reference
Edit label
Remove
```

Selecting the mode toggles between **Embed** and **Reference**. Files up to 64 KiB default to Embed; larger files default to Reference as a recommendation, but either mode can always be selected manually.

- **Embed** sends the path, byte size, optional label, and full contents.
- **Reference** sends only the path, byte size, and optional label, so the agent can decide whether to `read`, `grep`, diff, or parse the temporary file.

Editing a label renames its temporary file too. Duplicate labels get `-2`, `-3`, and so on. Removing a file deletes that temporary file. Remove is only offered when another file would remain.

Press Esc from the summary to cancel `/insert`. Esc from a file submenu returns to the summary. Esc from the label prompt immediately after a paste returns to that text editor with the pasted text preserved. Esc from the final optional message editor returns to the summary.

## Example

An embedded file becomes:

```text
Included text file 1:
Label: "successful build"
Path: "/tmp/pi-insert-AbCd12/successful-build.txt"
Size: 8529 bytes

--- BEGIN INCLUDED TEXT FILE 1 ---

...your pasted text...

--- END INCLUDED TEXT FILE 1 ---
```

A referenced file stays compact:

```text
Referenced text file 2:
Label: "failed build"
Path: "/tmp/pi-insert-AbCd12/failed-build.txt"
Size: 74231 bytes
```

After the summary, Pi insert opens one optional message editor for instructions such as:

```text
Compare these logs and explain why the second run fails.
```

Everything is sent as one user message.

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
