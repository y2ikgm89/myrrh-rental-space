import { describe, expect, test } from "bun:test";
import robots from "@/app/robots";

describe("app/robots.ts", () => {
  const result = robots();

  function getRules() {
    const { rules } = result;
    expect(rules).toBeDefined();
    if (rules === undefined) {
      throw new Error("robots rules must be defined");
    }
    return Array.isArray(rules) ? rules : [rules];
  }

  function toArray(value: string | string[] | undefined): string[] {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
  }

  test("rules is an array", () => {
    expect(Array.isArray(result.rules)).toBe(true);
  });

  test("wildcard rule allows root and blocks expected paths", () => {
    const rules = getRules();
    const wildcard = rules.find((r) => r.userAgent === "*");
    expect(wildcard).toBeDefined();
    expect(wildcard?.allow).toBe("/");
    const disallow = toArray(wildcard?.disallow);
    expect(disallow).toContain("/admin/");
    expect(disallow).toContain("/api/");
    expect(disallow).toContain("/mypage/");
    expect(disallow).toContain("/reservation/complete");
    expect(disallow).toContain("/reservation/cancel");
    expect(disallow).toContain("/events/cancel");
    expect(disallow).toContain("/login");
    expect(disallow).toContain("/preview/");
    expect(disallow).toContain("/_next/data/");
  });

  test("does NOT block /_next/static or /_next/image or /static/", () => {
    const rules = getRules();
    const allDisallows = rules.flatMap((r) => toArray(r.disallow));
    expect(allDisallows).not.toContain("/_next/");
    expect(allDisallows).not.toContain("/_next/static/");
    expect(allDisallows).not.toContain("/_next/image/");
    expect(allDisallows).not.toContain("/static/");
  });

  test("blocks AI training crawlers with current official UAs", () => {
    const rules = getRules();
    const aiRule = rules.find(
      (r) => Array.isArray(r.userAgent) && r.userAgent.includes("GPTBot"),
    );
    expect(aiRule).toBeDefined();
    const uas = toArray(aiRule?.userAgent);
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
    const rules = getRules();
    const allUAs = rules.flatMap((r) => toArray(r.userAgent));
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
