import { ascii, cleanDoi, plain, type Entry } from "./bib.js";

/* ---------- duplicates ---------- */

export function normalizeTitle(t: string): string {
  return ascii(plain(t))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = s.replace(/ /g, "");
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Dice coefficient on character pairs, from 0 to 1. */
export function titleSimilarity(a: string, b: string): number {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bx = bigrams(x);
  const by = bigrams(y);
  let overlap = 0;
  let total = 0;
  for (const v of bx.values()) total += v;
  for (const v of by.values()) total += v;
  for (const [g, c] of bx) overlap += Math.min(c, by.get(g) ?? 0);
  return total ? (2 * overlap) / total : 0;
}

export interface DuplicateGroup {
  /** Positions of the entries in the input, in order. */
  indexes: number[];
  keys: string[];
  reasons: ("doi" | "key" | "title")[];
  keepIndex: number;
  keep: string;
  remove: string[];
}

export function findDuplicates(entries: Entry[], threshold: number): DuplicateGroup[] {
  const n = entries.length;
  const parent = entries.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const reasons = new Map<number, Set<"doi" | "key" | "title">>();
  const link = (a: number, b: number, why: "doi" | "key" | "title") => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
    // Record the reason against both members, the root is settled afterwards.
    for (const i of [a, b]) {
      if (!reasons.has(i)) reasons.set(i, new Set());
      reasons.get(i)!.add(why);
    }
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = entries[i];
      const b = entries[j];
      const da = a.fields.doi ? cleanDoi(a.fields.doi).toLowerCase() : "";
      const db = b.fields.doi ? cleanDoi(b.fields.doi).toLowerCase() : "";
      if (da && da === db) link(i, j, "doi");
      if (a.key && a.key.toLowerCase() === b.key.toLowerCase()) link(i, j, "key");
      const ya = a.fields.year;
      const yb = b.fields.year;
      const yearsClash = ya && yb && ya !== yb;
      if (!yearsClash && a.fields.title && b.fields.title && titleSimilarity(a.fields.title, b.fields.title) >= threshold) link(i, j, "title");
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  }
  const out: DuplicateGroup[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const why = new Set<"doi" | "key" | "title">();
    for (const i of members) for (const r of reasons.get(i) ?? []) why.add(r);
    // Keep the entry with the most fields, the earliest one on a tie.
    const best = members.reduce((p, c) => (Object.keys(entries[c].fields).length > Object.keys(entries[p].fields).length ? c : p), members[0]);
    out.push({
      indexes: members,
      keys: members.map((i) => entries[i].key),
      reasons: (["doi", "key", "title"] as const).filter((r) => why.has(r)),
      keepIndex: best,
      keep: entries[best].key,
      remove: members.filter((i) => i !== best).map((i) => entries[i].key),
    });
  }
  return out.sort((a, b) => a.indexes[0] - b.indexes[0]);
}

/* ---------- lint ---------- */

export type Severity = "error" | "warning";
export interface Issue {
  key: string;
  rule: "missing-field" | "bad-pages" | "uncapitalized-title" | "invalid-doi" | "bad-year" | "duplicate-key";
  severity: Severity;
  field?: string;
  message: string;
}

const REQUIRED: Record<string, string[][]> = {
  article: [["author"], ["title"], ["journal"], ["year"]],
  book: [["author", "editor"], ["title"], ["publisher"], ["year"]],
  inproceedings: [["author"], ["title"], ["booktitle"], ["year"]],
  incollection: [["author"], ["title"], ["booktitle"], ["publisher"], ["year"]],
  phdthesis: [["author"], ["title"], ["school"], ["year"]],
  mastersthesis: [["author"], ["title"], ["school"], ["year"]],
  techreport: [["author"], ["title"], ["institution"], ["year"]],
  unpublished: [["author"], ["title"], ["note"]],
  misc: [["title"]],
  online: [["title"], ["url"]],
};

const SMALL_WORDS = new Set(["a", "an", "the", "and", "or", "of", "in", "on", "for", "to", "with", "at", "by", "from", "as", "but", "nor", "vs"]);

export function pageProblem(pages: string): string | null {
  const p = pages.trim();
  if (/^[A-Za-z]?\d+$/.test(p)) return null;
  if (/^\d+--\d+$/.test(p)) {
    const [a, b] = p.split("--").map(Number);
    return b < a ? `the range ${p} ends before it starts` : null;
  }
  if (/^\d+\s*[-–—]\s*\d+$/.test(p)) {
    const [a, b] = p.split(/[-–—]/).map(Number);
    return b < a ? `the range ${p} ends before it starts` : "use a double hyphen between the pages, like 12--15";
  }
  if (/^\d+\s*[-–—]+\s*\d+\s*[-–—]+\s*\d+$/.test(p)) return "the range has more than two page numbers";
  return `"${p}" is not a page number or a range like 12--15`;
}

export function lintEntries(entries: Entry[]): Issue[] {
  const issues: Issue[] = [];
  const seen = new Map<string, number>();
  for (const e of entries) {
    const k = e.key.toLowerCase();
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const reportedKeys = new Set<string>();
  for (const e of entries) {
    const f = e.fields;
    const add = (rule: Issue["rule"], severity: Severity, message: string, field?: string) =>
      issues.push({ key: e.key, rule, severity, message, ...(field ? { field } : {}) });

    if ((seen.get(e.key.toLowerCase()) ?? 0) > 1 && !reportedKeys.has(e.key.toLowerCase())) {
      reportedKeys.add(e.key.toLowerCase());
      add("duplicate-key", "error", `The key ${e.key} is used ${seen.get(e.key.toLowerCase())} times.`);
    }

    for (const group of REQUIRED[e.type] ?? [["title"]]) {
      if (!group.some((g) => f[g])) {
        add("missing-field", e.type === "misc" || e.type === "online" ? "warning" : "error", `A ${e.type} needs ${group.join(" or ")}, and it is missing.`, group[0]);
      }
    }

    if (f.pages) {
      const problem = pageProblem(f.pages);
      if (problem) add("bad-pages", "warning", `Pages: ${problem}.`, "pages");
    }

    if (f.title) {
      const words = plain(f.title).split(" ").filter(Boolean);
      const raw = f.title.trim();
      if (/^[a-z]/.test(raw)) {
        add("uncapitalized-title", "warning", `The title starts with a lower case letter: "${plain(f.title)}".`, "title");
      } else if (words.length > 3 && words.filter((w) => !SMALL_WORDS.has(w.toLowerCase())).every((w) => w === w.toLowerCase())) {
        add("uncapitalized-title", "warning", `Every word of the title is lower case: "${plain(f.title)}".`, "title");
      }
    }

    if (f.doi && !/^10\.\d{4,9}\/\S+$/.test(cleanDoi(f.doi))) {
      add("invalid-doi", "error", `"${f.doi}" is not a valid DOI. A DOI looks like 10.1000/xyz123.`, "doi");
    }

    if (f.year && !/^\d{4}$/.test(f.year)) add("bad-year", "warning", `The year "${f.year}" is not a four digit year.`, "year");
  }
  return issues;
}
