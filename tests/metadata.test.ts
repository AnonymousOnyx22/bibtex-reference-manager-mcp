import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { VERSION } from "../src/server.js";
import { tools } from "../src/tools.js";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readJson = (path: string) => JSON.parse(read(path));

describe("package metadata", () => {
  const pkg = readJson("package.json");

  it("uses the agreed names and version", () => {
    expect(pkg.name).toBe("bibtex-reference-manager-mcp");
    expect(pkg.mcpName).toBe("io.github.AnonymousOnyx22/bibtex-reference-manager-mcp");
    expect(pkg.version).toBe("0.1.0");
    expect(pkg.bin).toEqual({ "bibtex-reference-manager-mcp": "build/src/index.js" });
  });

  it("has at least ten keywords and no leftovers from the old project", () => {
    expect(pkg.keywords.length).toBeGreaterThanOrEqual(10);
    expect(JSON.stringify(pkg).toLowerCase()).not.toMatch(/gpa|brightspace/);
  });

  it("matches server.json, glama.json and the server version", () => {
    const server = readJson("server.json");
    const glama = readJson("glama.json");
    expect(server.name).toBe(pkg.mcpName);
    expect(server.version).toBe(pkg.version);
    expect(server.packages[0].identifier).toBe(pkg.name);
    expect(server.packages[0].version).toBe(pkg.version);
    expect(glama.version).toBe(pkg.version);
    expect(VERSION).toBe(pkg.version);
  });

  it("lists every tool in glama.json", () => {
    const names = readJson("glama.json").tools.map((t: any) => t.name).sort();
    expect(names).toEqual(tools.map((t) => t.name).sort());
  });

  it("asks for no keys or passwords", () => {
    for (const file of ["src/tools.ts", "src/server.ts", "src/index.ts"]) {
      expect(read(file)).not.toMatch(/process\.env|fetch\(|https?:\/\/[a-z]/i);
    }
  });
});

describe("docs", () => {
  const readme = read("README.md");
  const llms = read("llms.txt");

  it("name every tool in the README and llms.txt", () => {
    for (const t of tools) {
      expect(readme, `README ${t.name}`).toContain(`\`${t.name}\``);
      expect(llms, `llms.txt ${t.name}`).toContain(t.name);
    }
  });

  it("keep the README sections", () => {
    for (const h of ["## Install", "### Claude Desktop", "## Tools", "## Try these prompts", "## Privacy", "## License"]) {
      expect(readme).toContain(h);
    }
  });

  it("show the package name in the quick start config", () => {
    expect(readme).toContain('"args": ["-y", "bibtex-reference-manager-mcp"]');
  });

  it("have no leftovers from the old project", () => {
    // the table of sibling servers names the other servers on purpose, so it is left out of this check
    const withoutSiblings = readme.replace(/\n## More free student MCP servers[\s\S]*?(?=\n## |$)/, "");
    expect(withoutSiblings.toLowerCase()).not.toMatch(/gpa|brightspace/);
    expect(llms.toLowerCase()).not.toMatch(/gpa|brightspace/);
    expect(read("CHANGELOG.md").toLowerCase()).not.toMatch(/gpa/);
  });

  it("use no em dashes or en dashes", () => {
    for (const doc of [readme, llms, read("CHANGELOG.md")]) expect(doc).not.toMatch(/[–—]/);
  });

  it("have a changelog entry for this version", () => {
    expect(read("CHANGELOG.md")).toContain("## 0.1.0");
  });
});
