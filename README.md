# Pi insert

**Paste long text into Pi without turning your prompt editor into a wall of text.**

Pi insert adds one command:

```text
/insert
```

It opens Pi's native multiline editor, lets you paste one or more large text blocks, saves each one as a temporary `.txt` file, and sends a clean message containing both the file metadata and its full contents.

The agent gets the text immediately and also gets a real file path it can `read`, `grep`, diff, parse, or pass to another tool later.

## What it feels like

Run:

```text
/insert
```

Paste your first block of text. Then choose:

```text
Add more   Continue   Cancel
```

Add as many blocks as you need. When you continue, Pi insert gives you one final optional message editor for instructions such as:

```text
Compare these logs and explain why the second run fails.
```

Pi receives a single user message like:

```text
Included text file 1:
"/tmp/pi-insert-AbCd12/text-1.txt"
(8529 bytes)

--- BEGIN INCLUDED TEXT FILE 1 ---

...your pasted text...

--- END INCLUDED TEXT FILE 1 ---

Compare this log with the current implementation and find the root cause.
```

With multiple inserts, each text block gets its own numbered temporary file and boundary.

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

## Why a temporary file too?

Embedding the contents means the model can work with the text immediately. Keeping the original text in a real temporary file means the agent can later use normal filesystem tools against the exact same input without asking you to paste it again.

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

MIT
