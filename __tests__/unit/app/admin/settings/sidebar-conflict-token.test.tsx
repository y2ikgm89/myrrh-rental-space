/**
 * @description CONFLICT 後の router.refresh() が CAS token だけを差し替える回帰テスト。
 *
 * 編集中の値は mount 時の useState 初期化子で凍結される。一方 submit 時に
 * `settings.sidebarUpdatedAt` を prop から直接読んでいたため、CONFLICT で
 * `router.refresh()` を呼ぶと「mount 時の入力 + 新しい token」で再送でき、
 * 2 回目の保存で CAS が成立して他の管理者の変更を上書きしていた。
 *
 * ここで固定するのは「refresh で settings prop が新しくなっても、送る
 * expectedUpdatedAt は mount 時のまま」であること。
 *
 * `@/admin/actions/settings` は 40 近い export を持つが、ここでは
 * `updateSidebarSettings` 1 つだけを返す部分 mock で足りる。
 * このテストの module graph でこの barrel を **値** import しているのは
 * SidebarSection.tsx の 1 本だけ。値 import が増えたらこの mock も増やすこと。
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installJSDOMForTests } from "../../../../setup-dom";
import { DEFAULT_SIDEBAR_WIDGETS } from "@/shared/lib/validations/sidebar";
import type { MutationResult } from "@/shared/lib/mutation-result";
import type { Serialized } from "@/shared/lib/serialize";
import type { SettingsData } from "@/shared/domain/settings/types";
import { nthCall } from "../../../../support/definite";

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

type SavePayload = { expectedUpdatedAt: string };

const CONFLICT_RESULT: MutationResult = {
  error: "他のユーザーにより更新されています。ページを再読み込みしてください",
  code: "CONFLICT",
};

const mockUpdate = mock((_payload: SavePayload): Promise<MutationResult> =>
  Promise.resolve(CONFLICT_RESULT),
);

mock.module("@/admin/actions/settings", () => ({
  updateSidebarSettings: mockUpdate,
}));

type StubChildren = { children?: ReactNode };

// Radix (Switch / Accordion / ToggleGroup) を jsdom で動かさないための最小スタブ。
// business-hours-conflict-token.test.tsx と同型。
mock.module("@/admin/components/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: StubChildren & { onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Card: ({ children }: StubChildren) => <div>{children}</div>,
  CardContent: ({ children }: StubChildren) => <div>{children}</div>,
  CardDescription: ({ children }: StubChildren) => <p>{children}</p>,
  CardHeader: ({ children }: StubChildren) => <div>{children}</div>,
  CardTitle: ({ children }: StubChildren) => <h2>{children}</h2>,
  Input: ({
    value,
    onChange,
    disabled,
  }: {
    value?: string;
    onChange?: (e: { target: { value: string } }) => void;
    disabled?: boolean;
  }) => (
    <input
      value={value}
      disabled={disabled}
      onChange={(e) => onChange?.({ target: { value: e.target.value } })}
    />
  ),
  Label: ({ children }: StubChildren) => <label>{children}</label>,
  SubmitButton: ({
    isPending,
    label,
    onClick,
    disabled,
  }: {
    isPending: boolean;
    label: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={isPending || disabled}>
      {label}
    </button>
  ),
  Switch: ({
    checked,
    onCheckedChange,
    disabled,
  }: {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
  Alert: ({ children }: StubChildren) => <div>{children}</div>,
  AlertTitle: ({ children }: StubChildren) => <div>{children}</div>,
  AlertDescription: ({ children }: StubChildren) => <div>{children}</div>,
  ToggleGroup: ({ children }: StubChildren) => <div>{children}</div>,
  ToggleGroupItem: ({ children }: StubChildren) => (
    <button type="button">{children}</button>
  ),
}));

mock.module("@/admin/components/ui/accordion", () => ({
  Accordion: ({ children }: StubChildren) => <div>{children}</div>,
  AccordionItem: ({ children }: StubChildren) => <div>{children}</div>,
  AccordionTrigger: ({ children }: StubChildren) => (
    <button type="button">{children}</button>
  ),
  AccordionContent: ({ children }: StubChildren) => <div>{children}</div>,
}));

mock.module("@/admin/components/DeleteConfirmDialog", () => ({
  DeleteConfirmDialog: () => <div />,
}));

const SIDEBAR_DIR =
  "@/app/(admin)/admin/(dashboard)/settings/_components/sections/sidebar";

mock.module(`${SIDEBAR_DIR}/SidebarWidgetGrid`, () => ({
  SidebarWidgetGrid: () => <div />,
}));

mock.module(`${SIDEBAR_DIR}/SidebarWidgetDialog`, () => ({
  SidebarWidgetDialog: () => <div />,
}));

mock.module(`${SIDEBAR_DIR}/SidebarWidgetCard`, () => ({
  SidebarWidgetCard: () => <div />,
  getWidgetId: (w: { type: string; id?: string }) =>
    w.type === "custom" ? (w.id ?? "custom") : w.type,
}));

const { SidebarSection } =
  await import("@/app/(admin)/admin/(dashboard)/settings/_components/sections/SidebarSection");

const MOUNT_UPDATED_AT = "2026-08-15T08:00:00.000Z";
const REFRESHED_UPDATED_AT = "2026-08-15T09:00:00.000Z";

/**
 * SidebarSection が読む settings の列は sidebarEnabled / sidebarWidgets /
 * sidebarRecentCount / sidebarPopularCount / sidebarTocEnabled /
 * sidebarUpdatedAt の 6 つだけ。Serialized<SettingsData> の全列を
 * 書き起こしても本題が埋まるだけなので、必要な列だけ持つオブジェクトを
 * prop 型に合わせる（このテスト専用の cast）。
 */
