import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EMBED_LIMIT = 64 * 1024;

type InsertFile = {
  name: string;
  path: string;
  bytes: number;
  embed: boolean;
  label?: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

async function formatFile(file: InsertFile, index: number): Promise<string> {
  const number = index + 1;
  const metadata = [
    `${file.embed ? "Included" : "Referenced"} text file ${number}:`,
    ...(file.label ? [`Label: ${JSON.stringify(file.label)}`] : []),
    `Path: ${JSON.stringify(file.path)}`,
    `Size: ${file.bytes} bytes`,
  ];

  if (!file.embed) return metadata.join("\n");

  return [
    ...metadata,
    "",
    `--- BEGIN INCLUDED TEXT FILE ${number} ---`,
    "",
    await readFile(file.path, "utf8"),
    "",
    `--- END INCLUDED TEXT FILE ${number} ---`,
  ].join("\n");
}

export default function piInsert(pi: ExtensionAPI) {
  let compacting = false;
  const queued: string[] = [];

  const finishCompaction = (isIdle: () => boolean) => {
    const finish = () => {
      if (!isIdle()) {
        setTimeout(finish, 25);
        return;
      }
      compacting = false;
      for (const prompt of queued.splice(0)) {
        pi.sendUserMessage(prompt, { deliverAs: "steer" });
      }
    };
    setTimeout(finish, 0);
  };

  pi.on("session_before_compact", () => {
    compacting = true;
  });
  pi.on("session_compact", (_event, ctx) => {
    finishCompaction(() => ctx.isIdle());
  });
  pi.on("session_compact_failed", (_event, ctx) => {
    finishCompaction(() => ctx.isIdle());
  });

  pi.registerCommand("insert", {
    description: "Paste text into temporary files and insert or reference them in a message",
    handler: async (args, ctx) => {
      const files: InsertFile[] = [];
      let dir: string | undefined;
      let nextNumber = 1;

      const addFile = async (emptyMessage: string) => {
        const name = `text-${nextNumber}.txt`;
        let text = "";

        while (true) {
          const edited = await ctx.ui.editor(`Pi insert - ${name}`, text);
          if (edited === undefined) return false;
          if (edited.length === 0) {
            ctx.ui.notify(emptyMessage, "warning");
            return false;
          }
          text = edited;

          const label = await ctx.ui.input(`Pi insert - label for ${name} (optional)`, "Press Enter to skip");
          if (label === undefined) continue;

          dir ??= await mkdtemp(join(tmpdir(), "pi-insert-"));
          const path = join(dir, name);
          const bytes = Buffer.byteLength(text, "utf8");
          await writeFile(path, text, "utf8");
          files.push({ name, path, bytes, embed: bytes <= EMBED_LIMIT, label: label.trim() || undefined });
          nextNumber++;
          return true;
        }
      };

      try {
        if (!(await addFile("Nothing to insert."))) return;

        while (true) {
          const sizes = files.map((file) => formatSize(file.bytes));
          const nameWidth = Math.max(...files.map((file) => file.name.length));
          const sizeWidth = Math.max(...sizes.map((size) => size.length));
          const rows = files.map((file, index) => {
            const mode = file.embed ? "Embed" : "Reference";
            const recommended = file.bytes > EMBED_LIMIT && !file.embed ? "  recommended" : "";
            const label = file.label ? `  ${JSON.stringify(file.label)}` : "";
            return `${index + 1}. ${file.name.padEnd(nameWidth)}  ${sizes[index].padStart(sizeWidth)}  ${mode.padEnd(9)}${recommended}${label}`;
          });
          const choice = await ctx.ui.select(
            `Pi insert - ${files.length} text file${files.length === 1 ? "" : "s"}`,
            ["Add more", "Continue", ...rows],
          );

          if (choice === undefined) return;
          if (choice === "Add more") {
            await addFile("Nothing added.");
            continue;
          }
          if (choice === "Continue") {
            const message = await ctx.ui.editor("Pi insert - message (optional)", (args ?? "").trim());
            if (message === undefined) continue;

            const inserted = await Promise.all(files.map(formatFile));
            const prompt = [...inserted, ...(message.trim() ? [message] : [])].join("\n\n");
            if (compacting) {
              queued.push(prompt);
              ctx.ui.notify("Queued for after compaction.", "info");
            } else {
              pi.sendUserMessage(prompt, { deliverAs: "steer" });
            }
            return;
          }

          const index = rows.indexOf(choice);
          if (index < 0) continue;
          const file = files[index];

          while (files.includes(file)) {
            const mode = `Mode: ${file.embed ? "Embed" : "Reference"}${file.bytes > EMBED_LIMIT && !file.embed ? " (recommended)" : ""}`;
            const actions = [mode, "Edit label", ...(files.length > 1 ? ["Remove"] : [])];
            const action = await ctx.ui.select(file.name, actions);

            if (action === undefined) break;
            if (action === mode) {
              file.embed = !file.embed;
              continue;
            }
            if (action === "Edit label") {
              const label = await ctx.ui.editor(`Pi insert - label for ${file.name} (optional)`, file.label ?? "");
              if (label !== undefined) file.label = label.trim() || undefined;
              continue;
            }
            if (action === "Remove") {
              await unlink(file.path);
              files.splice(files.indexOf(file), 1);
            }
          }
        }
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}
