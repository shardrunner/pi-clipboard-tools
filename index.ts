import { copyToClipboard, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const shellLanguages = new Set(["bash", "sh", "zsh", "shell"]);

/** Return the last complete assistant fence on the active branch. */
function lastBlock(entries: readonly unknown[], shellOnly: boolean): string | undefined {
  let latest: string | undefined;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || !("type" in entry) || entry.type !== "message" ||
        !("message" in entry) || !entry.message || typeof entry.message !== "object" ||
        !("role" in entry.message) || entry.message.role !== "assistant" ||
        !("content" in entry.message) || !Array.isArray(entry.message.content)) continue;

    for (const block of entry.message.content) {
      if (block?.type !== "text" || typeof block.text !== "string") continue;
      // Scan *all* fences, including non-shell ones, to avoid treating their contents as prose.
      // Capture the full opener without backtracking to a shorter run. A close
      // must use the same marker and be at least as long as that opener.
      const fence = /^ {0,3}((`|~)\2{2,})(?!\2)([^\r\n]*)\r?\n([\s\S]*?)^ {0,3}\1\2*[ \t]*(?:\r?\n|$)/gm;
      for (const match of block.text.matchAll(fence)) {
        if (shellOnly && !shellLanguages.has(match[3].trim().toLowerCase())) continue;
        const command = match[4].replace(/\r?\n$/, "");
        if (command.trim()) latest = command;
      }
    }
  }
  return latest;
}

export function lastCodeBlock(entries: readonly unknown[]): string | undefined {
  return lastBlock(entries, false);
}

/** Return the last complete, explicitly shell-labelled fence; never guess from prose. */
export function lastShellBlock(entries: readonly unknown[]): string | undefined {
  return lastBlock(entries, true);
}

export function lastUserInput(entries: readonly unknown[]): string | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!entry || typeof entry !== "object" || !("type" in entry) || entry.type !== "message" ||
        !("message" in entry) || !entry.message || typeof entry.message !== "object" ||
        !("role" in entry.message) || entry.message.role !== "user") continue;

    const content = "content" in entry.message ? entry.message.content : undefined;
    const text = typeof content === "string" ? content : Array.isArray(content)
      ? content.filter((block) => block?.type === "text" && typeof block.text === "string")
        .map((block) => block.text).join("")
      : "";
    return text.trim() ? text : undefined;
  }
  return undefined;
}

export function register(pi: ExtensionAPI, copy: (text: string) => Promise<void> = copyToClipboard): void {
  pi.registerCommand("copy-command", {
    description: "Copy the last assistant shell code block (bash/sh/zsh/shell) on this branch",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") throw new Error("/copy-command is only available in TUI mode.");
      const command = lastShellBlock(ctx.sessionManager.getBranch());
      if (!command) {
        ctx.ui.notify("No shell code block found on this branch.", "warning");
        return;
      }
      try {
        await copy(command);
        ctx.ui.notify("Copied shell code block to clipboard.", "info");
      } catch (error) {
        ctx.ui.notify(`Could not copy command: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });

  pi.registerCommand("copy-code", {
    description: "Copy the last assistant fenced code block on this branch",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") throw new Error("/copy-code is only available in TUI mode.");
      const code = lastCodeBlock(ctx.sessionManager.getBranch());
      if (!code) {
        ctx.ui.notify("No code block found on this branch.", "warning");
        return;
      }
      try {
        await copy(code);
        ctx.ui.notify("Copied code block to clipboard.", "info");
      } catch (error) {
        ctx.ui.notify(`Could not copy code: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });

  pi.registerCommand("copy-input", {
    description: "Copy the last user input on this branch",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") throw new Error("/copy-input is only available in TUI mode.");
      const input = lastUserInput(ctx.sessionManager.getBranch());
      if (!input) {
        ctx.ui.notify("No text in the last user input on this branch.", "warning");
        return;
      }
      try {
        await copy(input);
        ctx.ui.notify("Copied user input to clipboard.", "info");
      } catch (error) {
        ctx.ui.notify(`Could not copy input: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });
}

export default register;
