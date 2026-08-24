/**
 * 一覧行の「削除」は `reservation:delete` で出し分ける（監査 A-53）。
 *
 * サーバ側の `deleteReservation` は `reservation:delete` を要求するのに、一覧行は
 * `canUpdate`（= `reservation:update`）で削除メニューを出していた。詳細ページは
 * 最初から `reservation:delete` で出し分けているので、同じ「予約を削除する」導線が
 * 画面ごとに別の権限キーで判定されていた。
 *
 * `reservation:delete` を降格すると、その瞬間に一覧では 削除 が見えて押すと
 * 「reservationのdelete権限がありません」になり、詳細ページでは最初から出ない、
 * という画面間の食い違いになる。
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: mock() }),
}));

mock.module("sonner", () => ({
  toast: { error: mock(), success: mock() },
}));

mock.module("@/admin/actions/reservation", () => ({
  deleteReservation: mock(() => Promise.resolve({})),
  restoreReservation: mock(() => Promise.resolve({})),
}));

/** ドロップダウンは開閉を挟まず、中身をそのまま描画する。 */
mock.module("@/admin/components/ActionDropdown", () => ({
  ActionDropdown: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  ActionDropdownItem: ({
    children,
    href,
  }: {
    children?: ReactNode;
    href?: string;
  }) => (href ? <a href={href}>{children}</a> : <button>{children}</button>),
  ActionDropdownSeparator: () => <hr />,
}));

mock.module("@/admin/components/DeleteConfirmDialog", () => ({
  DeleteConfirmDialog: ({ itemName }: { itemName: string }) => (
    <div data-testid="delete-dialog">{itemName}</div>
  ),
}));

const { ReservationActionCell } =
  await import("@/app/(admin)/admin/(dashboard)/reservations/_components/ReservationActionCell");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render(node: ReactNode): void {
  act(() => {
    root.render(node);
  });
}

describe("ReservationActionCell の権限出し分け（A-53）", () => {
  test("delete 権限が無ければ 削除 も確認ダイアログも出ない", () => {
    render(
      <ReservationActionCell
        reservationId="11111111-1111-4111-8111-111111111111"
        isDeleted={false}
        status={ReservationStatus.CONFIRMED}
        canUpdate
        canDelete={false}
      />,
    );

    expect(container.textContent).toContain("編集");
    expect(container.textContent).not.toContain("削除");
    expect(container.querySelector("[data-testid='delete-dialog']")).toBeNull();
  });

  test("delete 権限があれば 削除 が出る", () => {
    render(
      <ReservationActionCell
        reservationId="11111111-1111-4111-8111-111111111111"
        isDeleted={false}
        status={ReservationStatus.CONFIRMED}
        canUpdate
        canDelete
      />,
    );

    expect(container.textContent).toContain("削除");
    expect(
      container.querySelector("[data-testid='delete-dialog']"),
    ).not.toBeNull();
  });

  test("復元は update 権限のまま（delete 権限に引きずられない）", () => {
    render(
      <ReservationActionCell
        reservationId="11111111-1111-4111-8111-111111111111"
        isDeleted
        status={ReservationStatus.CONFIRMED}
        canUpdate
        canDelete={false}
      />,
    );

    expect(container.textContent).toContain("復元");
  });

  test("update 権限が無ければ 復元 は出ない", () => {
    render(
      <ReservationActionCell
        reservationId="11111111-1111-4111-8111-111111111111"
        isDeleted
        status={ReservationStatus.CONFIRMED}
        canUpdate={false}
        canDelete
      />,
    );

    expect(container.textContent).not.toContain("復元");
    expect(container.textContent).toContain("詳細");
  });
});
