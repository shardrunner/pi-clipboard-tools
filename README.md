# Clipboard tools

> **Disclaimer:** This extension is vibe coded for personal use. Use at your own risk.

Copy code and previous prompts from [Pi](https://pi.dev) without picking up the
terminal's visual line wrapping. Commands copy the original conversation text;
they never execute it.

## Use

Run `/copy-command` in Pi to copy the **last complete shell-fenced code block** in an assistant message on the current session branch to the system clipboard. Pi copies the original text, not the visually wrapped terminal output. Paste it into a shell yourself after reviewing it; the extension never executes commands.

Supported fence labels: `bash`, `sh`, `zsh`, `shell`. Closing fences must use the
same marker (backticks or tildes) and be at least as long as the opening fence.
For example:

````markdown
```bash
printf '%s\n' 'hello world'
```
````

The entire block is copied (including any multiple commands and intentional internal newlines), without the fence or final formatting newline. Unlabelled blocks, inline code, tool output and abandoned session branches are ignored. If there is no matching block, your clipboard is left alone. Clipboard errors appear as notifications. All three commands require TUI mode; print, JSON, and RPC invocations are rejected before clipboard access.

Run `/copy-code` to copy the **last complete fenced code block** in an assistant message on the current session branch, regardless of language (including unlabelled fences). It preserves the block's internal newlines but omits the fence and final formatting newline. Inline code, tool output, incomplete fences and abandoned branches are ignored. If no block is found, the clipboard is left alone.

Run `/copy-input` to copy the text of the **last user message** on the current session branch, even after the assistant has responded. Multiline text and whitespace are preserved; image attachments are omitted. If the last user message contains no text (or there is no user message), the clipboard is left alone. Abandoned branches are ignored.

All three commands use Pi's built-in `copyToClipboard`, which handles the platform clipboard. Pi reports detectable clipboard failures; remote OSC 52 clipboard writes cannot be verified by Pi and may be blocked by the terminal. It cannot distinguish a visually wrapped line from a hard newline actually written by the model: use shell fences and review pasted commands.

## Install

Install from GitHub; Pi clones it and `pi update --extensions` keeps it current:

```sh
pi install git:github.com/shardrunner/pi-clipboard-tools
```

For development, register a local checkout instead:

```sh
pi install /absolute/path/to/pi-clipboard-tools
```

Pi loads a local package in place (no copy) and this package has no runtime
dependencies, so no `npm install` is needed to use it. Run `/reload` in existing
Pi instances. Try it once without installing via `pi -e /absolute/path/to/clipboard-tools`.

## Development

Run tests with `npm ci --ignore-scripts && npm run check` (Node 24+).
