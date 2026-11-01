import { describe, it, expect } from "vitest";
import { runTool } from "../src/core/tools.js";
import { tools } from "../src/tools.js";
import { BIBTEX, CSL, RIS } from "./fixtures.js";

async function call(name: string, args: Record<string, unknown>) {
  const tool = tools.find((t) => t.name === name)!;
  const res = await runTool(tool, args, null);
  return { res, data: res.structuredContent as any, text: res.content[0].text };
}

describe("parse_bibliography", () => {
  it("returns normalized entries from BibTeX", async () => {
    const { data, text } = await call("parse_bibliography", { text: BIBTEX });
    expect(data.format).toBe("bibtex");
    expect(data.count).toBe(2);
    expect(data.entries[0].authors).toEqual(["Smith, John", "van der Berg, Maria"]);
    expect(data.entries[0].fields.doi).toBe("10.1000/abc123");
    expect(text).toContain("Read 2 entries as bibtex");
  });

  it("reads RIS and CSL JSON too", async () => {
    expect((await call("parse_bibliography", { text: RIS })).data.format).toBe("ris");
    expect((await call("parse_bibliography", { text: CSL })).data.entries[0].authors).toEqual(["Garcia, Luis", "World Health Organization"]);
  });

  it("honours an explicit format", async () => {
    const { data } = await call("parse_bibliography", { text: BIBTEX, format: "bibtex" });
    expect(data.count).toBe(2);
  });

  it("returns an error for text it cannot read", async () => {
    const { res, text } = await call("parse_bibliography", { text: "hello there" });
    expect(res.isError).toBe(true);
    expect(text).toMatch(/format/);
  });
});

describe("convert_bibliography", () => {
  it("converts BibTeX to RIS", async () => {
    const { data } = await call("convert_bibliography", { text: BIBTEX, to: "ris" });
    expect(data.from).toBe("bibtex");
    expect(data.count).toBe(2);
    expect(data.output).toContain("ER  - ");
  });

  it("converts RIS to BibTeX", async () => {
    const { data } = await call("convert_bibliography", { text: RIS, to: "bibtex" });
    expect(data.output).toContain("@article{lee2023,");
    expect(data.output).toContain("pages = {100--112}");
  });

  it("converts CSL JSON to plain text", async () => {
    const { data } = await call("convert_bibliography", { text: CSL, to: "text" });
    expect(data.output).toContain("Garcia, L., & World Health Organization. (2022). Remote learning outcomes.");
  });

  it("writes the text output in MLA and IEEE style", async () => {
    const mla = (await call("convert_bibliography", { text: BIBTEX, to: "text", style: "mla" })).data.output;
    const ieee = (await call("convert_bibliography", { text: BIBTEX, to: "text", style: "ieee" })).data.output;
    expect(mla).toContain("Smith, John, and Maria van der Berg.");
    expect(ieee.startsWith("[1] J. Smith")).toBe(true);
    expect(ieee).toContain("[2] ");
    const apa = (await call("convert_bibliography", { text: BIBTEX, to: "text" })).data.output;
    expect((await call("convert_bibliography", { text: BIBTEX, to: "text", style: "apa" })).data.output).toBe(apa);
  });

  it("converts BibTeX to CSL JSON", async () => {
    const { data } = await call("convert_bibliography", { text: BIBTEX, to: "csl_json" });
    expect(JSON.parse(data.output)).toHaveLength(2);
  });

  it("says so when there is nothing to convert", async () => {
    const { res, text } = await call("convert_bibliography", { text: "@comment{nothing here}", to: "ris" });
    expect(res.isError).toBe(true);
    expect(text).toMatch(/No entries/);
  });
});

