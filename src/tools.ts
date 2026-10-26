import { z } from "zod";
import { bullets, type ToolDef } from "./core/tools.js";
import { findDuplicates, lintEntries } from "./analyze.js";
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
    "Read BibTeX, RIS or CSL JSON text and return the entries in one normalized shape: lower case field names, tidy whitespace, bare DOIs, the year filled in from a date, and authors split into \"Family, Given\". Nothing is sent anywhere.",
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
    "Convert a reference list between BibTeX, RIS, CSL JSON and plain text (a simple author, year, title style). The input format is detected unless you pass it. Page ranges, DOIs and names are cleaned on the way.",
  inputSchema: {
    text,
    to: z.enum(["bibtex", "ris", "csl_json", "text"]).describe("The format to write."),
    from: format,
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
    const output = serialize(entries, a.to);
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
    "Find duplicate references by matching DOI, by the same cite key, and by similar titles (the years must not clash). Each group says which entry to keep, the one with the most fields, and which to remove. Also returns the list as BibTeX with the extra copies dropped.",
  inputSchema: {
    text,
    format,
    title_threshold: z
      .number()
      .min(0.5)
      .max(1)
      .optional()
      .describe("How alike two titles must be to count as the same, from 0.5 to 1. Defaults to 0.9."),
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
  },
  run: async (a) => {
    const { entries } = parseAny(a.text, a.format ?? "auto");
    const groups = findDuplicates(entries, a.title_threshold ?? 0.9);
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
      },
    };
  },
};

const lintEntriesTool: ToolDef<null> = {
  name: "lint_entries",
  title: "Lint entries",
  description:
    "Check a reference list for problems: missing required fields for the entry type, bad page ranges, titles that are not capitalized, invalid DOIs, odd years and repeated keys. Each issue names the entry key, the field and a plain message.",
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

const generateCiteKeys: ToolDef<null> = {
  name: "generate_cite_keys",
  title: "Generate cite keys",
  description:
    "Create consistent cite keys from the first author's family name, the year and the first meaningful word of the title, like smith2024deep. Repeated keys get a letter added. Returns the old and new key for each entry and the list as BibTeX with the new keys.",
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

export const tools: ToolDef<null>[] = [parseBibliography, convertBibliography, dedupeEntries, lintEntriesTool, generateCiteKeys];
