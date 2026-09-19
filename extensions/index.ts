import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mkdtemp, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EMBED_LIMIT = 64 * 1024;
const AUTO_LABEL_LIMIT = 80;

type InsertFile = {
  number: number;
  name: string;
  path: string;
  bytes: number;
  embed: boolean;
  label?: string;
};

function filenameFor(
  label: string | undefined,
  number: number,
  files: InsertFile[],
  current?: InsertFile,
): string {
  const stem = label
    ? [
        ...label
          .normalize("NFKC")
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, "-")
          .replace(/^-+|-+$/g, ""),
      ]
        .slice(0, 48)
        .join("")
        .replace(/-+$/, "")
    : "";
  const base = stem || `text-${number}`;

  for (let suffix = 1; ; suffix++) {
    const name = `${base}${suffix === 1 ? "" : `-${suffix}`}.md`;
    if (!files.some((file) => file !== current && file.name === name))
      return name;
  }
}

function labelFor(text: string): string | undefined {
  const lines = text.split(/\r\n?|\n/);
  let fallback: string | undefined;
  let fence: { marker: "`" | "~"; length: number } | undefined;
  let label: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    if (
      !fallback &&
      trimmed &&
      !/^(`{3,}|~{3,})/.test(trimmed)
    ) {
      fallback = trimmed;
    }

    if (fence) {
      const closing = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);

      if (
        closing &&
        closing[1][0] === fence.marker &&
        closing[1].length >= fence.length
      ) {
        fence = undefined;
      }

      continue;
    }

    const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);

    if (
      opening &&
      (opening[1][0] === "~" || !opening[2].includes("`"))
    ) {
      fence = {
        marker: opening[1][0] as "`" | "~",
        length: opening[1].length,
      };
      continue;
    }

    const heading = line.match(
      /^ {0,3}#{1,6}(?:[ \t]+|$)(.*)$/,
    );

    if (!heading) continue;

    const candidate = heading[1]
      .replace(/[ \t]+#+[ \t]*$/, "")
      .trim();

    if (candidate) {
      label = candidate;
      break;
    }
  }

  label ??= fallback;
  if (!label) return;

  const chars = [...label];

  return chars.length > AUTO_LABEL_LIMIT
    ? `${chars
        .slice(0, AUTO_LABEL_LIMIT - 1)
        .join("")
        .trimEnd()}…`
    : label;
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
    description:
      "Paste text into temporary files and prepare them in the input editor",
    handler: async (args, ctx) => {
      const files: InsertFile[] = [];
      let dir: string | undefined;
      let nextNumber = 1;

      const addFile = async (emptyMessage: string) => {
        const number = nextNumber;
        const fallbackName = `text-${number}.md`;
        const text = await ctx.ui.editor(`Pi insert - ${fallbackName}`, "");

        if (text === undefined) return false;

        if (text.length === 0) {
          ctx.ui.notify(emptyMessage, "warning");
          return false;
        }

        const label = labelFor(text);
        const name = filenameFor(label, number, files);

        dir ??= await mkdtemp(join(tmpdir(), "pi-insert-"));
        const path = join(dir, name);
        const bytes = Buffer.byteLength(text, "utf8");
        await writeFile(path, text, "utf8");
        files.push({
          number,
          name,
          path,
          bytes,
          embed: bytes <= EMBED_LIMIT,
          label,
        });
        nextNumber++;
        return true;
      };

      try {
        if (!(await addFile("Nothing to insert."))) return;

        while (true) {
          const sizes = files.map((file) => formatSize(file.bytes));
          const nameWidth = Math.max(...files.map((file) => file.name.length));
          const sizeWidth = Math.max(...sizes.map((size) => size.length));
          const rows = files.map((file, index) => {
            const mode = file.embed ? "Embed" : "Reference";
            const recommended =
              file.bytes > EMBED_LIMIT && !file.embed ? "  recommended" : "";
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
            ctx.ui.setStatus("pi-insert", "Preparing insert…");
            try {
              const message = (args ?? "").trim();
              const prompt = [
                ...(await Promise.all(files.map(formatFile))),
                ...(message ? [message] : []),
              ].join("\n\n");

              ctx.ui.pasteToEditor(prompt);
              if (ctx.mode === "tui") ctx.ui.pasteToEditor("\n");
              return;
            } finally {
              ctx.ui.setStatus("pi-insert", undefined);
            }
          }

          const index = rows.indexOf(choice);
          if (index < 0) continue;
          const file = files[index];

          while (files.includes(file)) {
            const mode = `Mode: ${file.embed ? "Embed" : "Reference"}${file.bytes > EMBED_LIMIT && !file.embed ? " (recommended)" : ""}`;
            const actions = [
              mode,
              "Edit label",
              ...(files.length > 1 ? ["Remove"] : []),
            ];
            const action = await ctx.ui.select(file.name, actions);

            if (action === undefined) break;
            if (action === mode) {
              file.embed = !file.embed;
              continue;
            }
            if (action === "Edit label") {
              const label = await ctx.ui.editor(
                `Pi insert - label for ${file.name} (optional)`,
                file.label ?? "",
              );
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
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          "error",
        );
      }
    },
  });
}
