# Changelog

## 0.1.1

- The README now has a Common workflows section showing how the five tools work together in a typical thesis or cleaning workflow.

- The README now has a competitor comparison table showing how it differs from servers that connect to online accounts or web APIs.

- The README and llms.txt now have a Why this server section and steps for exporting a Zotero or Mendeley library to .bib or RIS and pasting it in.

- The README intro, the npm description and the npm keywords now use the words students search for, such as LaTeX, Zotero export, Mendeley export, EndNote RIS, thesis bibliography and fix .bib file.

- BibTeX and RIS parse errors now name the entry, the field and the line that failed, for example an unclosed brace, an unclosed quote, an entry that is never closed, or a RIS record without a TY line. Before, the parser guessed and returned a damaged entry.

## 0.1.0

- First release of BibTeX Reference Manager MCP.
- Added `parse_bibliography`, which reads BibTeX, RIS or CSL JSON and returns normalized entries.
- Added `convert_bibliography`, which converts between BibTeX, RIS, CSL JSON and plain text.
- Added `dedupe_entries`, which finds duplicates by DOI, cite key and title similarity.
- Added `lint_entries`, which flags missing fields, bad page ranges, uncapitalized titles and invalid DOIs.
- Added `generate_cite_keys`, which makes keys like smith2024deep.
