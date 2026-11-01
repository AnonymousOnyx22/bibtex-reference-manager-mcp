import { z } from "zod";
import { bullets, type ToolDef } from "./core/tools.js";
import { findDuplicates, fixEntries, lintEntries } from "./analyze.js";
import { makeKey, parseAny, parseNames, plain, serialize, toBibtex, uniqueKey, type Entry } from "./bib.js";

const text = z.string().min(1).describe("The reference list as text: BibTeX, RIS or CSL JSON.");
const format = z
  .enum(["auto", "bibtex", "ris", "csl_json"])
  .optional()
  .describe("The format of the text. Defaults to auto, which looks at the text to decide.");

const entryShape = z.object({
  key: z.string(),
  type: z.string().describe("The BibTeX entry type, like article or book."),
  authors: z.array(z.string()).describe("Authors as \"Family, Given\"."),
  fields: z.record(z.string(), z.string()).describe("Every field of the entry, with lower case names."),
});

function describeEntry(e: Entry) {
  return {
    key: e.key,
    type: e.type,
    authors: parseNames(e.fields.author).map((n) => (n.literal ? plain(n.family) : n.given ? `${n.family}, ${n.given}` : n.family)),
    fields: e.fields,
  };
}

function plural(n: number, word: string): string {
  if (n === 1) return `${n} ${word}`;
  return `${n} ${word.endsWith("y") ? `${word.slice(0, -1)}ies` : `${word}s`}`;
}

const parseBibliography: ToolDef<null> = {
  name: "parse_bibliography",
  title: "Parse a bibliography",
  description:
    "Read BibTeX, RIS or CSL JSON text and return the entries in one normalized shape: lower case field names, tidy whitespace, bare DOIs, the year filled in from a date, and authors split into \"Family, Given\". Nothing is sent anywhere. Example: text \"@article{k1, AUTHOR = {John Smith and Jane Doe}, title={Deep Learning for Graphs}, year={2024}}\" returns one entry with authors [\"Smith, John\", \"Doe, Jane\"] and lower case field names. Leave format out unless auto picks the wrong one.",
  inputSchema: { text, format },
  outputSchema: {
    format: z.string().describe("The format that was read: bibtex, ris or csl_json."),
    count: z.number().describe("How many entries were found."),
    entries: z.array(entryShape),
  },
  run: async (a) => {
    const { format: fmt, entries } = parseAny(a.text, a.format ?? "auto");
    const lines = entries.map((e) => `${e.key} (${e.type}): ${plain(e.fields.title ?? "no title")}${e.fields.year ? `, ${e.fields.year}` : ""}`);
    return {
      text: `Read ${plural(entries.length, "entry")} as ${fmt}.\n${bullets(lines, "No entries were found.")}`,
      structured: { format: fmt, count: entries.length, entries: entries.map(describeEntry) },
    };
  },
};

const convertBibliography: ToolDef<null> = {
  name: "convert_bibliography",
  title: "Convert a bibliography",
  description:
    "Convert a reference list between BibTeX, RIS, CSL JSON and plain text (a simple reference list style, APA by default, or MLA or IEEE when you pass style). The input format is detected unless you pass it. Page ranges, DOIs and names are cleaned on the way. Example: text is a BibTeX entry and to is \"ris\", and output is the same reference as RIS. Set from only to override detection.",
  inputSchema: {
    text,
    to: z.enum(["bibtex", "ris", "csl_json", "text"]).describe("The format to write."),
    from: format,
    style: z
      .enum(["apa", "mla", "ieee"])
      .optional()
      .describe("The citation style for the text output: apa, mla or ieee. Defaults to apa. Ignored for the other formats."),
  },
  outputSchema: {
    from: z.string().describe("The format that was read."),
    to: z.string().describe("The format that was written."),
    count: z.number().describe("How many entries were converted."),
    output: z.string().describe("The converted reference list."),
  },
  run: async (a) => {
    const { format: fmt, entries } = parseAny(a.text, a.from ?? "auto");
    if (!entries.length) throw new Error("No entries were found in the text, so there is nothing to convert.");
    const output = serialize(entries, a.to, a.style ?? "apa");
    return {
      text: `Converted ${plural(entries.length, "entry")} from ${fmt} to ${a.to}.\n\n${output}`,
      structured: { from: fmt, to: a.to, count: entries.length, output },
    };
  },
};

