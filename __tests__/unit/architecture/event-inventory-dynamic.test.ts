import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, ...path.split("/")), "utf8");
}

describe("event inventory dynamic boundary", () => {
  test("event detail page shell does not fetch registration inventory", () => {
    const page = read("src/app/(public)/events/[slug]/page.tsx");
    expect(page).not.toContain("getEventPublicRegistrationInventory");
    expect(page).not.toContain("derivePublicEventRegistrationState");
    expect(page).not.toContain("buildCurrentPublicEventSlotOptions");
  });

  test("event detail page isolates inventory UI in Suspense children", () => {
    const page = read("src/app/(public)/events/[slug]/page.tsx");
    expect(page).toContain("Suspense");
    expect(page).toContain("EventInfoPanelInventory");
    expect(page).toContain("EventRegistrationSection");
  });

  test("event detail metadata keeps connection() but page shell does not", () => {
    const page = read("src/app/(public)/events/[slug]/page.tsx");
    const metadataBlock = page.slice(0, page.indexOf("export default"));
    const pageBlock = page.slice(page.indexOf("export default"));

    expect(metadataBlock).toContain("await connection()");
    expect(pageBlock).not.toContain("await connection()");
  });

  test("getEventPublicRegistrationInventory stays outside use cache producers", () => {
    const source = read("src/shared/domain/events/slot-queries.ts");
    const start = source.indexOf(
      "export async function getEventPublicRegistrationInventory",
    );
    const end = source.indexOf(
      "export async function getSlotRegistrationCounts",
    );
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const block = source.slice(start, end);
    expect(block).not.toContain('"use cache"');
  });

  test("inventory loader isolates connection() before inventory fetch", () => {
    const contextSource = read(
      "src/app/(public)/events/[slug]/_components/event-registration-context.ts",
    );
    expect(contextSource).toContain("await connection()");
    expect(contextSource).toContain("getEventPublicRegistrationInventory");
  });

  test("inventory UI components consume loadEventRegistrationContext", () => {
    for (const file of [
      "src/app/(public)/events/[slug]/_components/event-info-panel-inventory.tsx",
      "src/app/(public)/events/[slug]/_components/event-registration-section.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("loadEventRegistrationContext");
      expect(source).not.toContain("getEventPublicRegistrationInventory");
    }
  });
});
