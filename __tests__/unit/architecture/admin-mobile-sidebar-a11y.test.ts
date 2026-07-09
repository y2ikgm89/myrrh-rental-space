import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ADMIN_COMPONENT_ROOT = join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "admin",
  "(dashboard)",
  "_components",
);

describe("admin mobile sidebar accessibility contract", () => {
  test("mobile menu button exposes controlled sidebar and expanded state", () => {
    const topBarSource = readFileSync(
      join(ADMIN_COMPONENT_ROOT, "TopBar.tsx"),
      "utf8",
    );
    const sidebarSource = readFileSync(
      join(ADMIN_COMPONENT_ROOT, "ResponsiveSidebar.tsx"),
      "utf8",
    );

    expect(topBarSource).toContain('aria-controls="admin-sidebar"');
    expect(topBarSource).toContain("aria-expanded={isSidebarExpanded}");
    expect(sidebarSource).toContain('id="admin-sidebar"');
  });

  test("mobile drawer stays hidden before hydration", () => {
    const sidebarSource = readFileSync(
      join(ADMIN_COMPONENT_ROOT, "ResponsiveSidebar.tsx"),
      "utf8",
    );

    expect(sidebarSource).toContain("hideBeforeHydrationOnMobile");
    expect(sidebarSource).toContain("max-lg:-translate-x-full");
    expect(sidebarSource).toContain("max-lg:opacity-0");
    expect(sidebarSource).toContain("max-lg:pointer-events-none");
  });
});