const dedupeEntries: ToolDef<null> = {
  name: "dedupe_entries",
  title: "Find duplicate entries",
  description:
    "Find duplicate references by matching DOI, by the same cite key, and by similar titles (the years must not clash). Each group says which entry to keep, the one with the most fields, and which to remove. Also returns the list as BibTeX with the extra copies dropped. Example: two entries with the same DOI, one with 3 fields and one with 6, give one group that keeps the entry with 6 fields and lists the other under remove. Your files are not changed.",
  inputSchema: {
    text,
    format,
    title_threshold: z
      .number()
      .min(0.5)
      .max(1)
      .optional()
      .describe("How alike two titles must be to count as the same, from 0.5 to 1. Defaults to 0.9."),
    merge_duplicates: z
      .boolean()
      .optional()
      .describe("Set to true to also return a merged list that shows, for each group, the fields only the removed copies had, like doi or pages. The kept entry's own fields are never changed. Defaults to false."),
  },
  outputSchema: {
    total: z.number().describe("How many entries were read."),
    unique: z.number().describe("How many entries are left once the duplicates are dropped."),
    groups: z.array(
      z.object({
        keys: z.array(z.string()),
        reasons: z.array(z.enum(["doi", "key", "title"])),
        keep: z.string(),
        remove: z.array(z.string()),
      }),
    ),
    deduplicated_bibtex: z.string().describe("The list as BibTeX without the removed copies."),
    merged: z
      .array(
        z.object({
          key: z.string().describe("The cite key of the kept entry."),
          added_fields: z.record(z.string(), z.string()).describe("Fields that only the removed copies had, with the value taken from the first copy that has it."),
          fields: z.record(z.string(), z.string()).describe("The kept entry's fields plus the added ones."),
        }),
      )
      .optional()
      .describe("Only present when merge_duplicates is true: one item per group showing the merged fields."),
  },
  run: async (a) => {
    const { entries } = parseAny(a.text, a.format ?? "auto");
    const groups = findDuplicates(entries, a.title_threshold ?? 0.9);
    const merged = a.merge_duplicates
      ? groups.map((g) => {
          const fields = { ...entries[g.keepIndex].fields };
          const added: Record<string, string> = {};
          for (const i of g.indexes) {
            if (i === g.keepIndex) continue;
            for (const [name, value] of Object.entries(entries[i].fields)) {
              if (value && !fields[name]) fields[name] = added[name] = value;
            }
          }
          return { key: g.keep, added_fields: added, fields };
        })
      : undefined;
    const drop = new Set<number>();
    for (const g of groups) {
      for (const i of g.indexes) if (i !== g.keepIndex) drop.add(i);
    }
    const kept = entries.filter((_, i) => !drop.has(i));
    const lines = groups.map((g) => `${g.keys.join(", ")} match by ${g.reasons.join(" and ")}. Keep ${g.keep}.`);
    return {
      text: `Read ${plural(entries.length, "entry")} and found ${plural(groups.length, "duplicate group")}. ${kept.length} would be left.\n${bullets(lines, "No duplicates found.")}`,
      structured: {
        total: entries.length,
        unique: kept.length,
        groups: groups.map(({ keys, reasons, keep, remove }) => ({ keys, reasons, keep, remove })),
        deduplicated_bibtex: toBibtex(kept),
        ...(merged ? { merged } : {}),
      },
    };
  },
};

const lintEntriesTool: ToolDef<null> = {
  name: "lint_entries",
  title: "Lint entries",
  description:
    "Check a reference list for problems: missing required fields for the entry type, bad page ranges, titles that are not capitalized, invalid DOIs, odd years and repeated keys. Each issue names the entry key, the field and a plain message. Example: an @article with no journal field gives an issue with the rule missing-field and the field journal. Pass the whole list as text so repeated keys can be found.",
  inputSchema: { text, format },
  outputSchema: {
    count: z.number().describe("How many entries were checked."),
    errors: z.number(),
    warnings: z.number(),
    issues: z.array(
      z.object({
        key: z.string(),
        rule: z.enum(["missing-field", "bad-pages", "uncapitalized-title", "invalid-doi", "bad-year", "duplicate-key"]),
        severity: z.enum(["error", "warning"]),
        field: z.string().optional(),
        message: z.string(),
      }),
    ),
  },
  run: async (a) => {
    const { entries } = parseAny(a.text, a.format ?? "auto");
    const issues = lintEntries(entries);
    const errors = issues.filter((i) => i.severity === "error").length;
    const warnings = issues.length - errors;
    const lines = issues.map((i) => `${i.key}: [${i.rule}] ${i.message}`);
    return {
      text: `Checked ${plural(entries.length, "entry")}: ${plural(errors, "error")}, ${plural(warnings, "warning")}.\n${bullets(lines, "No problems found.")}`,
      structured: { count: entries.length, errors, warnings, issues },
    };
  },
};

