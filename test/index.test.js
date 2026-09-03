import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import piInsert from "../extensions/index.ts";

test("/insert queues during compaction and flushes after Pi leaves the compaction callback", async () => {
  let command;
  const sent = [];
  const handlers = {};
  const notices = [];
  let insideCompactionCallback = false;
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
    on(type, handler) {
      handlers[type] = handler;
    },
    registerCommand(_name, definition) {
      command = definition;
    },
    sendUserMessage(message, options) {
      assert.equal(insideCompactionCallback, false);
      assert.deepEqual(options, { deliverAs: "steer" });
      sent.push(message);
    },
  });

  handlers.session_before_compact();

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
      notify(message, level) {
        notices.push([message, level]);
      },
    },
  });

  assert.equal(sent.length, 0);
  assert.deepEqual(notices.at(-1), ["Queued for after compaction.", "info"]);

  insideCompactionCallback = true;
  handlers.session_compact();
  insideCompactionCallback = false;
  await new Promise(setImmediate);

  assert.equal(sent.length, 1);
  const prompt = sent[0];
  const paths = [...prompt.matchAll(/^Path: "(.+\/text-\d+\.txt)"$/gm)].map((match) => match[1]);

  try {
    assert.deepEqual(paths.map((path) => path.match(/text-\d+\.txt$/)[0]), ["text-1.txt", "text-2.txt", "text-3.txt", "text-4.txt"]);
    assert.equal(await readFile(paths[0], "utf8"), "héllo");
    assert.equal(await readFile(paths[1], "utf8"), "second file");
    assert.equal((await readFile(paths[2], "utf8")).length, 64 * 1024);
    assert.equal((await readFile(paths[3], "utf8")).length, 64 * 1024 + 1);
    await assert.rejects(access(join(dirname(paths[0]), "text-5.txt")));

    assert.match(prompt, /Referenced text file 2:\nLabel: "updated build"/);
    assert.doesNotMatch(prompt, /--- BEGIN INCLUDED TEXT FILE 2 ---/);
    assert.match(prompt, /Included text file 3:/);
    assert.match(prompt, /x{100}/);
    assert.match(prompt, /Included text file 4:\nLabel: "large log"/);
    assert.match(prompt, /y{100}/);
    assert.ok(prompt.endsWith("Compare them."));

    assert.ok(menus.some((options) => options[0] === "Add more" && options[1] === "Continue"));
    assert.ok(menus.some((options) => options.includes("Mode: Reference (recommended)")));
    assert.ok(menus.some((options) => options.includes("Edit label")));
    assert.ok(menus.some((options) => options.includes("Remove")));
    assert.ok(menus.every((options) => !options.includes("Cancel") && !options.includes("Set label") && !options.includes("Remove last")));
  } finally {
    if (paths[0]) await rm(dirname(paths[0]), { recursive: true, force: true });
  }
});
