# pi-clipboard-tools

> **Disclaimer:** This extension is vibe coded for personal use. Use at your own risk.

Copy code blocks and previous prompts from [Pi](https://pi.dev) exactly as written,
without the terminal's visual line wrapping.

## Why

- Copying from the terminal also copies its visual line wrapping, so pasted commands break or behave differently.
- Reusing a long earlier prompt means scrolling back and selecting it by hand.

## Features

- `/copy-command`: copy the last shell code block from the assistant.
- `/copy-code`: copy the last code block in any language.
- `/copy-input`: copy your last prompt, even after the assistant has replied.
- Copies the original conversation text and **never runs it**.

## Installation

Requires **Pi 0.87.1+** and **Node.js 24+**.

```sh
pi install git:github.com/shardrunner/pi-clipboard-tools
```

Run `/reload` in open Pi sessions. Update with `pi update --extensions`.
For local development, install a checkout instead
(`pi install /absolute/path/to/pi-clipboard-tools`) or try it once with
`pi -e /absolute/path/to/pi-clipboard-tools`. No runtime dependencies, no build step.

## Usage

| Command         | Copies                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------- |
| `/copy-command` | The last complete code block labelled `bash`, `sh`, `zsh` or `shell` from the assistant   |
| `/copy-code`    | The last complete code block from the assistant in any language, unlabelled ones included |
| `/copy-input`   | The text of your last message, with line breaks and whitespace kept; images are left out  |

All commands only look at the current session branch. Code blocks are copied in full,
including several commands and intentional line breaks, without the fence or the final
newline. A closing fence must use the same marker (backticks or tildes) and be at least
as long as the opening one:

````markdown
```bash
printf '%s\n' 'hello world'
```
````

Review a copied command before you paste it into a shell.

## Behavior and limitations

- Inline code, tool output, incomplete fences and abandoned branches are ignored.
  If nothing matches, the clipboard is left unchanged.
- The commands only work in the interactive TUI. Print, JSON and RPC calls are
  rejected before the clipboard is touched.
- Copying goes through Pi's built-in `copyToClipboard`. Clipboard errors appear as
  notifications. Pi can't confirm remote OSC 52 writes, and the terminal may block them.
- The extension can't tell a visually wrapped line from a real newline written by the
  model. Ask for shell-fenced code and check what you paste.

## Development

```sh
npm ci --ignore-scripts
npm run check
```

Requires Node.js 24+. `check` runs strict TypeScript checking and the test suite.

## License

[MIT](LICENSE) © 2026 Michael Brunner
