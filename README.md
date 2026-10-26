# BibTeX Reference Manager MCP

[![npm](https://img.shields.io/npm/v/bibtex-reference-manager-mcp.svg)](https://www.npmjs.com/package/bibtex-reference-manager-mcp)
[![downloads](https://img.shields.io/npm/dm/bibtex-reference-manager-mcp.svg)](https://www.npmjs.com/package/bibtex-reference-manager-mcp)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

BibTeX Reference Manager MCP is a free, open source [MCP](https://modelcontextprotocol.io) server, published on npm as `bibtex-reference-manager-mcp`. It cleans, converts, dedupes and formats BibTeX, RIS and CSL JSON reference lists, so you stop fixing broken `.bib` files by hand. Paste a list into your AI app and ask it to read the entries, convert them to another format, find the duplicates, flag the problems or give every entry a tidy cite key.

It is made with students in mind. Writing a thesis in LaTeX? Ask it to fix a broken `.bib` file, clean up a Zotero export or a Mendeley export, turn an EndNote RIS file into BibTeX, and tidy your thesis bibliography before you hand it in.

Use it with Claude Desktop, Claude Code, Cursor, VS Code Copilot and any other app that supports MCP. It runs on your computer, needs no internet and no login, and your references never leave your machine.

Free forever. No account and no subscription.

## Install

Run it straight from npm with `npx`. You need Node.js 20 or newer, see [Node version](#node-version) for the details. There is nothing else to install, no account, no API key and no config file for the server itself.

```bash
npx -y bibtex-reference-manager-mcp
```

Add it to your AI app's MCP config so the app can start it for you:

- [Claude Desktop](#claude-desktop)
- [Claude Code](#claude-code)
- [Cursor](#cursor)
- [VS Code Copilot](#vs-code-copilot)

All of them start the same server the same way. The only difference is where the config goes.

### Claude Desktop

Add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bibtex": {
      "command": "npx",
      "args": ["-y", "bibtex-reference-manager-mcp"]
    }
  }
}
```

Restart Claude Desktop after you save the file.

### Claude Code

Run this in a terminal:

```bash
claude mcp add bibtex -- npx -y bibtex-reference-manager-mcp
```

### Cursor

Cursor reads `.cursor/mcp.json` from the project folder, or `~/.cursor/mcp.json` in your home folder if you want the server in every project.

```json
{
  "mcpServers": {
    "bibtex": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "bibtex-reference-manager-mcp"]
    }
  }
}
```

### VS Code Copilot

Add this to `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "bibtex": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "bibtex-reference-manager-mcp"]
    }
  }
}
```

## Try these prompts

Paste your reference list into the chat first, or attach the file, then ask:

1. "Here is my references.bib. Lint it and tell me what is broken, entry by entry."
2. "Find the duplicates in this list and give me back a clean BibTeX file without them."
3. "Convert these RIS entries from my library export to BibTeX, then rename the keys so they look like smith2024deep."

## Tools

| Tool | What it does |
| --- | --- |
| `parse_bibliography` | Reads BibTeX, RIS or CSL JSON text and returns normalized entries: lower case field names, tidy spacing, bare DOIs, the year filled in from a date, and authors split into "Family, Given". |
| `convert_bibliography` | Converts between BibTeX, RIS, CSL JSON and plain text. The input format is detected unless you pass `from`. Page ranges become `12--15` in BibTeX. |
| `dedupe_entries` | Finds duplicates by DOI, by the same cite key and by similar titles (the years must not clash). Says which entry to keep and returns a BibTeX list without the extra copies. |
| `lint_entries` | Flags missing required fields, bad page ranges, uncapitalized titles, invalid DOIs, odd years and repeated keys. |
| `generate_cite_keys` | Makes keys from the first author, the year and the first useful title word, like `smith2024deep`. Repeats get a letter, like `smith2024deepa`. |

Every tool takes the reference list as `text`, and every tool returns both a readable answer and structured fields. All of them are read only. They never change a file, because you paste the text in and get the result back.

### Formats

- BibTeX: `@string` macros, quoted and braced values, `#` joins, and `@comment` blocks are handled.
- RIS: the usual tags such as `TY`, `AU`, `TI`, `T2`, `PY`, `SP`, `EP`, `DO` and `KW`.
- CSL JSON: a list of items, one item, or an object with an `items` list.

## Privacy

Everything runs on your computer. The server reads only the text your AI app passes to it. It makes no network requests, does not look up DOIs online, needs no API key and keeps nothing between calls. DOI checks only look at the shape of the DOI, they do not ask a website whether it exists.

## FAQ

**Does it check that a DOI really exists?** No. It runs offline, so it only checks that the DOI has the right shape, like `10.1000/xyz123`.

**How does it decide two titles are the same?** It lowercases the titles, drops punctuation and accents, and compares pairs of letters. The default match is 0.9 out of 1. Pass `title_threshold` to loosen or tighten that. Two entries with different years are not matched by title.

**Will it change my protected capitals like `{DNA}`?** No. Braces are kept in BibTeX output and only removed when you convert to RIS, CSL JSON or plain text.

## Node version

You need Node.js 20 or newer to run the server. To work on it, use Node.js 22.12 or newer.

## Development

```bash
npm install
npm run build
npm test
```

The code is in `src`. `src/bib.ts` reads and writes the formats, `src/analyze.ts` finds duplicates and lint problems, and `src/tools.ts` defines the five tools.

## License

MIT, see [LICENSE](LICENSE).
