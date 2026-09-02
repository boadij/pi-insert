import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import piInsert from "../extensions/index.ts";

test("/insert handles labels, reference modes, the 64 KiB boundary, and removing the last file", async () => {
  let command;
  let sent;
  const editors = [
    "héllo",
    undefined,
    "second file",
    "x".repeat(64 * 1024),
    "y".repeat(64 * 1024 + 1),
    "remove me",
    undefined,
    "Compare them.",
  ];
  const inputs = ["failed build"];
  const choices = [
    "Add more",
    "Add more",
    "2. text-2.txt  11 B  Embed",
    "Set label",
    "2. text-2.txt  11 B  Reference",
    "Add more",
    "Add more",
    "Add more",
    "Remove last",
    "Continue",
    "Continue",
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
      editor: async () => editors.shift(),
      input: async () => inputs.shift(),
      select: async (_title, options) => {
        menus.push(options);
        return choices.shift();
      },
      notify() {},
    },
  });

  const paths = [...sent.matchAll(/^Path: "(.+\/text-\d+\.txt)"$/gm)].map((match) => match[1]);

  try {
    assert.equal(paths.length, 4);
    assert.equal(await readFile(paths[0], "utf8"), "héllo");
    assert.equal(await readFile(paths[1], "utf8"), "second file");
    assert.equal((await readFile(paths[2], "utf8")).length, 64 * 1024);
    assert.equal((await readFile(paths[3], "utf8")).length, 64 * 1024 + 1);
    await assert.rejects(access(join(dirname(paths[0]), "text-5.txt")));

    assert.match(sent, /Included text file 1:/);
    assert.match(sent, /Referenced text file 2:\nLabel: "failed build"/);
    assert.match(sent, /Included text file 3:/);
    assert.match(sent, /--- BEGIN INCLUDED TEXT FILE 3 ---/);
    assert.match(sent, /x{100}/);
    assert.match(sent, /Referenced text file 4:/);
    assert.doesNotMatch(sent, /--- BEGIN INCLUDED TEXT FILE 4 ---/);
    assert.doesNotMatch(sent, /y{100}/);
    assert.ok(sent.endsWith("Compare them."));

    assert.ok(menus.some((options) => options.includes("2. text-2.txt  11 B  Reference  \"failed build\"")));
    assert.ok(menus.some((options) => options.includes("3. text-3.txt  64.0 KiB  Embed")));
    assert.ok(menus.some((options) => options.includes("4. text-4.txt  64.0 KiB  Reference (>64 KiB)")));
    assert.ok(menus.some((options) => options.includes("Set label")));
    assert.ok(menus.some((options) => options.includes("Remove last")));
  } finally {
    if (paths[0]) await rm(dirname(paths[0]), { recursive: true, force: true });
  }
});
