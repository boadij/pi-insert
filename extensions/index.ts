import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mkdtemp, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EMBED_LIMIT = 64 * 1024;

type InsertFile = {
  number: number;
  name: string;
  path: string;
  bytes: number;
  embed: boolean;
  label?: string;
};

function filenameFor(label: string | undefined, number: number, files: InsertFile[], current?: InsertFile): string {
  const stem = label
    ? [...label.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "")]
        .slice(0, 48)
        .join("")
        .replace(/-+$/, "")
    : "";
  const base = stem || `text-${number}`;

  for (let suffix = 1; ; suffix++) {
    const name = `${base}${suffix === 1 ? "" : `-${suffix}`}.txt`;
    if (!files.some((file) => file !== current && file.name === name)) return name;
  }
}

function xmlAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll("\n", "&#10;")
    .replaceAll("\r", "&#13;")
    .replaceAll("\t", "&#9;");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

async function formatFile(file: InsertFile): Promise<string> {
  const tag = `<file name="${xmlAttr(file.path)}" bytes="${file.bytes}"${file.label ? ` label="${xmlAttr(file.label)}"` : ""}`;
  if (!file.embed) return `${tag} />`;
  return `${tag}>\n${await readFile(file.path, "utf8")}\n</file>`;
}

export default function piInsert(pi: ExtensionAPI) {
  pi.registerCommand("insert", {
    description: "Paste text into temporary files and insert or reference them in a message",
    handler: async (args, ctx) => {
      const files: InsertFile[] = [];
      let dir: string | undefined;
      let nextNumber = 1;

      const addFile = async (emptyMessage: string) => {
        const number = nextNumber;
        const fallbackName = `text-${number}.txt`;
        let text = "";

        while (true) {
          const edited = await ctx.ui.editor(`Pi insert - ${fallbackName}`, text);
          if (edited === undefined) return false;
          if (edited.length === 0) {
            ctx.ui.notify(emptyMessage, "warning");
            return false;
          }
          text = edited;

          const label = await ctx.ui.input(`Pi insert - label for ${fallbackName} (optional)`, "Press Enter to skip");
          if (label === undefined) continue;

          const cleanLabel = label.trim() || undefined;
          const name = filenameFor(cleanLabel, number, files);
          dir ??= await mkdtemp(join(tmpdir(), "pi-insert-"));
          const path = join(dir, name);
          const bytes = Buffer.byteLength(text, "utf8");
          await writeFile(path, text, "utf8");
          files.push({ number, name, path, bytes, embed: bytes <= EMBED_LIMIT, label: cleanLabel });
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
            pi.sendUserMessage([...inserted, ...(message.trim() ? [message] : [])].join("\n\n"));
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
              if (label !== undefined) {
                const cleanLabel = label.trim() || undefined;
                const name = filenameFor(cleanLabel, file.number, files, file);
                if (name !== file.name) {
                  const path = join(dir!, name);
                  await rename(file.path, path);
                  file.name = name;
                  file.path = path;
                }
                file.label = cleanLabel;
              }
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
