import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import piInsert from "../extensions/index.ts";

test("/insert uses the native summary/submenu flow and keeps the 64 KiB limit advisory", async () => {
  let command;
  let sent;
  const editors = [
    "héllo",
    "second file",
    "x".repeat(64 * 1024),
    "y".repeat(64 * 1024 + 1),
    "remove me",
    undefined,
    "Compare them.",
  ];
  const inputs = ["", "failed build", "", "large log", ""];
  const steps = [
    () => "Add more",
    (options) => options.find((option) => option.startsWith("2. text-2.txt")),
    (options) => options.find((option) => option.startsWith("Mode: Embed")),
    () => "Edit label",
    () => undefined,
    () => "Add more",
    () => "Add more",
    (options) => options.find((option) => option.startsWith("4. text-4.txt")),
    (options) => options.find((option) => option === "Mode: Reference (recommended)"),
    () => undefined,
    () => "Add more",
    (options) => options.find((option) => option.startsWith("5. text-5.txt")),
    () => "Remove",
    () => "Continue",
    () => "Continue",
  ];
  const menus = [];

  piInsert({
    registerCommand(_name, definition) {
      command = definition;
    },
    sendUserMessage(message) {
      sent = message;
    },
  });

  await command.handler("", {
    ui: {
      editor: async (title, initial) => {
        if (title === "Pi insert - label for text-2.txt (optional)") {
          assert.equal(initial, "failed build");
          return "updated build";
        }
        return editors.shift();
      },
      input: async () => inputs.shift(),
      select: async (_title, options) => {
        menus.push(options);
        return steps.shift()(options);
      },
      notify() {},
    },
  });

  const paths = [...sent.matchAll(/^Path: "(.+\/text-\d+\.txt)"$/gm)].map((match) => match[1]);

  try {
    assert.deepEqual(paths.map((path) => path.match(/text-\d+\.txt$/)[0]), ["text-1.txt", "text-2.txt", "text-3.txt", "text-4.txt"]);
    assert.equal(await readFile(paths[0], "utf8"), "héllo");
    assert.equal(await readFile(paths[1], "utf8"), "second file");
    assert.equal((await readFile(paths[2], "utf8")).length, 64 * 1024);
    assert.equal((await readFile(paths[3], "utf8")).length, 64 * 1024 + 1);
    await assert.rejects(access(join(dirname(paths[0]), "text-5.txt")));

    assert.match(sent, /Referenced text file 2:\nLabel: "updated build"/);
    assert.doesNotMatch(sent, /--- BEGIN INCLUDED TEXT FILE 2 ---/);
    assert.match(sent, /Included text file 3:/);
    assert.match(sent, /x{100}/);
    assert.match(sent, /Included text file 4:\nLabel: "large log"/);
    assert.match(sent, /y{100}/);
    assert.ok(sent.endsWith("Compare them."));

    assert.ok(menus.some((options) => options[0] === "Add more" && options[1] === "Continue"));
    assert.ok(menus.some((options) => options.includes("Mode: Reference (recommended)")));
    assert.ok(menus.some((options) => options.includes("Edit label")));
    assert.ok(menus.some((options) => options.includes("Remove")));
    assert.ok(menus.every((options) => !options.includes("Cancel") && !options.includes("Set label") && !options.includes("Remove last")));
  } finally {
    if (paths[0]) await rm(dirname(paths[0]), { recursive: true, force: true });
  }
});
