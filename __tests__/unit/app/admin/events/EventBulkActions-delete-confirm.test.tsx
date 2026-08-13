/**
 * @description イベント一括削除に確認ダイアログを挟む回帰テスト。
 *
 * 一括削除ボタンは押した瞬間に `bulkSoftDeleteEvents` を呼んでいた。
 * soft delete なので公開ページと管理一覧の両方から消え、管理画面には
 * 復元導線が無い。同じバーの「一括キャンセル」（より軽い操作）には確認が
 * あり、削除にだけ無かった。
 *
 * ここで固定するのは「押しただけでは Server Action を呼ばない」こと。
 * ダイアログの見た目ではなく、破壊的呼び出しが確認の後ろにあることが本題。
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installJSDOMForTests } from "../../../../setup-dom";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

mock.module("sonner", () => ({
  toast: { success: mock(() => undefined), error: mock(() => undefined) },
  Toaster: () => null,
}));

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: mock(() => undefined) }),
}));

const mockBulkSoftDelete = mock<(ids: string[]) => Promise<{ count: number }>>(
  () => Promise.resolve({ count: 2 }),
);
const mockBulkPublish = mock<
  (
    ids: string[],
    publish: boolean,
  ) => Promise<{ count: number; isPublished: boolean; skipped: number }>
>(() => Promise.resolve({ count: 0, isPublished: true, skipped: 0 }));
const mockBulkSetStatus = mock<
  (
    ids: string[],
    status: string,
  ) => Promise<{ count: number; rejectedIds: string[] }>
>(() => Promise.resolve({ count: 0, rejectedIds: [] }));

mock.module("@/admin/actions/event/bulk", () => ({
  bulkSoftDeleteEvents: mockBulkSoftDelete,
  bulkPublishEvents: mockBulkPublish,
  bulkSetStatusEvents: mockBulkSetStatus,
}));

const { EventBulkActions } =
  await import("@/app/(admin)/admin/(dashboard)/events/_components/EventBulkActions");

let container: HTMLDivElement;
let root: Root;

function findButton(label: string): HTMLElement | undefined {
  return [...document.body.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
}

beforeEach(() => {
  installJSDOMForTests();
  mockBulkSoftDelete.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <EventBulkActions
        selectedIds={["event-1", "event-2"]}
        onClear={() => undefined}
      />,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("EventBulkActions の一括削除", () => {
  test("ボタンを押しただけでは削除 action を呼ばない", () => {
    const deleteButton = findButton("一括削除");
    expect(deleteButton).toBeDefined();

    act(() => deleteButton?.click());

    expect(mockBulkSoftDelete).not.toHaveBeenCalled();
  });

  test("確認ダイアログの実行ボタンを押して初めて削除する", () => {
    act(() => findButton("一括削除")?.click());

    // AlertDialog は portal に出るので document 全体から探す。
    const confirm = findButton("削除");
    expect(confirm).toBeDefined();

    act(() => confirm?.click());

    expect(mockBulkSoftDelete).toHaveBeenCalledTimes(1);
    expect(mockBulkSoftDelete.mock.calls[0]?.[0]).toEqual([
      "event-1",
      "event-2",
    ]);
  });
});
