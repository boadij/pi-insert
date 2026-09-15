import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import piInsert from "../extensions/index.ts";

test("/insert sends Pi-style file framing with byte counts and labels", async () => {
  let command;
  const pastes = [];
  const editors = [
    "héllo",
    undefined,
    "second file",
    "x".repeat(64 * 1024),
    "y".repeat(64 * 1024 + 1),
    "remove me",
  ];
  const inputs = ["", "faield build", "failed build", "", "large log", "large log"];
  const steps = [
    () => "Add more",
    (options) => options.find((option) => option.startsWith("2. failed-build.txt")),
    (options) => options.find((option) => option.startsWith("Mode: Embed")),
    () => "Edit label",
    () => undefined,
    () => "Add more",
    () => "Add more",
    (options) => options.find((option) => option.startsWith("4. large-log.txt")),
    (options) => options.find((option) => option === "Mode: Reference (recommended)"),
    () => undefined,
    () => "Add more",
    (options) => options.find((option) => option.startsWith("5. large-log-2.txt")),
    () => "Remove",
    () => "Continue",
  ];
  const menus = [];
  const statuses = [];
  const contentTitles = [];
  const labelPrompts = [];

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
        if (title === "Pi insert - label for failed-build.txt (optional)") {
          assert.equal(initial, "failed build");
          return 'Updated "Build" & <auth>';
        }
        contentTitles.push(title);
        return editors.shift();
      },
      input: async (title, placeholder) => {
        labelPrompts.push({ title, placeholder });
        return inputs.shift();
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
  const tags = [...prepared.matchAll(/<file name="([^"]+\.txt)" bytes="(\d+)"(?: label="([^"]*)")?(?: \/>|>)/g)];
  const paths = tags.map((match) => match[1]);

  try {
    assert.deepEqual(contentTitles, [
      "Pi insert - text-1.txt",
      "Pi insert - faield-build.txt",
      "Pi insert - failed-build.txt",
      "Pi insert - text-3.txt",
      "Pi insert - large-log.txt",
      "Pi insert - large-log-2.txt",
    ]);
    assert.deepEqual(labelPrompts, [
      { title: "Pi insert - label (optional)", placeholder: "Press Enter for text-1.txt" },
      { title: "Pi insert - label (optional)", placeholder: "Press Enter for text-2.txt" },
      { title: "Pi insert - label (optional)", placeholder: "Press Enter for text-2.txt" },
      { title: "Pi insert - label (optional)", placeholder: "Press Enter for text-3.txt" },
      { title: "Pi insert - label (optional)", placeholder: "Press Enter for text-4.txt" },
      { title: "Pi insert - label (optional)", placeholder: "Press Enter for text-5.txt" },
    ]);
    assert.equal(pastes[1], "\n");
    assert.deepEqual(paths.map((path) => basename(path)), ["text-1.txt", "updated-build-auth.txt", "text-3.txt", "large-log.txt"]);
    assert.deepEqual(tags.map((match) => Number(match[2])), [6, 11, 64 * 1024, 64 * 1024 + 1]);
    assert.deepEqual(tags.map((match) => match[3]), [
      undefined,
      "Updated &quot;Build&quot; &amp; &lt;auth>",
      undefined,
      "large log",
    ]);
    assert.equal(await readFile(paths[0], "utf8"), "héllo");
    assert.equal(await readFile(paths[1], "utf8"), "second file");
    assert.equal((await readFile(paths[2], "utf8")).length, 64 * 1024);
    assert.equal((await readFile(paths[3], "utf8")).length, 64 * 1024 + 1);
    await assert.rejects(access(join(dirname(paths[0]), "failed-build.txt")));
    await assert.rejects(access(join(dirname(paths[0]), "large-log-2.txt")));

    assert.ok(prepared.includes(`<file name="${paths[0]}" bytes="6">\nhéllo\n</file>`));
    assert.ok(prepared.includes(`<file name="${paths[1]}" bytes="11" label="Updated &quot;Build&quot; &amp; &lt;auth>" />`));
    assert.doesNotMatch(prepared, /second file/);
    assert.ok(prepared.includes(`<file name="${paths[2]}" bytes="${64 * 1024}">\n${"x".repeat(100)}`));
    assert.ok(prepared.includes(`<file name="${paths[3]}" bytes="${64 * 1024 + 1}" label="large log">\n${"y".repeat(100)}`));
    assert.doesNotMatch(prepared, /Included text file|Referenced text file|Label:|Path:|--- BEGIN INCLUDED TEXT FILE/);
    assert.ok(prepared.endsWith("Compare them."));
    assert.ok(contentTitles.every((title) => title !== "Pi insert - message (optional)"));

    assert.ok(menus.some((options) => options[0] === "Add more" && options[1] === "Continue"));
    assert.ok(menus.some((options) => options.includes("Mode: Reference (recommended)")));
    assert.ok(menus.some((options) => options.includes("Edit label")));
    assert.ok(menus.some((options) => options.includes("Remove")));
    assert.ok(menus.every((options) => !options.includes("Cancel") && !options.includes("Set label") && !options.includes("Remove last")));
  } finally {
    if (paths[0]) await rm(dirname(paths[0]), { recursive: true, force: true });
  }
});
