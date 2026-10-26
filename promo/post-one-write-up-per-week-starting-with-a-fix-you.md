Where it goes: week 1 post for dev.to, r/LaTeX or r/GradSchool (adapt the title to the place). Repeat weekly with a new demo, and open an awesome-mcp-servers pull request in the same spirit.

Title: Fix your thesis .bib in 2 minutes (free, runs on your machine)

I got tired of fixing my thesis `.bib` by hand the night before the deadline. Duplicate entries from my reference manager, messy cite keys, titles that LaTeX turns lower case, and a DOI pasted with `https://doi.org/` in front. So I built a small MCP server that does the boring part.

It works on text you paste in. No account, no API key, no internet, and it never edits your files. The checks are done by code, not by the AI guessing, so you get the same result every time.

Here is the 2 minute version.

1. Install it. You need Node.js 20 or newer:

```bash
npx -y bibtex-reference-manager-mcp
```

To let your AI app start it for you, add it to the MCP config. In Claude Code that is:

```bash
claude mcp add bibtex -- npx -y bibtex-reference-manager-mcp
```

The README has the config for Claude Desktop, Cursor and VS Code Copilot too.

2. Export your library from Zotero or Mendeley as BibTeX and copy everything in the file.

3. Paste it into the chat and ask:

"Lint this list and tell me what is broken, entry by entry. Then remove the duplicates and give me clean BibTeX with tidy cite keys."

What it checks: missing required fields, bad page ranges, uncapitalized titles, invalid DOIs, odd years and repeated keys. It finds duplicates by DOI, by the same cite key and by similar titles, and says which copy to keep. New keys look like `smith2024deep`.

4. Copy the result back into your `.bib` file and compile.

It also converts between BibTeX, RIS and CSL JSON, so an EndNote RIS export can become BibTeX the same way.

It is free and open source (MIT). If a file breaks it, tell me which entry and I will fix it. The error messages name the entry, field and line, so a bug report is easy.

npm: https://www.npmjs.com/package/bibtex-reference-manager-mcp

Next week: turning an EndNote RIS export into BibTeX.
