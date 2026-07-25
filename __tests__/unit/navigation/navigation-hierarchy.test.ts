import { describe, expect, test } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";
import { assertValidNavigationParent } from "@/shared/domain/navigation/commands";
import {
  computeOrderWithNesting,
  flatItemHasChildren,
  getSubtreeBlockSize,
  reorderFlatWithSubtree,
} from "@/app/(admin)/admin/(dashboard)/settings/appearance/_components/navigation/navigation-utils";
import type { FlatNavigationItem } from "@/app/(admin)/admin/(dashboard)/settings/appearance/_components/navigation/types";

const span = (text: string) => [{ _key: "k1", _type: "span" as const, text }];

function flatItem(
  id: string,
  depth: 0 | 1,
  overrides: Partial<FlatNavigationItem> = {},
): FlatNavigationItem {
  return {
    id,
    type: "HEADER_DESKTOP",
    label: span(id),
    url: "/",
    isExternal: false,
    order: 0,
    isActive: true,
    parentId: depth === 1 ? "parent" : null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    children: [],
    isChild: depth === 1,
    depth,
    ...overrides,
  };
}

describe("navigation subtree reorder", () => {
  test("getSubtreeBlockSize counts root and contiguous children", () => {
    const items = [
      flatItem("A", 0),
      flatItem("a1", 1, { parentId: "A" }),
      flatItem("a2", 1, { parentId: "A" }),
      flatItem("B", 0),
    ];

    expect(getSubtreeBlockSize(items, 0)).toBe(3);
    expect(getSubtreeBlockSize(items, 3)).toBe(1);
    expect(flatItemHasChildren(items, 0)).toBe(true);
    expect(flatItemHasChildren(items, 3)).toBe(false);
  });

  test("reorderFlatWithSubtree moves root and children together", () => {
    const items = [
      flatItem("A", 0),
      flatItem("a1", 1, { parentId: "A" }),
      flatItem("B", 0),
      flatItem("C", 0),
    ];

    const reordered = reorderFlatWithSubtree(items, 0, 2);
    expect(reordered.map((item) => item.id)).toEqual(["B", "A", "a1", "C"]);
  });
});

describe("computeOrderWithNesting", () => {
  test("keeps subtree children attached when parent root moves", () => {
    const reordered = [
      flatItem("B", 0),
      flatItem("A", 0),
      flatItem("a1", 1, { parentId: "A" }),
      flatItem("C", 0),
    ];

    const updates = computeOrderWithNesting(reordered, "A", 0, 0);
    const byId = new Map(updates.map((update) => [update.id, update]));

    expect(byId.get("A")).toEqual({
      id: "A",
      order: 1,
      parentId: null,
    });
    expect(byId.get("a1")).toEqual({
      id: "a1",
      order: 2,
      parentId: "A",
    });
  });

  test("does not nest a root that still has children when indented horizontally", () => {
    const reordered = [
      flatItem("A", 0),
      flatItem("a1", 1, { parentId: "A" }),
      flatItem("B", 0),
    ];

    const updates = computeOrderWithNesting(reordered, "A", 60, 0);
    const byId = new Map(updates.map((update) => [update.id, update]));

    expect(byId.get("A")?.parentId).toBeNull();
    expect(byId.get("a1")?.parentId).toBe("A");
  });
});

describe("assertValidNavigationParent", () => {
  test("accepts null parent", () => {
    expect(() =>
      assertValidNavigationParent({
        type: "HEADER_MOBILE",
        parentId: null,
        parent: null,
        itemHasChildren: false,
      }),
    ).not.toThrow();
  });

  test("rejects missing parent", () => {
    expect(() =>
      assertValidNavigationParent({
        type: "HEADER_MOBILE",
        parentId: "00000000-0000-4000-8000-000000000001",
        parent: null,
        itemHasChildren: false,
      }),
    ).toThrow(DomainError);
  });

  test("rejects parent with mismatched type", () => {
    expect(() =>
      assertValidNavigationParent({
        type: "HEADER_MOBILE",
        parentId: "00000000-0000-4000-8000-000000000002",
        parent: {
          id: "00000000-0000-4000-8000-000000000002",
          type: "HEADER_DESKTOP",
          parentId: null,
        },
        itemHasChildren: false,
      }),
    ).toThrow("親ナビゲーションの種別が一致しません");
  });

  test("rejects nested parent (depth > 0)", () => {
    expect(() =>
      assertValidNavigationParent({
        type: "HEADER_DESKTOP",
        parentId: "00000000-0000-4000-8000-000000000003",
        parent: {
          id: "00000000-0000-4000-8000-000000000003",
          type: "HEADER_DESKTOP",
          parentId: "00000000-0000-4000-8000-000000000004",
        },
        itemHasChildren: false,
      }),
    ).toThrow("親はトップレベルの項目のみ指定できます");
  });

  test("rejects nesting an item that has children", () => {
    expect(() =>
      assertValidNavigationParent({
        type: "HEADER_DESKTOP",
        parentId: "00000000-0000-4000-8000-000000000005",
        parent: {
          id: "00000000-0000-4000-8000-000000000005",
          type: "HEADER_DESKTOP",
          parentId: null,
        },
        itemHasChildren: true,
      }),
    ).toThrow("子メニューがある項目はサブメニューにできません");
  });
});
