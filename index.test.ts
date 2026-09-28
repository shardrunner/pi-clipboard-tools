import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { lastCodeBlock, lastShellBlock, lastUserInput, register } from "./index.ts";

const assistant = (text: string) => ({
  type: "message", message: { role: "assistant", content: [{ type: "text", text }] },
});

test("copies the last shell fence on the active branch, without reflowing its contents", async () => {
  let copied = "";
  const notices: string[] = [];
  let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
  register({ registerCommand: (name: string, command: { handler: typeof handler }) => { if (name === "copy-command") handler = command.handler; } } as ExtensionAPI,
    async (text) => { copied = text; });
  const branch = [
    assistant("```bash\nold\n```"),
    assistant("```python\nnot a shell command\n```\n```sh\nprintf '%s' \\\n  'hello world'\n```"),
  ];
  assert.ok(handler);
  await handler("", { mode: "tui", sessionManager: { getBranch: () => branch }, ui: { notify: (s: string) => notices.push(s) } });
  assert.equal(copied, "printf '%s' \\\n  'hello world'");
  assert.match(notices[0], /Copied/);
});

test("copy-code copies the last complete assistant fence, including unlabelled blocks", async () => {
  let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
  let copied: string | undefined;
  const notices: Array<[string, string]> = [];
  register({ registerCommand: (name: string, command: { handler: typeof handler }) => {
    if (name === "copy-code") handler = command.handler;
  } } as ExtensionAPI, async (text) => { copied = text; });
  const branch = [
    assistant("```bash\necho old\n```"),
    { type: "message", message: { role: "user", content: "```python\nnot this\n```" } },
    assistant("```python\nprint('hello')\n```\n~~~\nline one\n  line two\n~~~\n```js\nunfinished"),
  ];
  assert.equal(lastCodeBlock(branch), "line one\n  line two");
  assert.ok(handler);
  await handler("", { sessionManager: { getBranch: () => branch }, ui: { notify: (s: string, type: string) => notices.push([s, type]) } });
  assert.equal(copied, "line one\n  line two");
  assert.deepEqual(notices, [["Copied code block to clipboard.", "info"]]);
});

test("copy-code leaves the clipboard alone without a complete block", async () => {
  let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
  let copied = false;
  const notices: Array<[string, string]> = [];
  register({ registerCommand: (name: string, command: { handler: typeof handler }) => {
    if (name === "copy-code") handler = command.handler;
  } } as ExtensionAPI, async () => { copied = true; });
  assert.ok(handler);
  await handler("", { sessionManager: { getBranch: () => [assistant("```python\nunfinished")] }, ui: { notify: (s: string, type: string) => notices.push([s, type]) } });
  assert.equal(copied, false);
  assert.deepEqual(notices, [["No code block found on this branch.", "warning"]]);
});

test("copy-code reports clipboard errors", async () => {
  let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
  const notices: Array<[string, string]> = [];
  register({ registerCommand: (name: string, command: { handler: typeof handler }) => {
    if (name === "copy-code") handler = command.handler;
  } } as ExtensionAPI, async () => { throw new Error("clipboard unavailable"); });
  assert.ok(handler);
  await handler("", { sessionManager: { getBranch: () => [assistant("```python\nprint(1)\n```")] }, ui: { notify: (s: string, type: string) => notices.push([s, type]) } });
  assert.deepEqual(notices, [["Could not copy code: clipboard unavailable", "error"]]);
});

