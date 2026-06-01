import { describe, expect, test } from "bun:test";
import {
  toggleExpanded,
  withActiveExpanded,
} from "@/admin/components/editor/comment-panel/comment-panel-state";
import type { ThreadListItem } from "@/admin/types/editor-comment";

const thread = (id: string, markId: string): ThreadListItem => ({
  id,
  markId,
  quotedText: "quote",
  status: "ACTIVE",
  commentCount: 1,
  createdAt: "2026-06-01T00:00:00.000Z",
  createdByName: "田中",
});

describe("toggleExpanded", () => {
  test("未展開 id を追加する", () => {
    expect([...toggleExpanded(new Set(), "a")]).toEqual(["a"]);
  });
  test("展開済み id を除去する", () => {
    expect([...toggleExpanded(new Set(["a", "b"]), "a")]).toEqual(["b"]);
  });
  test("入力 Set を破壊しない", () => {
    const src = new Set(["a"]);
    toggleExpanded(src, "b");
    expect([...src]).toEqual(["a"]);
  });
});

describe("withActiveExpanded", () => {
  test("activeMarkId に一致する thread を展開集合に追加する", () => {
    const threads = [thread("t1", "m1"), thread("t2", "m2")];
    expect([...withActiveExpanded(new Set(), "m2", threads)]).toEqual(["t2"]);
  });
  test("activeMarkId が null なら変更しない", () => {
    const threads = [thread("t1", "m1")];
    expect([...withActiveExpanded(new Set(["t1"]), null, threads)]).toEqual([
      "t1",
    ]);
  });
  test("一致 thread が無ければ変更しない", () => {
    const threads = [thread("t1", "m1")];
    expect([...withActiveExpanded(new Set(), "zzz", threads)]).toEqual([]);
  });
  test("既存の展開を保持しつつ active を追加する", () => {
    const threads = [thread("t1", "m1"), thread("t2", "m2")];
    const result = withActiveExpanded(new Set(["t1"]), "m2", threads);
    expect([...result].sort()).toEqual(["t1", "t2"]);
  });
});
