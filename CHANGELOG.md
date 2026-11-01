# Changelog

## Unreleased

- `convert_bibliography` now accepts `chicago` and `harvard` for `style`, next to `apa`, `mla` and `ieee`. Chicago is the bibliography form with the author first. The existing styles are unchanged.

- `fix_entries` now wraps acronyms like DNA, NASA and iOS in braces, as in `{DNA}`, when it fixes the capitalization of a title, so BibTeX styles keep their case. The new `protected_titles` list shows which words were wrapped. The existing output is unchanged.

- `dedupe_entries` takes an optional `merge_duplicates`. When true, the result has a `merged` list that shows the fields only the removed copies had (like doi or pages) next to the kept entry. The existing output is unchanged.

- When the format cannot be detected, the error now lists the accepted formats with a small BibTeX, RIS and CSL JSON example, and says so when the text is only a list of DOIs or URLs.

## 0.1.2

- Added `fix_entries`, which applies the safe fixes from `lint_entries` (double hyphen page ranges, capitalized titles, bare DOIs) and returns the cleaned BibTeX with a list of each change.

- `convert_bibliography` takes an optional `style` (`apa`, `mla` or `ieee`) for the plain text output, so a formatted reference list takes one call. Without it the output is the same as before.

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
