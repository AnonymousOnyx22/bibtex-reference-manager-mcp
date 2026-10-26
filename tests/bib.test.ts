import { describe, it, expect } from "vitest";
import { detectFormat, parseAny, parseBibtex, parseCslJson, parseNames, parseRis, serialize, toBibtex } from "../src/bib.js";
import { BIBTEX, CSL, RIS } from "./fixtures.js";

describe("format detection", () => {
  it("tells the three formats apart", () => {
    expect(detectFormat(BIBTEX)).toBe("bibtex");
    expect(detectFormat(RIS)).toBe("ris");
    expect(detectFormat(CSL)).toBe("csl_json");
  });

  it("rejects text it cannot place", () => {
    expect(() => detectFormat("just some words")).toThrow(/format/);
  });

  it("rejects empty text", () => {
    expect(() => parseAny("   ")).toThrow(/empty/);
  });
});

describe("BibTeX reader", () => {
  const entries = parseBibtex(BIBTEX);

  it("reads entries and skips @string and @comment", () => {
    expect(entries.map((e) => e.key)).toEqual(["smith2024deep", "knuth1984"]);
  });

  it("expands string macros and bare numbers", () => {
    expect(entries[0].fields.journal).toBe("Journal of Machine Learning");
    expect(entries[0].fields.year).toBe("2024");
  });

  it("strips the DOI link down to the DOI", () => {
    expect(entries[0].fields.doi).toBe("10.1000/abc123");
  });

  it("keeps braces that protect capitals and reads quoted values", () => {
    expect(entries[0].fields.title).toBe("Deep learning for {DNA} sequencing");
    expect(entries[1].fields.author).toBe("Donald E. Knuth");
  });

  it("joins values with #", () => {
    const [e] = parseBibtex(`@misc{k, title = "A " # {B}, year = {2020}}`);
    expect(e.fields.title).toBe("A B");
  });

  it("turns month macros into names and date into year", () => {
    const [e] = parseBibtex(`@misc{k, title={T}, month = jan, date = {2021-01-05}}`);
    expect(e.fields.month).toBe("January");
    expect(e.fields.year).toBe("2021");
  });
});

describe("names", () => {
  it("handles both name orders, particles and group authors", () => {
    expect(parseNames("Smith, John and Maria van der Berg and {World Health Organization}")).toEqual([
      { family: "Smith", given: "John" },
      { family: "van der Berg", given: "Maria" },
      { family: "World Health Organization", given: "", literal: true },
    ]);
  });
});

describe("RIS reader", () => {
  const entries = parseRis(RIS);

  it("reads both records", () => {
    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe("article");
    expect(entries[1].type).toBe("book");
  });

  it("maps the tags to fields", () => {
    const f = entries[0].fields;
    expect(f.author).toBe("Lee, Anna and Chen, Wei");
    expect(f.journal).toBe("Journal of Sleep Research");
    expect(f.year).toBe("2023");
    expect(f.pages).toBe("100--112");
    expect(f.keywords).toBe("sleep, memory");
  });

  it("makes a key when the record has no ID", () => {
    const { entries: all } = parseAny(RIS);
    expect(all[1].key).toBe("brown2020study");
  });
});

describe("CSL JSON reader", () => {
  const [e] = parseCslJson(CSL);

  it("maps the item", () => {
    expect(e.key).toBe("garcia2022");
    expect(e.type).toBe("article");
    expect(e.fields.journal).toBe("Education Review");
    expect(e.fields.year).toBe("2022");
    expect(e.fields.number).toBe("1");
    expect(e.fields.doi).toBe("10.3000/edu.2022.1");
  });

  it("keeps a group author as a literal name", () => {
    expect(e.fields.author).toBe("Garcia, Luis and {World Health Organization}");
  });

  it("reports broken JSON in words", () => {
    expect(() => parseCslJson("[{oops")).toThrow(/CSL JSON could not be read/);
  });
});

describe("writers", () => {
  const { entries } = parseAny(BIBTEX);

  it("writes BibTeX with a double hyphen page range that reads back the same", () => {
    const out = toBibtex(entries);
    expect(out).toContain("pages = {45--60}");
    expect(parseBibtex(out).map((e) => e.key)).toEqual(["smith2024deep", "knuth1984"]);
  });

  it("writes RIS with start and end pages", () => {
    const out = serialize(entries, "ris");
    expect(out).toContain("TY  - JOUR");
    expect(out).toContain("SP  - 45");
    expect(out).toContain("EP  - 60");
    expect(out).toContain("AU  - Smith, John");
    expect(out).toContain("TI  - Deep learning for DNA sequencing");
    expect(parseRis(out)[0].fields.pages).toBe("45--60");
  });

  it("writes CSL JSON that reads back", () => {
    const json = JSON.parse(serialize(entries, "csl_json"));
    expect(json[0].type).toBe("article-journal");
    expect(json[0].issued["date-parts"]).toEqual([[2024]]);
    expect(json[0].page).toBe("45-60");
    expect(parseCslJson(JSON.stringify(json))[0].fields.title).toBe("Deep learning for {DNA} sequencing".replace(/[{}]/g, ""));
  });

  it("writes plain text in author, year, title order", () => {
    const out = serialize(entries, "text");
    expect(out).toContain("Smith, J., & van der Berg, M. (2024). Deep learning for DNA sequencing.");
    expect(out).toContain("Journal of Machine Learning, 12(3), 45-60.");
    expect(out).toContain("https://doi.org/10.1000/abc123");
  });
});
