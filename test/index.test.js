import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import piInsert from "../extensions/index.ts";

test("/insert sends Pi-style file framing with byte counts and labels", async () => {
  let command;
  const pastes = [];
  const exactPrefix = "##### Large log\n";
  const exact =
    exactPrefix +
    "x".repeat(64 * 1024 - Buffer.byteLength(exactPrefix));
  const overPrefix = "intro\n\n### Large log ###\n";
  const over =
    overPrefix +
    "y".repeat(
      64 * 1024 +
        1 -
        Buffer.byteLength(overPrefix),
    );
  const longLabel = "A".repeat(90);
  const truncated = `# ${longLabel}\nbody`;
  const editorTexts = [
    "Failed build\nsecond file",
    "Introduction before the useful title.\n\n```sh\n# not the title\n```\n\n##### Actual title\nbody that must stay out",
    exact,
    over,
    truncated,
    "remove me",
  ];
  const editorResults = [editorTexts[0], undefined, ...editorTexts.slice(1)];
  const labelEditResults = ['Updated "Build" & <auth>', "   "];
  const labelEditInitials = [];
  const steps = [
    (options) => options.find((option) => option.startsWith("1. failed-build.md")),
    () => "Edit label",
    () => undefined,
    () => "Add more",
    () => "Add more",
    (options) => options.find((option) => option.startsWith("2. actual-title.md")),
    () => "Edit label",
    (options) => options.find((option) => option === "Mode: Embed"),
    () => undefined,
    () => "Add more",
    () => "Add more",
    (options) => options.find((option) => option.startsWith("3. large-log.md")),
    (options) => options.find((option) => option === "Mode: Embed"),
    () => undefined,
    (options) =>
      options.find((option) => option.startsWith("4. large-log-2.md")),
    (options) =>
      options.find((option) => option === "Mode: Reference (recommended)"),
    () => undefined,
    () => "Add more",
    () => "Add more",
    (options) => options.find((option) => option.startsWith("6. remove-me.md")),
    () => "Remove",
    () => "Continue",
  ];
  const menus = [];
  const statuses = [];
  const contentTitles = [];

  piInsert({
    registerCommand(_name, definition) {
      command = definition;
    },
    sendUserMessage() {
      assert.fail("pi-insert must not submit directly");
    },
  });

  await command.handler("Compare them.", {
    ui: {
      editor: async (title, initial) => {
        if (title.startsWith("Pi insert - label for ")) {
          labelEditInitials.push(initial);
          return labelEditResults.shift();
        }
        contentTitles.push(title);
        return editorResults.shift();
      },
      select: async (_title, options) => {
        menus.push(options);
        return steps.shift()(options);
      },
      pasteToEditor(text) {
        pastes.push(text);
      },
      setStatus(key, text) {
        statuses.push([key, text]);
      },
      notify() {},
    },
    mode: "tui",
  });

  assert.equal(pastes.length, 2);
  assert.deepEqual(statuses, [
    ["pi-insert", "Preparing insert…"],
    ["pi-insert", undefined],
  ]);
  const prepared = pastes[0];
  const tags = [
    ...prepared.matchAll(
      /<file name="([^"]+\.md)" bytes="(\d+)"(?: label="([^"]*)")?(?: \/>|>)/g,
    ),
  ];
  const paths = tags.map((match) => match[1]);
  const truncatedLabel = `${"A".repeat(79)}…`;

  try {
    assert.deepEqual(contentTitles, [
      "Pi insert - text-1.md",
      "Pi insert - text-2.md",
      "Pi insert - text-2.md",
      "Pi insert - text-3.md",
      "Pi insert - text-4.md",
      "Pi insert - text-5.md",
      "Pi insert - text-6.md",
    ]);
    assert.equal(pastes[1], "\n");
    assert.deepEqual(
      paths.map((path) => basename(path)),
      [
        "updated-build-auth.md",
        "text-2.md",
        "large-log.md",
        "large-log-2.md",
        `${"a".repeat(48)}.md`,
      ],
    );
    assert.deepEqual(
      tags.map((match) => Number(match[2])),
      [
        Buffer.byteLength(editorTexts[0]),
        Buffer.byteLength(editorTexts[1]),
        64 * 1024,
        64 * 1024 + 1,
        Buffer.byteLength(editorTexts[4]),
      ],
    );
    assert.deepEqual(
      tags.map((match) => match[3]),
      [
        "Updated &quot;Build&quot; &amp; &lt;auth>",
        undefined,
        "Large log",
        "Large log",
        truncatedLabel,
      ],
    );
    assert.equal([...tags[4][3]].length, 80);
    assert.ok(tags[4][3].endsWith("…"));
    assert.equal(await readFile(paths[0], "utf8"), editorTexts[0]);
    assert.equal(await readFile(paths[1], "utf8"), editorTexts[1]);
    assert.equal((await readFile(paths[2], "utf8")).length, 64 * 1024);
    assert.equal((await readFile(paths[3], "utf8")).length, 64 * 1024 + 1);
    assert.equal(await readFile(paths[4], "utf8"), editorTexts[4]);
    await assert.rejects(access(join(dirname(paths[0]), "failed-build.md")));
    await assert.rejects(access(join(dirname(paths[0]), "actual-title.md")));
    await assert.rejects(access(join(dirname(paths[0]), "remove-me.md")));
    assert.deepEqual(labelEditInitials, ["Failed build", "Actual title"]);

    assert.ok(
      prepared.includes(
        `<file name="${paths[0]}" bytes="${Buffer.byteLength(editorTexts[0])}" label="Updated &quot;Build&quot; &amp; &lt;auth>">\n${editorTexts[0]}\n</file>`,
      ),
    );
    assert.ok(
      prepared.includes(
        `<file name="${paths[1]}" bytes="${Buffer.byteLength(editorTexts[1])}" />`,
      ),
    );
    assert.doesNotMatch(prepared, /body that must stay out/);
    assert.ok(
      prepared.includes(
        `<file name="${paths[2]}" bytes="${64 * 1024}" label="Large log" />`,
      ),
    );
    assert.ok(
      prepared.includes(
        `<file name="${paths[3]}" bytes="${64 * 1024 + 1}" label="Large log">\n${over.slice(0, 100)}`,
      ),
    );
    assert.ok(
      prepared.includes(
        `<file name="${paths[4]}" bytes="${Buffer.byteLength(editorTexts[4])}" label="${truncatedLabel}">\n${editorTexts[4]}\n</file>`,
      ),
    );
    assert.doesNotMatch(
      prepared,
      /Included text file|Referenced text file|Label:|Path:|--- BEGIN INCLUDED TEXT FILE/,
    );
    assert.ok(prepared.endsWith("Compare them."));
    assert.ok(
      contentTitles.every(
        (title) => title !== "Pi insert - message (optional)",
      ),
    );

    assert.ok(
      menus.some(
        (options) => options[0] === "Add more" && options[1] === "Continue",
      ),
    );
    assert.ok(
      menus.some((options) =>
        options.includes("Mode: Reference (recommended)"),
      ),
    );
    assert.ok(menus.some((options) => options.includes("Edit label")));
    assert.ok(menus.some((options) => options.includes("Remove")));
    assert.ok(
      menus.every(
        (options) =>
          !options.includes("Cancel") &&
          !options.includes("Set label") &&
          !options.includes("Remove last"),
      ),
    );
  } finally {
    if (paths[0]) await rm(dirname(paths[0]), { recursive: true, force: true });
  }
});
