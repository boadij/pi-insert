# Pi insert

**Paste large text into Pi without filling your prompt editor with it.**

Pi insert adds one command:

```text
/insert
```

Paste one or more text blocks. Pi insert saves each block as a temporary `.txt` file, shows a compact summary, and lets you choose whether Pi receives the full contents or only the file reference.

```text
Pi insert - 3 text files

1. text-1.txt   8.3 KiB   Embed      "successful build"
2. text-2.txt  21.4 KiB   Reference  "failed build"
3. text-3.txt  72.4 KiB   Reference (>64 KiB)

Add more
Set label
Remove last
Continue
Cancel
```

Select a file row to switch between **Embed** and **Reference**. Files larger than 64 KiB are reference-only. **Set label** adds or edits an optional short description for any file; submitting an empty label clears it. Use **Remove last** to discard the most recently added file.

- **Embed** sends the path, byte size, optional label, and full contents.
- **Reference** sends only the path, byte size, and optional label, so the agent can decide whether to `read`, `grep`, diff, or parse the temporary file.

Every file up to 64 KiB defaults to Embed. Larger files automatically use Reference, keeping oversized pastes out of the model context.

Press Esc while adding another text, choosing a label, or writing the final message to return to the summary without losing what you already added.

## Example

An embedded file becomes:

```text
Included text file 1:
Path: "/tmp/pi-insert-AbCd12/text-1.txt"
Size: 8529 bytes

--- BEGIN INCLUDED TEXT FILE 1 ---

...your pasted text...

--- END INCLUDED TEXT FILE 1 ---
```

A labeled referenced file stays compact:

```text
Referenced text file 2:
Label: "failed build"
Path: "/tmp/pi-insert-AbCd12/text-2.txt"
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