function buildSettings(sidebarUpdatedAt: string): Serialized<SettingsData> {
  return {
    sidebarEnabled: true,
    sidebarWidgets: DEFAULT_SIDEBAR_WIDGETS,
    sidebarRecentCount: 5,
    sidebarPopularCount: 5,
    sidebarTocEnabled: false,
    sidebarUpdatedAt,
  } as unknown as Serialized<SettingsData>; // test-double
}

describe("SidebarSection の楽観ロック token", () => {
  let container: HTMLDivElement;
  let root: Root;

  function findSaveButton(): HTMLButtonElement | undefined {
    return [...container.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "サイドバー設定を保存",
    );
  }

  function findSidebarToggle(): HTMLInputElement | undefined {
    const el = container.querySelector("input[type='checkbox']");
    return el instanceof HTMLInputElement ? el : undefined;
  }

  beforeEach(() => {
    installJSDOMForTests();
    mockUpdate.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("CONFLICT 後に settings prop が新しくなっても、再送する expectedUpdatedAt は mount 時のまま", async () => {
    await act(async () => {
      root.render(
        <SidebarSection
          settings={buildSettings(MOUNT_UPDATED_AT)}
          readOnly={false}
        />,
      );
    });

    // 保存ボタンは isDirty で無効。トグルして dirty にしてから送る。
    // isDirty 自体は本題ではない（refresh 後は常に true になりガードにならない）。
    await act(async () => {
      findSidebarToggle()?.click();
    });

    await act(async () => {
      findSaveButton()?.click();
    });

    // CONFLICT を受けた router.refresh() で RSC が取り直され、新しい
    // sidebarUpdatedAt が prop で届いた状態を再現する。
    // 同じ位置・同じ型なので client state (widgets / toggles) は保持される。
    await act(async () => {
      root.render(
        <SidebarSection
          settings={buildSettings(REFRESHED_UPDATED_AT)}
          readOnly={false}
        />,
      );
    });

    await act(async () => {
      findSaveButton()?.click();
    });

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(nthCall(mockUpdate, 1, "mockUpdate")[0].expectedUpdatedAt).toBe(
      MOUNT_UPDATED_AT,
    );
  });
});