test("copies the last user input on the active branch, preserving multiline text", async () => {
  const handlers = new Map<string, (args: string, ctx: any) => Promise<void>>();
  let copied: string | undefined;
  const notices: Array<[string, string]> = [];
  register({ registerCommand: (name: string, command: { handler: (args: string, ctx: any) => Promise<void> }) => {
    handlers.set(name, command.handler);
  } } as ExtensionAPI, async (text) => { copied = text; });
  assert.ok(handlers.has("copy-command"));
  assert.ok(handlers.has("copy-input"));
  const branch = [
    { type: "message", message: { role: "user", content: "old input" } },
    assistant("response"),
    { type: "message", message: { role: "user", content: [{ type: "text", text: "first line\n" }, { type: "image", data: "abc" }, { type: "text", text: "second line  " }] } },
    assistant("later response"),
  ];
  await handlers.get("copy-input")!("", { sessionManager: { getBranch: () => branch }, ui: { notify: (s: string, type: string) => notices.push([s, type]) } });
  assert.equal(copied, "first line\nsecond line  ");
  assert.deepEqual(notices, [["Copied user input to clipboard.", "info"]]);
});

test("copy-input does not copy older input when the latest user message has no text", async () => {
  let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
  let copied = false;
  const notices: Array<[string, string]> = [];
  register({ registerCommand: (name: string, command: { handler: typeof handler }) => {
    if (name === "copy-input") handler = command.handler;
  } } as ExtensionAPI, async () => { copied = true; });
  const branch = [
    { type: "message", message: { role: "user", content: "old input" } },
    { type: "message", message: { role: "user", content: [{ type: "image", data: "abc" }] } },
  ];
  assert.equal(lastUserInput(branch), undefined);
  assert.ok(handler);
  await handler("", { sessionManager: { getBranch: () => branch }, ui: { notify: (s: string, type: string) => notices.push([s, type]) } });
  assert.equal(copied, false);
  assert.deepEqual(notices, [["No text in the last user input on this branch.", "warning"]]);
});

test("copy-input reports clipboard errors", async () => {
  let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
  const notices: Array<[string, string]> = [];
  register({ registerCommand: (name: string, command: { handler: typeof handler }) => {
    if (name === "copy-input") handler = command.handler;
  } } as ExtensionAPI, async () => { throw new Error("clipboard unavailable"); });
  assert.ok(handler);
  await handler("", { sessionManager: { getBranch: () => [{ type: "message", message: { role: "user", content: "hello" } }] }, ui: { notify: (s: string, type: string) => notices.push([s, type]) } });
  assert.deepEqual(notices, [["Could not copy input: clipboard unavailable", "error"]]);
});

test("ignores untagged, non-shell, incomplete, and non-assistant text", () => {
  const entries = [
    assistant("```bash\necho safe\n```"),
    { type: "message", message: { role: "toolResult", content: [{ type: "text", text: "```bash\necho wrong\n```" }] } },
    assistant("```\necho unknown\n```\n```python\nprint('wrong')\n```\n```bash\nunfinished"),
  ];
  assert.equal(lastShellBlock(entries), "echo safe");
  assert.equal(lastShellBlock([assistant("`echo inline`")] ), undefined);
});

test("reports missing commands without replacing the clipboard", async () => {
  let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
  let copied = false;
  const notices: string[] = [];
  register({ registerCommand: (name: string, command: { handler: typeof handler }) => { if (name === "copy-command") handler = command.handler; } } as ExtensionAPI,
    async () => { copied = true; });
  assert.ok(handler);
  await handler("", { mode: "tui", sessionManager: { getBranch: () => [assistant("No commands here.")] }, ui: { notify: (s: string) => notices.push(s) } });
  assert.equal(copied, false);
  assert.match(notices[0], /No shell code block/);
});

test("clipboard failures are visible", async () => {
  let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
  const notices: Array<[string, string]> = [];
  register({ registerCommand: (name: string, command: { handler: typeof handler }) => { if (name === "copy-command") handler = command.handler; } } as ExtensionAPI,
    async () => { throw new Error("clipboard unavailable"); });
  assert.ok(handler);
  await handler("", { mode: "tui", sessionManager: { getBranch: () => [assistant("```bash\necho ok\n```")] }, ui: { notify: (s: string, type: string) => notices.push([s, type]) } });
  assert.deepEqual(notices, [["Could not copy command: clipboard unavailable", "error"]]);
});
