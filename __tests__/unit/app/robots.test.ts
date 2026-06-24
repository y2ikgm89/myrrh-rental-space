import { describe, expect, test } from "bun:test";
import robots from "@/app/robots";

describe("app/robots.ts", () => {
  const result = robots();

  test("rules is an array", () => {
    expect(Array.isArray(result.rules)).toBe(true);
  });

  test("wildcard rule allows root and blocks expected paths", () => {
    const rules = result.rules as Array<{
      userAgent: string | string[];
      allow?: string | string[];
      disallow?: string | string[];
    }>;
    const wildcard = rules.find((r) => r.userAgent === "*");
    expect(wildcard).toBeDefined();
    expect(wildcard?.allow).toBe("/");
    const disallow = wildcard?.disallow as string[];
    expect(disallow).toContain("/admin/");
    expect(disallow).toContain("/api/");
    expect(disallow).toContain("/mypage/");
    expect(disallow).toContain("/reservation/complete");
    expect(disallow).toContain("/reservation/cancel");
    expect(disallow).toContain("/login");
    expect(disallow).toContain("/preview/");
    expect(disallow).toContain("/_next/data/");
  });

  test("does NOT block /_next/static or /_next/image or /static/", () => {
    const rules = result.rules as Array<{ disallow?: string | string[] }>;
    const allDisallows = rules.flatMap((r) =>
      Array.isArray(r.disallow) ? r.disallow : r.disallow ? [r.disallow] : [],
    );
    expect(allDisallows).not.toContain("/_next/");
    expect(allDisallows).not.toContain("/_next/static/");
    expect(allDisallows).not.toContain("/_next/image/");
    expect(allDisallows).not.toContain("/static/");
  });

  test("blocks AI training crawlers with current official UAs", () => {
    const rules = result.rules as Array<{
      userAgent: string | string[];
      disallow?: string | string[];
    }>;
    const aiRule = rules.find(
      (r) => Array.isArray(r.userAgent) && r.userAgent.includes("GPTBot"),
    );
    expect(aiRule).toBeDefined();
    const uas = aiRule?.userAgent as string[];
    expect(uas).toContain("ClaudeBot");
    expect(uas).toContain("Google-Extended");
    expect(uas).toContain("Applebot-Extended");
    expect(uas).toContain("meta-externalagent");
    expect(uas).toContain("Amazonbot");
    expect(uas).toContain("CCBot");
    expect(uas).toContain("Bytespider");
    expect(uas).toContain("cohere-ai");
    expect(aiRule?.disallow).toBe("/");
  });

  test("does NOT include legacy or allow-listed UAs", () => {
    const rules = result.rules as Array<{ userAgent: string | string[] }>;
    const allUAs = rules.flatMap((r) =>
      Array.isArray(r.userAgent) ? r.userAgent : [r.userAgent],
    );
    expect(allUAs).not.toContain("anthropic-ai");
    expect(allUAs).not.toContain("Claude-Web");
    expect(allUAs).not.toContain("OAI-SearchBot");
    expect(allUAs).not.toContain("Claude-SearchBot");
    expect(allUAs).not.toContain("ChatGPT-User");
    expect(allUAs).not.toContain("Claude-User");
    expect(allUAs).not.toContain("PerplexityBot");
    expect(allUAs).not.toContain("Perplexity-User");
    expect(allUAs).not.toContain("DuckAssistBot");
    expect(allUAs).not.toContain("meta-externalfetcher");
  });

  test("sitemap is a single absolute URL", () => {
    expect(typeof result.sitemap).toBe("string");
    expect(result.sitemap).toMatch(/^https?:\/\/.+\/sitemap\.xml$/);
  });

  test("does not set deprecated host directive", () => {
    expect(result.host).toBeUndefined();
  });
});
