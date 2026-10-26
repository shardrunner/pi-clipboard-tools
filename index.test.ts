import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { lastCodeBlock, lastShellBlock, lastUserInput, register } from "./index.ts";

const assistant = (text: string) => ({
  type: "message", message: { role: "assistant", content: [{ type: "text", text }] },
});

function commandFixture(copy: (text: string) => Promise<void>) {
  type Handler = Parameters<ExtensionAPI["registerCommand"]>[1]["handler"];
  const handlers = new Map<string, Handler>();
  const notices: Array<[string, string]> = [];
  register({ registerCommand: (name: string, command: { handler: Handler }) => {
    handlers.set(name, command.handler);
  } } as ExtensionAPI, copy);

  return {
    handlers,
    notices,
    async run(name: string, branch: readonly unknown[], mode = "tui") {
      const handler = handlers.get(name);
      assert.ok(handler, `Command ${name} was not registered`);
      // Stub only the context fields these commands use.
      await handler("", {
        mode,
        hasUI: mode === "tui" || mode === "rpc",
        sessionManager: { getBranch: () => branch },
        ui: { notify: (message: string, type: string) => notices.push([message, type]) },
      } as unknown as Parameters<Handler>[1]);
    },
  };
}

test("copies the last shell fence on the active branch, without reflowing its contents", async () => {
  let copied = "";
  const { run, notices } = commandFixture(async (text) => { copied = text; });
  const branch = [
    assistant("```bash\nold\n```"),
    assistant("```python\nnot a shell command\n```\n```sh\nprintf '%s' \\\n  'hello world'\n```"),
  ];
  await run("copy-command", branch);
  assert.equal(copied, "printf '%s' \\\n  'hello world'");
  assert.match(notices[0][0], /Copied/);
});

test("copy-code copies the last complete assistant fence, including unlabelled blocks", async () => {
  let copied: string | undefined;
  const { run, notices } = commandFixture(async (text) => { copied = text; });
  const branch = [
    assistant("```bash\necho old\n```"),
    { type: "message", message: { role: "user", content: "```python\nnot this\n```" } },
    assistant("```python\nprint('hello')\n```\n~~~\nline one\n  line two\n~~~\n```js\nunfinished"),
  ];
  assert.equal(lastCodeBlock(branch), "line one\n  line two");
  await run("copy-code", branch);
  assert.equal(copied, "line one\n  line two");
  assert.deepEqual(notices, [["Copied code block to clipboard.", "info"]]);
});

test("copies blocks closed by longer matching fences", async () => {
  for (const marker of ["`", "~"]) {
    const text = `${marker.repeat(3)}bash\necho safe\n  echo kept\n${marker.repeat(5)}`;
    const branch = [assistant(text)];
    const expected = "echo safe\n  echo kept";
    const copied: string[] = [];
    const { run } = commandFixture(async (value) => { copied.push(value); });
    assert.equal(lastShellBlock(branch), expected);
    assert.equal(lastCodeBlock(branch), expected);
    await run("copy-command", branch);
    await run("copy-code", branch);
    assert.deepEqual(copied, [expected, expected]);
  }
});

test("rejects closing fences that are shorter or mix marker characters", () => {
  for (const marker of ["`", "~"]) {
    const other = marker === "`" ? "~" : "`";
    for (const closing of [marker.repeat(3), marker.repeat(4) + other]) {
      const branch = [assistant(`${marker.repeat(4)}bash\necho incomplete\n${closing}`)];
      assert.equal(lastShellBlock(branch), undefined);
      assert.equal(lastCodeBlock(branch), undefined);
    }
  }
});

test("does not copy nested shell examples from a non-shell fence with a longer close", () => {
  const nested = "```bash\necho example\n```";
  const branch = [
    assistant("```sh\necho safe\n```"),
    assistant(`\`\`\`\`markdown\n${nested}\n\`\`\`\`\``),
  ];
  assert.equal(lastShellBlock(branch), "echo safe");
  assert.equal(lastCodeBlock(branch), nested);
});

test("copy-code leaves the clipboard alone without a complete block", async () => {
  let copied = false;
  const { run, notices } = commandFixture(async () => { copied = true; });
  await run("copy-code", [assistant("```python\nunfinished")]);
  assert.equal(copied, false);
  assert.deepEqual(notices, [["No code block found on this branch.", "warning"]]);
});

test("copy-code reports clipboard errors", async () => {
  const { run, notices } = commandFixture(async () => { throw new Error("clipboard unavailable"); });
  await run("copy-code", [assistant("```python\nprint(1)\n```")]);
  assert.deepEqual(notices, [["Could not copy code: clipboard unavailable", "error"]]);
});

test("copies the last user input on the active branch, preserving multiline text", async () => {
  let copied: string | undefined;
  const { handlers, run, notices } = commandFixture(async (text) => { copied = text; });
  assert.ok(handlers.has("copy-command"));
  assert.ok(handlers.has("copy-input"));
  const branch = [
    { type: "message", message: { role: "user", content: "old input" } },
    assistant("response"),
    { type: "message", message: { role: "user", content: [{ type: "text", text: "first line\n" }, { type: "image", data: "abc" }, { type: "text", text: "second line  " }] } },
    assistant("later response"),
  ];
  await run("copy-input", branch);
  assert.equal(copied, "first line\nsecond line  ");
  assert.deepEqual(notices, [["Copied user input to clipboard.", "info"]]);
});

test("copy-input does not copy older input when the latest user message has no text", async () => {
  let copied = false;
  const { run, notices } = commandFixture(async () => { copied = true; });
  const branch = [
    { type: "message", message: { role: "user", content: "old input" } },
    { type: "message", message: { role: "user", content: [{ type: "image", data: "abc" }] } },
  ];
  assert.equal(lastUserInput(branch), undefined);
  await run("copy-input", branch);
  assert.equal(copied, false);
  assert.deepEqual(notices, [["No text in the last user input on this branch.", "warning"]]);
});

test("copy-input reports clipboard errors", async () => {
  const { run, notices } = commandFixture(async () => { throw new Error("clipboard unavailable"); });
  await run("copy-input", [{ type: "message", message: { role: "user", content: "hello" } }]);
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
  let copied = false;
  const { run, notices } = commandFixture(async () => { copied = true; });
  await run("copy-command", [assistant("No commands here.")]);
  assert.equal(copied, false);
  assert.match(notices[0][0], /No shell code block/);
});

test("all copy commands reject non-TUI modes without clipboard or UI writes", async () => {
  let copies = 0;
  const { run, notices } = commandFixture(async () => { copies++; });
  const branch = [
    assistant("```bash\necho safe\n```"),
    { type: "message", message: { role: "user", content: "user input" } },
  ];
  for (const mode of ["print", "json", "rpc"]) {
    for (const name of ["copy-command", "copy-code", "copy-input"]) {
      await assert.rejects(run(name, branch, mode), /only available in TUI mode/);
    }
  }
  assert.equal(copies, 0);
  assert.deepEqual(notices, []);
});

test("clipboard failures are visible", async () => {
  const { run, notices } = commandFixture(async () => { throw new Error("clipboard unavailable"); });
  await run("copy-command", [assistant("```bash\necho ok\n```")]);
  assert.deepEqual(notices, [["Could not copy command: clipboard unavailable", "error"]]);
});
