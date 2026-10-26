export type Format = "bibtex" | "ris" | "csl_json";
export type OutFormat = Format | "text";

export interface Entry {
  /** BibTeX entry type in lower case, like article or inproceedings. */
  type: string;
  key: string;
  /** Field names in lower case. Authors are joined with " and " as "Family, Given". */
  fields: Record<string, string>;
}

export interface Name {
  family: string;
  given: string;
  /** True for a group author like {World Health Organization}. */
  literal?: boolean;
}

const MONTHS: Record<string, string> = {
  jan: "January", feb: "February", mar: "March", apr: "April", may: "May", jun: "June",
  jul: "July", aug: "August", sep: "September", oct: "October", nov: "November", dec: "December",
};

const STOP_WORDS = new Set([
  "a", "an", "the", "on", "of", "in", "and", "for", "to", "with", "at", "by", "from", "is", "are", "as", "or", "into", "towards", "toward",
]);

const FIELD_ORDER = [
  "author", "editor", "title", "journal", "booktitle", "year", "month", "volume", "number", "pages",
  "publisher", "address", "school", "institution", "edition", "series", "issn", "isbn", "doi", "url", "abstract", "keywords", "note",
];

/* ---------- small helpers ---------- */

export function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Remove BibTeX braces and a few common escapes so the text reads normally. */
export function plain(s: string): string {
  return squash(
    s
      .replace(/\\([&%$#_])/g, "$1")
      .replace(/---/g, "—")
      .replace(/[{}]/g, ""),
  );
}

export function cleanDoi(raw: string): string {
  return squash(raw)
    .replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
}

export function ascii(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/* ---------- names ---------- */

function splitTopLevel(s: string, sep: RegExp): string[] {
  // Split on a separator but never inside braces.
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    if (depth === 0) {
      const m = s.slice(i).match(sep);
      if (m && m.index === 0) {
        parts.push(cur);
        cur = "";
        i += m[0].length - 1;
        continue;
      }
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.map(squash).filter(Boolean);
}

export function parseNames(raw: string | undefined): Name[] {
  if (!raw) return [];
  return splitTopLevel(raw, /^\s+and\s+/i).map((n): Name => {
    if (/^\{[^{}]*\}$/.test(n)) return { family: n.slice(1, -1), given: "", literal: true };
    const comma = splitTopLevel(n, /^,/);
    if (comma.length >= 2) return { family: comma[0], given: comma.slice(1).join(" ") };
    const words = n.split(" ");
    if (words.length === 1) return { family: words[0], given: "" };
    // Lower case particles like "van" or "de" belong to the family name.
    let i = words.length - 1;
    while (i > 1 && /^[a-z]/.test(words[i - 1])) i--;
    return { family: words.slice(i).join(" "), given: words.slice(0, i).join(" ") };
  });
}

export function formatNames(names: Name[]): string {
  return names.map((n) => (n.literal ? `{${n.family}}` : n.given ? `${n.family}, ${n.given}` : n.family)).join(" and ");
}

/* ---------- format detection ---------- */

export function detectFormat(text: string): Format {
  const t = text.trim();
  if (/^[\[{]/.test(t)) return "csl_json";
  if (/^TY {2}- /m.test(t)) return "ris";
  if (/@\s*\w+\s*[{(]/.test(t)) return "bibtex";
  throw new Error("Could not tell the format. Pass format as bibtex, ris or csl_json.");
}

/* ---------- entry normalizing ---------- */

const TYPE_ALIASES: Record<string, string> = {
  conference: "inproceedings",
  electronic: "online",
  www: "online",
  report: "techreport",
  thesis: "phdthesis",
};

function normalizeEntry(e: Entry): Entry {
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(e.fields)) {
    const val = squash(v);
    if (val) fields[k.toLowerCase()] = val;
  }
  if (fields.doi) fields.doi = cleanDoi(fields.doi);
  if (!fields.year && fields.date) {
    const y = fields.date.match(/\b(\d{4})\b/);
    if (y) fields.year = y[1];
  }
  if (!fields.journal && fields.journaltitle) fields.journal = fields.journaltitle;
  delete fields.journaltitle;
  if (fields.month && MONTHS[fields.month.toLowerCase()]) fields.month = MONTHS[fields.month.toLowerCase()];
  const type = e.type.toLowerCase();
  return { type: TYPE_ALIASES[type] ?? type, key: e.key.trim(), fields };
}

/* ---------- BibTeX ---------- */

export function parseBibtex(text: string): Entry[] {
  const entries: Entry[] = [];
  const macros: Record<string, string> = {};
  let i = 0;
  const n = text.length;

  const skipWs = () => {
    while (i < n && /\s/.test(text[i])) i++;
  };
  const readBraced = (): string => {
    let depth = 0;
    const start = i + 1;
    for (; i < n; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0) {
        const out = text.slice(start, i);
        i++;
        return out;
      }
    }
    return text.slice(start);
  };
  const readQuoted = (): string => {
    let depth = 0;
    const start = i + 1;
    for (i = i + 1; i < n; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
      else if (text[i] === '"' && depth <= 0 && text[i - 1] !== "\\") {
        const out = text.slice(start, i);
        i++;
        return out;
      }
    }
    return text.slice(start);
  };
  const readValue = (): string => {
    let out = "";
    for (;;) {
      skipWs();
      if (text[i] === "{") out += readBraced();
      else if (text[i] === '"') out += readQuoted();
      else {
        const m = text.slice(i).match(/^[^\s,#={}()"]+/);
        if (!m) break;
        i += m[0].length;
        const lower = m[0].toLowerCase();
        out += macros[lower] ?? (MONTHS[lower] ? lower : m[0]);
      }
      skipWs();
      if (text[i] === "#") i++;
      else break;
    }
    return out;
  };

  while (i < n) {
    const at = text.indexOf("@", i);
    if (at < 0) break;
    i = at + 1;
    const head = text.slice(i).match(/^\s*([A-Za-z]+)\s*([{(])/);
    if (!head) continue;
    const type = head[1].toLowerCase();
    i += head[0].length;
    const close = head[2] === "{" ? "}" : ")";

    if (type === "comment" || type === "preamble") {
      i--;
      if (head[2] === "{") readBraced();
      continue;
    }
    if (type === "string") {
      skipWs();
      const name = text.slice(i).match(/^[^\s=]+/);
      if (name) {
        i += name[0].length;
        skipWs();
        if (text[i] === "=") {
          i++;
          macros[name[0].toLowerCase()] = readValue();
        }
      }
      skipWs();
      if (text[i] === close) i++;
      continue;
    }

    skipWs();
    const keyM = text.slice(i).match(/^[^,\s{}]*/);
    const key = keyM ? keyM[0] : "";
    i += key.length;
    const fields: Record<string, string> = {};
    for (;;) {
      skipWs();
      if (i >= n) break;
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === close) {
        i++;
        break;
      }
      const nameM = text.slice(i).match(/^[A-Za-z][\w:.\-]*/);
      if (!nameM) {
        i++;
        continue;
      }
      i += nameM[0].length;
      skipWs();
      if (text[i] !== "=") continue;
      i++;
      fields[nameM[0].toLowerCase()] = readValue();
    }
    entries.push(normalizeEntry({ type, key, fields }));
  }
  return entries;
}

function bibtexValue(v: string): string {
  return `{${v}}`;
}

function normalizePages(p: string): string {
  const m = p.match(/^(\w+)\s*[-–—]+\s*(\w+)$/);
  return m ? `${m[1]}--${m[2]}` : p;
}

export function toBibtex(entries: Entry[]): string {
  return entries
    .map((e) => {
      const names = Object.keys(e.fields).sort((a, b) => {
        const ia = FIELD_ORDER.indexOf(a);
        const ib = FIELD_ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
      });
      const lines = names.map((k) => `  ${k} = ${bibtexValue(k === "pages" ? normalizePages(e.fields[k]) : e.fields[k])},`);
      return `@${e.type}{${e.key},\n${lines.join("\n")}\n}`;
    })
    .join("\n\n");
}

/* ---------- RIS ---------- */

const RIS_TYPES: Record<string, string> = {
  JOUR: "article", BOOK: "book", CHAP: "incollection", CONF: "inproceedings", CPAPER: "inproceedings",
  THES: "phdthesis", RPRT: "techreport", ELEC: "online", ICOMM: "online", UNPB: "unpublished", GEN: "misc", MGZN: "article",
};
const RIS_OUT: Record<string, string> = {
  article: "JOUR", book: "BOOK", incollection: "CHAP", inbook: "CHAP", inproceedings: "CPAPER", phdthesis: "THES",
  mastersthesis: "THES", techreport: "RPRT", online: "ELEC", unpublished: "UNPB", misc: "GEN",
};

export function parseRis(text: string): Entry[] {
  const entries: Entry[] = [];
  let tags: [string, string][] = [];
  const flush = () => {
    if (!tags.length) return;
    const get = (...t: string[]) => tags.find(([k]) => t.includes(k))?.[1];
    const all = (...t: string[]) => tags.filter(([k]) => t.includes(k)).map(([, v]) => v);
    const ty = get("TY") ?? "GEN";
    const type = RIS_TYPES[ty] ?? "misc";
    const fields: Record<string, string> = {};
    const authors = all("AU", "A1").map((a) => formatNames(parseNames(a)));
    if (authors.length) fields.author = authors.join(" and ");
    const editors = all("ED", "A2");
    if (editors.length) fields.editor = editors.join(" and ");
    fields.title = get("TI", "T1") ?? "";
    const container = get("T2", "JO", "JF", "JA", "BT") ?? "";
    if (container) fields[type === "article" ? "journal" : type === "book" ? "series" : "booktitle"] = container;
    const py = get("PY", "Y1", "DA") ?? "";
    fields.year = py.match(/\d{4}/)?.[0] ?? "";
    fields.volume = get("VL") ?? "";
    fields.number = get("IS") ?? "";
    const sp = get("SP");
    const ep = get("EP");
    fields.pages = sp && ep ? `${sp}--${ep}` : sp ?? "";
    fields.publisher = get("PB") ?? "";
    fields.address = get("CY") ?? "";
    fields.doi = get("DO") ?? "";
    fields.url = get("UR", "L1") ?? "";
    fields.abstract = get("AB", "N2") ?? "";
    fields.keywords = all("KW").join(", ");
    const sn = get("SN") ?? "";
    if (sn) fields[type === "book" ? "isbn" : "issn"] = sn;
    entries.push(normalizeEntry({ type, key: get("ID") ?? "", fields }));
    tags = [];
  };
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/);
    if (!m) {
      // A line that does not start with a tag continues the last value.
      if (tags.length && line.trim()) tags[tags.length - 1][1] += " " + line.trim();
      continue;
    }
    if (m[1] === "ER") flush();
    else if (m[1] === "TY" && tags.length) {
      flush();
      tags.push([m[1], m[2].trim()]);
    } else tags.push([m[1], m[2].trim()]);
  }
  flush();
  return entries;
}

export function toRis(entries: Entry[]): string {
  return entries
    .map((e) => {
      const f = e.fields;
      const out: string[] = [`TY  - ${RIS_OUT[e.type] ?? "GEN"}`];
      if (e.key) out.push(`ID  - ${e.key}`);
      for (const n of parseNames(f.author)) out.push(`AU  - ${plain(n.literal ? n.family : n.given ? `${n.family}, ${n.given}` : n.family)}`);
      for (const n of parseNames(f.editor)) out.push(`ED  - ${plain(n.given ? `${n.family}, ${n.given}` : n.family)}`);
      if (f.title) out.push(`TI  - ${plain(f.title)}`);
      const container = f.journal ?? f.booktitle;
      if (container) out.push(`T2  - ${plain(container)}`);
      if (f.year) out.push(`PY  - ${f.year}`);
      if (f.volume) out.push(`VL  - ${f.volume}`);
      if (f.number) out.push(`IS  - ${f.number}`);
      if (f.pages) {
        const m = normalizePages(f.pages).match(/^(\w+)--(\w+)$/);
        if (m) out.push(`SP  - ${m[1]}`, `EP  - ${m[2]}`);
        else out.push(`SP  - ${f.pages}`);
      }
      if (f.publisher) out.push(`PB  - ${plain(f.publisher)}`);
      if (f.address) out.push(`CY  - ${plain(f.address)}`);
      if (f.doi) out.push(`DO  - ${f.doi}`);
      if (f.url) out.push(`UR  - ${f.url}`);
      if (f.abstract) out.push(`AB  - ${plain(f.abstract)}`);
      if (f.keywords) for (const k of f.keywords.split(/[,;]/).map(squash).filter(Boolean)) out.push(`KW  - ${k}`);
      const sn = f.issn ?? f.isbn;
      if (sn) out.push(`SN  - ${sn}`);
      out.push("ER  - ");
      return out.join("\n");
    })
    .join("\n\n");
}

/* ---------- CSL JSON ---------- */

const CSL_TYPES: Record<string, string> = {
  "article-journal": "article", "article-magazine": "article", "article-newspaper": "article", article: "article",
  book: "book", chapter: "incollection", "paper-conference": "inproceedings", thesis: "phdthesis",
  report: "techreport", webpage: "online", "post-weblog": "online", manuscript: "unpublished", dataset: "misc",
};
const CSL_OUT: Record<string, string> = {
  article: "article-journal", book: "book", incollection: "chapter", inbook: "chapter", inproceedings: "paper-conference",
  phdthesis: "thesis", mastersthesis: "thesis", techreport: "report", online: "webpage", unpublished: "manuscript", misc: "document",
};

export function parseCslJson(text: string): Entry[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`The CSL JSON could not be read: ${(e as Error).message}`);
  }
  const items = Array.isArray(data) ? data : data && typeof data === "object" && "items" in data && Array.isArray((data as any).items) ? (data as any).items : [data];
  return items
    .filter((it: any) => it && typeof it === "object")
    .map((it: any) => {
      const type = CSL_TYPES[String(it.type ?? "")] ?? "misc";
      const names = (list: any): string =>
        Array.isArray(list)
          ? formatNames(
              list.map((a: any): Name =>
                a.literal ? { family: String(a.literal), given: "", literal: true } : { family: String(a.family ?? ""), given: String(a.given ?? "") },
              ),
            )
          : "";
      const dp = it.issued?.["date-parts"]?.[0] ?? [];
      const container = it["container-title"] ? String(it["container-title"]) : "";
      const fields: Record<string, string> = {
        author: names(it.author),
        editor: names(it.editor),
        title: it.title ? String(it.title) : "",
        year: dp[0] ? String(dp[0]) : it.issued?.literal?.match?.(/\d{4}/)?.[0] ?? "",
        volume: it.volume != null ? String(it.volume) : "",
        number: it.issue != null ? String(it.issue) : "",
        pages: it.page ? String(it.page) : "",
        publisher: it.publisher ? String(it.publisher) : "",
        address: it["publisher-place"] ? String(it["publisher-place"]) : "",
        doi: it.DOI ? String(it.DOI) : "",
        url: it.URL ? String(it.URL) : "",
        abstract: it.abstract ? String(it.abstract) : "",
        issn: it.ISSN ? String(it.ISSN) : "",
        isbn: it.ISBN ? String(it.ISBN) : "",
      };
      if (container) fields[type === "article" ? "journal" : "booktitle"] = container;
      return normalizeEntry({ type, key: it.id != null ? String(it.id) : "", fields });
    });
}

export function toCslJson(entries: Entry[]): string {
  const items = entries.map((e) => {
    const f = e.fields;
    const names = (raw?: string) =>
      parseNames(raw).map((n) => (n.literal ? { literal: plain(n.family) } : { family: plain(n.family), given: plain(n.given) }));
    const item: Record<string, unknown> = { id: e.key, type: CSL_OUT[e.type] ?? "document" };
    if (f.author) item.author = names(f.author);
    if (f.editor) item.editor = names(f.editor);
    if (f.title) item.title = plain(f.title);
    const container = f.journal ?? f.booktitle;
    if (container) item["container-title"] = plain(container);
    if (f.year && /^\d{4}$/.test(f.year)) item.issued = { "date-parts": [[Number(f.year)]] };
    if (f.volume) item.volume = f.volume;
    if (f.number) item.issue = f.number;
    if (f.pages) item.page = normalizePages(f.pages).replace("--", "-");
    if (f.publisher) item.publisher = plain(f.publisher);
    if (f.address) item["publisher-place"] = plain(f.address);
    if (f.doi) item.DOI = f.doi;
    if (f.url) item.URL = f.url;
    if (f.abstract) item.abstract = plain(f.abstract);
    if (f.issn) item.ISSN = f.issn;
    if (f.isbn) item.ISBN = f.isbn;
    return item;
  });
  return JSON.stringify(items, null, 2);
}

/* ---------- plain text ---------- */

function initials(given: string): string {
  return given
    .split(/[\s]+/)
    .filter(Boolean)
    .map((w) => (w.includes("-") ? w.split("-").map((p) => `${p[0].toUpperCase()}.`).join("-") : `${w[0].toUpperCase()}.`))
    .join(" ");
}

export function toText(entries: Entry[]): string {
  return entries
    .map((e) => {
      const f = e.fields;
      const names = parseNames(f.author).map((n) => (n.literal || !n.given ? plain(n.family) : `${plain(n.family)}, ${initials(plain(n.given))}`));
      let who = "";
      if (names.length === 1) who = names[0];
      else if (names.length > 1) who = `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
      const parts: string[] = [];
      if (who) parts.push(who.endsWith(".") ? who : `${who}.`);
      parts.push(`(${f.year ?? "n.d."}).`);
      if (f.title) parts.push(/[.?!]$/.test(plain(f.title)) ? plain(f.title) : `${plain(f.title)}.`);
      const container = f.journal ?? f.booktitle;
      if (container) {
        let c = plain(container);
        if (f.volume) c += `, ${f.volume}`;
        if (f.number) c += `(${f.number})`;
        if (f.pages) c += `, ${normalizePages(f.pages).replace("--", "-")}`;
        parts.push(`${c}.`);
      } else if (f.publisher) parts.push(`${plain(f.publisher)}.`);
      if (f.doi) parts.push(`https://doi.org/${f.doi}`);
      else if (f.url) parts.push(f.url);
      return parts.join(" ");
    })
    .join("\n\n");
}

/* ---------- parse and write by name ---------- */

export function parseAny(text: string, format: Format | "auto" = "auto"): { format: Format; entries: Entry[] } {
  if (!text.trim()) throw new Error("The text is empty. Paste a BibTeX, RIS or CSL JSON reference list.");
  const fmt = format === "auto" ? detectFormat(text) : format;
  const entries = fmt === "bibtex" ? parseBibtex(text) : fmt === "ris" ? parseRis(text) : parseCslJson(text);
  // Give entries without a key one, so every entry can be named later.
  const used = new Set(entries.map((e) => e.key).filter(Boolean));
  for (const e of entries) {
    if (!e.key) {
      e.key = uniqueKey(makeKey(e, { titleWord: true }), used);
      used.add(e.key);
    }
  }
  return { format: fmt, entries };
}

export function serialize(entries: Entry[], format: OutFormat): string {
  switch (format) {
    case "bibtex":
      return toBibtex(entries);
    case "ris":
      return toRis(entries);
    case "csl_json":
      return toCslJson(entries);
    default:
      return toText(entries);
  }
}

/* ---------- cite keys ---------- */

export function makeKey(e: Entry, opts: { titleWord: boolean }): string {
  const first = parseNames(e.fields.author)[0] ?? parseNames(e.fields.editor)[0];
  let family = first ? plain(first.family).split(" ").pop() ?? "" : "";
  family = ascii(family).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!family) family = "anon";
  const year = /^\d{4}$/.test(e.fields.year ?? "") ? e.fields.year : "nd";
  let word = "";
  if (opts.titleWord && e.fields.title) {
    const words = ascii(plain(e.fields.title))
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    word = words.find((w) => !STOP_WORDS.has(w)) ?? words[0] ?? "";
  }
  return `${family}${year}${word}`;
}

export function uniqueKey(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  for (let n = 0; ; n++) {
    const suffix = n < 26 ? String.fromCharCode(97 + n) : `${n}`;
    if (!used.has(base + suffix)) return base + suffix;
  }
}
