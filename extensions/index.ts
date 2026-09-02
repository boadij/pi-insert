import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EMBED_LIMIT = 64 * 1024;

type InsertFile = {
  path: string;
  text: string;
  bytes: number;
  embed: boolean;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function formatFile(file: InsertFile, index: number): string {
  const number = index + 1;
  const metadata = [
    `${file.embed ? "Included" : "Referenced"} text file ${number}:`,
    JSON.stringify(file.path),
    `(${file.bytes} bytes)`,
  ];

  if (!file.embed) return metadata.join("\n");

  return [
    ...metadata,
    "",
    `--- BEGIN INCLUDED TEXT FILE ${number} ---`,
    "",
    file.text,
    "",
    `--- END INCLUDED TEXT FILE ${number} ---`,
  ].join("\n");
}

export default function piInsert(pi: ExtensionAPI) {
  pi.registerCommand("insert", {
    description: "Paste text into temporary files and insert or reference them in a message",
    handler: async (args, ctx) => {
      const files: InsertFile[] = [];
      let dir: string | undefined;

      const addText = async (text: string) => {
        dir ??= await mkdtemp(join(tmpdir(), "pi-insert-"));
        const path = join(dir, `text-${files.length + 1}.txt`);
        const bytes = Buffer.byteLength(text, "utf8");
        await writeFile(path, text, "utf8");
        files.push({ path, text, bytes, embed: bytes <= EMBED_LIMIT });
      };

      try {
        const first = await ctx.ui.editor("Pi insert - text 1", "");
        if (first === undefined) return;
        if (first.length === 0) {
          ctx.ui.notify("Nothing to insert.", "warning");
          return;
        }
        await addText(first);

        while (true) {
          const rows = files.map((file, index) => {
            const locked = file.bytes > EMBED_LIMIT ? " (>64 KiB)" : "";
            return `${index + 1}. text-${index + 1}.txt  ${formatSize(file.bytes)}  ${file.embed ? "Embed" : "Reference"}${locked}`;
          });
          const choice = await ctx.ui.select(
            `Pi insert - ${files.length} text file${files.length === 1 ? "" : "s"}`,
            [...rows, "Add more", "Continue", "Cancel"],
          );

          const fileIndex = choice ? rows.indexOf(choice) : -1;
          if (fileIndex >= 0) {
            const file = files[fileIndex];
            if (file.bytes > EMBED_LIMIT) {
              ctx.ui.notify("Files over 64 KiB are reference-only.", "info");
            } else {
              file.embed = !file.embed;
            }
            continue;
          }

          if (choice === "Add more") {
            const text = await ctx.ui.editor(`Pi insert - text ${files.length + 1}`, "");
            if (text === undefined) continue;
            if (text.length === 0) {
              ctx.ui.notify("Nothing added.", "warning");
              continue;
            }
            await addText(text);
            continue;
          }

          if (choice !== "Continue") return;

          const message = await ctx.ui.editor("Pi insert - message (optional)", (args ?? "").trim());
          if (message === undefined) continue;

          const inserted = files.map(formatFile);
          const prompt = [...inserted, ...(message.trim() ? [message] : [])].join("\n\n");
          pi.sendUserMessage(prompt);
          return;
        }
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}