describe("dedupe_entries", () => {
  const dupes = `
@article{a1, author={Smith, J}, title={Deep Learning for Sequencing}, year={2024}, doi={10.1000/xyz}}
@article{a2, author={Smith, J}, title={A different title entirely}, year={2024}, doi={https://doi.org/10.1000/XYZ}, journal={J}}
@article{b1, author={Lee, A}, title={Sleep and memory in students}, year={2023}}
@article{b2, author={Lee, A}, title={Sleep and Memory in Students.}, year={2023}, journal={Sleep}}
@article{b3, author={Lee, A}, title={Sleep and memory in students}, year={2019}}
@book{same, title={First}, year={2000}}
@book{Same, title={Second thing}, year={2001}}
@misc{solo, title={Nothing like the others}, year={2010}}
`;

  it("groups by DOI, title and key", async () => {
    const { data } = await call("dedupe_entries", { text: dupes });
    expect(data.total).toBe(8);
    const byKeys = (k: string) => data.groups.find((g: any) => g.keys.includes(k));
    expect(byKeys("a1").reasons).toEqual(["doi"]);
    expect(byKeys("a1").keep).toBe("a2");
    expect(byKeys("a1").remove).toEqual(["a1"]);
    expect(byKeys("b1").reasons).toEqual(["title"]);
    expect(byKeys("b1").keys).toEqual(["b1", "b2"]);
    expect(byKeys("same").reasons).toEqual(["key"]);
  });

  it("does not match titles when the years clash", async () => {
    const { data } = await call("dedupe_entries", { text: dupes });
    expect(data.groups.some((g: any) => g.keys.includes("b3"))).toBe(false);
  });

  it("returns BibTeX without the removed copies", async () => {
    const { data } = await call("dedupe_entries", { text: dupes });
    expect(data.unique).toBe(5);
    expect(data.deduplicated_bibtex).not.toContain("@article{a1,");
    expect(data.deduplicated_bibtex).toContain("@article{a2,");
    expect(data.deduplicated_bibtex).toContain("@misc{solo,");
  });

  it("reports no duplicates in a clean list", async () => {
    const { data, text } = await call("dedupe_entries", { text: BIBTEX });
    expect(data.groups).toEqual([]);
    expect(text).toContain("No duplicates found.");
  });

  it("lets a lower threshold catch looser titles", async () => {
    const loose = `@misc{x, title={Machine learning in education}}\n@misc{y, title={Machine learning for education}}`;
    expect((await call("dedupe_entries", { text: loose })).data.groups).toHaveLength(0);
    expect((await call("dedupe_entries", { text: loose, title_threshold: 0.8 })).data.groups).toHaveLength(1);
  });
});

