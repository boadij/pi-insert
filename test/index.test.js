import test from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import piInsert from "../extensions/index.ts";

test("/insert writes multiple files and sends one embedded user message", async () => {
  let command;
  let sent;
  const editors = ["héllo", "second file", "Compare them."];
  const choices = ["Add more", "Continue"];

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
      select: async () => choices.shift(),
      notify() {},
    },
  });

  const paths = [...sent.matchAll(/^"(.+\/text-\d+\.txt)"$/gm)].map((match) => match[1]);

  try {
    assert.equal(paths.length, 2);
    assert.equal(await readFile(paths[0], "utf8"), "héllo");
    assert.equal(await readFile(paths[1], "utf8"), "second file");
    assert.match(sent, /\(6 bytes\)/);
    assert.match(sent, /--- BEGIN INCLUDED TEXT FILE 2 ---/);
    assert.ok(sent.endsWith("Compare them."));
  } finally {
    if (paths[0]) await rm(dirname(paths[0]), { recursive: true, force: true });
  }
});
