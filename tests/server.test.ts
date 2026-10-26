import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, VERSION } from "../src/server.js";
import { BIBTEX } from "./fixtures.js";

async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer().connect(b);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(a);
  return client;
}

describe("the MCP server", () => {
  it("lists the five tools, all read only and offline", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "convert_bibliography",
      "dedupe_entries",
      "generate_cite_keys",
      "lint_entries",
      "parse_bibliography",
    ]);
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.annotations?.openWorldHint).toBe(false);
      expect(t.outputSchema).toBeDefined();
    }
  });

  it("answers a call with text and structured content", async () => {
    const client = await connect();
    const res: any = await client.callTool({ name: "parse_bibliography", arguments: { text: BIBTEX } });
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent.count).toBe(2);
    expect(res.content[0].text).toContain("Read 2 entries");
  });

  it("rejects an unknown output format before the tool runs", async () => {
    const client = await connect();
    const res: any = await client.callTool({ name: "convert_bibliography", arguments: { text: BIBTEX, to: "docx" } });
    expect(res.isError).toBe(true);
  });

  it("reports the package version", () => {
    expect(VERSION).toBe("0.1.0");
  });
});