describe("lint_entries", () => {
  const messy = `
@article{bad1,
  author = {Doe, Jane},
  title = {the effect of sleep on grades},
  year = {24},
  pages = {50-45},
  doi = {not-a-doi}
}
@article{bad2, author={Roe, R}, title={Fine Title}, journal={J}, year={2020}, pages={12-15}}
@book{bad3, title={Something Else Entirely}, publisher={P}, year={2001}, pages={abc}}
@article{dup, author={A, B}, title={One Two Three Four}, journal={J}, year={2020}}
@article{dup, author={A, B}, title={One Two Three Four}, journal={J}, year={2020}}
`;

  it("flags a missing journal and a missing book author", async () => {
    const { data } = await call("lint_entries", { text: messy });
    const rule = (key: string, r: string) => data.issues.filter((i: any) => i.key === key && i.rule === r);
    expect(rule("bad1", "missing-field").map((i: any) => i.field)).toEqual(["journal"]);
    expect(rule("bad3", "missing-field").map((i: any) => i.field)).toEqual(["author"]);
  });

  it("flags page ranges that run backwards, use one hyphen or are not numbers", async () => {
    const { data } = await call("lint_entries", { text: messy });
    const pages = (key: string) => data.issues.find((i: any) => i.key === key && i.rule === "bad-pages")?.message;
    expect(pages("bad1")).toMatch(/ends before it starts/);
    expect(pages("bad2")).toMatch(/double hyphen/);
    expect(pages("bad3")).toMatch(/not a page number/);
  });

  it("flags a lower case title, a bad DOI and a short year", async () => {
    const { data } = await call("lint_entries", { text: messy });
    const rules = data.issues.filter((i: any) => i.key === "bad1").map((i: any) => i.rule);
    expect(rules).toEqual(expect.arrayContaining(["uncapitalized-title", "invalid-doi", "bad-year"]));
  });

  it("flags a repeated key once", async () => {
    const { data } = await call("lint_entries", { text: messy });
    expect(data.issues.filter((i: any) => i.rule === "duplicate-key")).toHaveLength(1);
  });

  it("counts errors and warnings", async () => {
    const { data } = await call("lint_entries", { text: messy });
    expect(data.errors + data.warnings).toBe(data.issues.length);
    expect(data.errors).toBeGreaterThan(0);
  });

  it("passes a clean list", async () => {
    const { data, text } = await call("lint_entries", { text: BIBTEX.replace("45-60", "45--60") });
    expect(data.issues).toEqual([]);
    expect(text).toContain("No problems found.");
  });

  it("accepts a title with protected capitals and a normal DOI link", async () => {
    const ok = `@article{k, author={A, B}, title={Using {DNA} to learn}, journal={J}, year={2020}, doi={https://doi.org/10.1234/ok.1}}`;
    expect((await call("lint_entries", { text: ok })).data.issues).toEqual([]);
  });

  it("flags a missing author on an article but not on a misc", async () => {
    const text = `@article{na, title={Some Title Here}, journal={J}, year={2020}}
@misc{nm, title={Class Notes}}`;
    const { data } = await call("lint_entries", { text });
    expect(data.issues.filter((i: any) => i.key === "na").map((i: any) => i.field)).toEqual(["author"]);
    expect(data.issues.filter((i: any) => i.key === "nm")).toEqual([]);
  });

  it("accepts an editor in place of a book author", async () => {
    const text = `@book{ed, editor={Poe, Ed}, title={Collected Essays}, publisher={P}, year={2010}}`;
    expect((await call("lint_entries", { text })).data.issues).toEqual([]);
  });

  it("accepts a group author in double braces", async () => {
    const text = `@article{who, author={{World Health Organization}}, title={Sleep Guidance}, journal={J}, year={2020}}`;
    expect((await call("lint_entries", { text })).data.issues).toEqual([]);
  });

  it("flags years that are text or too long but not a four digit year", async () => {
    const text = `@misc{y1, title={A}, year={n.d.}}
@misc{y2, title={B}, year={20244}}
@misc{y3, title={C}, year={2020}}`;
    const { data } = await call("lint_entries", { text });
    expect(data.issues.filter((i: any) => i.rule === "bad-year").map((i: any) => i.key)).toEqual(["y1", "y2"]);
  });

  it("treats keys that differ only in case as duplicates", async () => {
    const text = `@misc{Key, title={A}}
@misc{key, title={B}}`;
    const { data } = await call("lint_entries", { text });
    expect(data.issues.filter((i: any) => i.rule === "duplicate-key")).toHaveLength(1);
  });

  it("reports a key used three times once with the count", async () => {
    const text = `@misc{k, title={A}}
@misc{k, title={B}}
@misc{k, title={C}}`;
    const { data } = await call("lint_entries", { text });
    const dups = data.issues.filter((i: any) => i.rule === "duplicate-key");
    expect(dups).toHaveLength(1);
    expect(dups[0].message).toMatch(/3 times/);
  });

  it("does not flag a title that starts with a non ASCII capital", async () => {
    const text = `@article{u, author={A, B}, title={Über die Wirkung von Schlaf}, journal={J}, year={2020}}`;
    const { data } = await call("lint_entries", { text });
    expect(data.issues.filter((i: any) => i.rule === "uncapitalized-title")).toEqual([]);
  });

  it("returns no issues when there are no entries", async () => {
    const { data } = await call("lint_entries", { text: "@comment{nothing}" });
    expect(data.issues).toEqual([]);
  });
});

