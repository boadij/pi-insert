import test from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import piInsert from "../extensions/index.ts";

test("/insert embeds small files, references selected and oversized files, and keeps temp files", async () => {
  let command;
  let sent;
  const editors = ["héllo", undefined, "second file", "x".repeat(64 * 1024 + 1), undefined, "Compare them."];
  const choices = [
    "Add more",
    "Add more",
    "2. text-2.txt  11 B  Embed",
    "Add more",
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
      select: async (_title, options) => {
        menus.push(options);
        return choices.shift();
      },
      notify() {},
    },
  });

  const paths = [...sent.matchAll(/^"(.+\/text-\d+\.txt)"$/gm)].map((match) => match[1]);

  try {
    assert.equal(paths.length, 3);
    assert.equal(await readFile(paths[0], "utf8"), "héllo");
    assert.equal(await readFile(paths[1], "utf8"), "second file");
    assert.equal((await readFile(paths[2], "utf8")).length, 64 * 1024 + 1);

    assert.match(sent, /Included text file 1:/);
    assert.match(sent, /--- BEGIN INCLUDED TEXT FILE 1 ---/);
    assert.match(sent, /Referenced text file 2:/);
    assert.doesNotMatch(sent, /--- BEGIN INCLUDED TEXT FILE 2 ---/);
    assert.match(sent, /Referenced text file 3:/);
    assert.doesNotMatch(sent, /--- BEGIN INCLUDED TEXT FILE 3 ---/);
    assert.ok(sent.endsWith("Compare them."));
    assert.ok(sent.length < 10_000);

    assert.ok(menus.some((options) => options.includes("3. text-3.txt  64.0 KiB  Reference (>64 KiB)")));
  } finally {
    if (paths[0]) await rm(dirname(paths[0]), { recursive: true, force: true });
  }
});
