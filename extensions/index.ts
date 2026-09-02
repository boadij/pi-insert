import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function formatIncludedFile(path: string, text: string, index: number): string {
  const number = index + 1;
  const bytes = Buffer.byteLength(text, "utf8");

  return [
    `Included text file ${number}:`,
    JSON.stringify(path),
    `(${bytes} bytes)`,
    "",
    `--- BEGIN INCLUDED TEXT FILE ${number} ---`,
    "",
    text,
    "",
    `--- END INCLUDED TEXT FILE ${number} ---`,
  ].join("\n");
}

export default function piInsert(pi: ExtensionAPI) {
  pi.registerCommand("insert", {
    description: "Paste long text into temporary files and include it in a message",
    handler: async (args, ctx) => {
      const files: Array<{ path: string; text: string }> = [];
      let dir: string | undefined;

      try {
        while (true) {
          const text = await ctx.ui.editor(`Pi insert - text ${files.length + 1}`, "");
          if (text === undefined) return;
          if (text.length === 0) {
            ctx.ui.notify("Nothing to insert.", "warning");
            return;
          }

          dir ??= await mkdtemp(join(tmpdir(), "pi-insert-"));
          const path = join(dir, `text-${files.length + 1}.txt`);
          await writeFile(path, text, "utf8");
          files.push({ path, text });

          const next = await ctx.ui.select(
            `${files.length} text file${files.length === 1 ? "" : "s"} added`,
            ["Add more", "Continue", "Cancel"],
          );

          if (next === "Add more") continue;
          if (next !== "Continue") return;
          break;
        }

        const message = await ctx.ui.editor("Pi insert - message (optional)", (args ?? "").trim());
        if (message === undefined) return;

        const included = files.map(({ path, text }, index) => formatIncludedFile(path, text, index));
        const prompt = [...included, ...(message.trim() ? [message] : [])].join("\n\n");

        pi.sendUserMessage(prompt);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}
