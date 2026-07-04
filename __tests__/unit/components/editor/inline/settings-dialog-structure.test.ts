import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SETTINGS_DIALOG_PATH = join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "admin",
  "(dashboard)",
  "_shared",
  "components",
  "editor",
  "inline",
  "SettingsDialog.tsx",
);
const TABS_COMPONENT_PATH = join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "admin",
  "(dashboard)",
  "_shared",
  "components",
  "ui",
  "tabs.tsx",
);

describe("SettingsDialog structure", () => {
  test("設定タブは非アクティブでも DOM に保持する", () => {
    const source = readFileSync(SETTINGS_DIALOG_PATH, "utf8");
    const compact = source.replace(/\s+/g, " ");
    const tabsContentOpenTags = compact.match(/<TabsContent\b[^>]*>/g) ?? [];

    expect(tabsContentOpenTags.length).toBe(1);
    expect(tabsContentOpenTags[0]).toContain("forceMount");
  });

  test("Conform form は native navigation を止めて保存 callback に委譲する", () => {
    const source = readFileSync(SETTINGS_DIALOG_PATH, "utf8");

    expect(source).toContain("<form");
    expect(source).toContain("{...getFormProps(injected.form)}");
    expect(source).toContain("onSubmit={handleFormSubmit}");
    expect(source).toContain("event.preventDefault();");
    expect(source).toContain("onClick={submitSettings}");
  });

  test("TabsTrigger は form 内でも submit しない", () => {
    const source = readFileSync(TABS_COMPONENT_PATH, "utf8");

    expect(source).toContain('type={type ?? "button"}');
  });
});