describe("generate_cite_keys", () => {
  const list = `
@article{old1, author={Smith, John}, title={Deep learning for sequencing}, year={2024}}
@article{old2, author={Smith, John}, title={Deep learning at scale}, year={2024}}
@book{old3, author={Müller, Jörg}, title={The Art of Lists}, year={2019}}
@misc{old4, title={Untitled notes}}
`;

  it("builds author, year and first title word", async () => {
    const { data } = await call("generate_cite_keys", { text: list });
    expect(data.keys.map((k: any) => k.new_key)).toEqual(["smith2024deep", "smith2024deepa", "muller2019art", "anonndUntitled".toLowerCase()]);
  });

  it("can leave the title word off", async () => {
    const { data } = await call("generate_cite_keys", { text: list, include_title_word: false });
    expect(data.keys.map((k: any) => k.new_key)).toEqual(["smith2024", "smith2024a", "muller2019", "anonnd"]);
  });

  it("writes the new keys into the BibTeX", async () => {
    const { data } = await call("generate_cite_keys", { text: list });
    expect(data.bibtex).toContain("@article{smith2024deep,");
    expect(data.bibtex).not.toContain("old1");
    expect(data.keys[0]).toEqual({ old_key: "old1", new_key: "smith2024deep" });
  });

  it("uses the family name of a CSL JSON author", async () => {
    const { data } = await call("generate_cite_keys", { text: CSL });
    expect(data.keys[0].new_key).toBe("garcia2022remote");
  });

  it("uses the last word of a group author", async () => {
    const text = `@article{r, author={{World Health Organization}}, title={Sleep Guidance}, year={2020}}`;
    const { data } = await call("generate_cite_keys", { text });
    expect(data.keys[0].new_key).toBe("organization2020sleep");
  });

  it("falls back to the editor, then to anon", async () => {
    const text = `@book{b, editor={Poe, Ed}, title={Collected Essays}, year={2010}}
@misc{m, title={Collected Essays}, year={2010}}`;
    const { data } = await call("generate_cite_keys", { text });
    expect(data.keys.map((k: any) => k.new_key)).toEqual(["poe2010collected", "anon2010collected"]);
  });

  it("strips accents from names and titles", async () => {
    const text = `@article{a, author={Müller, Jörg}, title={Éléphants et {LaTeX}}, year={2021}}`;
    const { data } = await call("generate_cite_keys", { text });
    expect(data.keys[0].new_key).toBe("muller2021elephants");
  });

  it("skips stop words and uses nd for a bad year", async () => {
    const text = `@misc{a, author={Lee, A}, title={The Study of Sleep}, year={n.d.}}
@misc{b, author={Lee, A}, title={The Study of Sleep}}`;
    const { data } = await call("generate_cite_keys", { text });
    expect(data.keys.map((k: any) => k.new_key)).toEqual(["leendstudy", "leendstudya"]);
  });

  it("adds letters to repeated keys when the title word is left off", async () => {
    const text = `@misc{a, author={Lee, A}, title={One}, year={2020}}
@misc{b, author={Lee, A}, title={Two}, year={2020}}
@misc{c, author={Lee, A}, title={Three}, year={2020}}`;
    const { data } = await call("generate_cite_keys", { text, include_title_word: false });
    expect(data.keys.map((k: any) => k.new_key)).toEqual(["lee2020", "lee2020a", "lee2020b"]);
  });

  it("returns no keys when there are no entries", async () => {
    const { data } = await call("generate_cite_keys", { text: "@comment{nothing}" });
    expect(data.count).toBe(0);
    expect(data.keys).toEqual([]);
  });
});

describe("fix_entries", () => {
  const messy = `
@article{a1, author={Doe, Jane}, title={the effect of sleep on grades}, journal={J}, year={2024}, pages={50 - 55}, doi={https://doi.org/10.1000/xyz}}
@article{a2, author={Roe, R}, title={Fine Title}, journal={J}, year={2020}, pages={9-4}, doi={not-a-doi}}
@article{a3, author={Roe, R}, title={The effect of {DNA} on sleep}, journal={J}, year={2020}}
`;

  it("fixes pages, titles and DOIs and leaves the rest", async () => {
    const { data } = await call("fix_entries", { text: messy });
    expect(data.count).toBe(3);
    const f = (k: string, field: string) => data.fixes.find((x: any) => x.key === k && x.field === field)?.to;
    expect(f("a1", "pages")).toBe("50--55");
    expect(f("a1", "title")).toBe("The effect of sleep on grades");
    expect(data.bibtex).toContain("doi = {10.1000/xyz}");
    expect(f("a2", "pages")).toBeUndefined();
    expect(f("a2", "doi")).toBeUndefined();
    expect(f("a3", "title")).toBeUndefined();
    expect(data.bibtex).toContain("pages = {50--55}");
  });

  it("reports nothing to fix for a clean list", async () => {
    const { data, text } = await call("fix_entries", { text: "@article{ok, author={Roe, R}, title={Fine Title}, journal={J}, year={2020}, pages={1--2}}" });
    expect(data.fixed).toBe(0);
    expect(text).toContain("Nothing needed fixing.");
  });
});