const fixEntriesTool: ToolDef<null> = {
  name: "fix_entries",
  title: "Fix entries",
  description:
    "Apply the safe fixes that lint_entries points to and return the cleaned list as BibTeX: page ranges with one hyphen get a double hyphen, titles that start with a lower case letter or are all lower case get capitals (words inside braces are left alone), and DOIs written as a link or with a doi: prefix become bare DOIs. Missing fields, backwards page ranges and DOIs that are not valid are not guessed, so run lint_entries on the result. Example: pages \"12-15\" becomes \"12--15\". Your files are not changed.",
  inputSchema: { text, format },
  outputSchema: {
    count: z.number().describe("How many entries were read."),
    fixed: z.number().describe("How many changes were made."),
    fixes: z.array(
      z.object({
        key: z.string(),
        field: z.enum(["pages", "title", "doi"]),
        from: z.string(),
        to: z.string(),
      }),
    ),
    bibtex: z.string().describe("The cleaned list as BibTeX."),
  },
  run: async (a) => {
    const { entries } = parseAny(a.text, a.format ?? "auto");
    if (!entries.length) throw new Error("No entries were found in the text, so there is nothing to fix.");
    const { entries: cleaned, fixes } = fixEntries(entries);
    const bibtex = toBibtex(cleaned);
    const lines = fixes.map((f) => `${f.key}: ${f.field} "${f.from}" becomes "${f.to}"`);
    return {
      text: `Checked ${plural(entries.length, "entry")} and made ${plural(fixes.length, "change")}.\n${bullets(lines, "Nothing needed fixing.")}\n\n${bibtex}`,
      structured: { count: entries.length, fixed: fixes.length, fixes, bibtex },
    };
  },
};

const generateCiteKeys: ToolDef<null> = {
  name: "generate_cite_keys",
  title: "Generate cite keys",
  description:
    "Create consistent cite keys from the first author's family name, the year and the first meaningful word of the title, like smith2024deep. Repeated keys get a letter added. Returns the old and new key for each entry and the list as BibTeX with the new keys. Example: an entry with key old1, author \"Smith, John\", year 2024 and title \"Deep Learning for Graphs\" gives old_key old1 and new_key smith2024deep, or smith2024 when include_title_word is false.",
  inputSchema: {
    text,
    format,
    include_title_word: z.boolean().optional().describe("Add the first meaningful title word, so you get smith2024deep and not smith2024. Defaults to true."),
  },
  outputSchema: {
    count: z.number(),
    keys: z.array(z.object({ old_key: z.string(), new_key: z.string() })),
    bibtex: z.string().describe("The list as BibTeX using the new keys."),
  },
  run: async (a) => {
    const { entries } = parseAny(a.text, a.format ?? "auto");
    const used = new Set<string>();
    const keys = entries.map((e) => {
      const nk = uniqueKey(makeKey(e, { titleWord: a.include_title_word ?? true }), used);
      used.add(nk);
      return { old_key: e.key, new_key: nk };
    });
    const renamed = entries.map((e, i) => ({ ...e, key: keys[i].new_key }));
    const lines = keys.map((k) => (k.old_key === k.new_key ? `${k.new_key} (unchanged)` : `${k.old_key} becomes ${k.new_key}`));
    return {
      text: `Made ${plural(keys.length, "cite key")}.\n${bullets(lines, "No entries were found.")}`,
      structured: { count: keys.length, keys, bibtex: toBibtex(renamed) },
    };
  },
};

export const tools: ToolDef<null>[] = [parseBibliography, convertBibliography, dedupeEntries, lintEntriesTool, fixEntriesTool, generateCiteKeys];
