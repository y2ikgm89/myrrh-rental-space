/**
 * @description CONFLICT 後の router.refresh() が CAS token だけを差し替える回帰テスト。
 *
 * 編集中の値は mount 時の useState 初期化子で凍結される。一方 submit 時に
 * `settings.organizationUpdatedAt` を prop から直接読んでいたため、CONFLICT で
 * `router.refresh()` を呼ぶと「mount 時の入力 + 新しい token」で再送でき、
 * 2 回目の保存で CAS が成立して他の管理者の変更を上書きしていた。
 *
 * ここで固定するのは「refresh で settings prop が新しくなっても、送る
 * expectedUpdatedAt は mount 時のまま」であること。
 *
 * `@/admin/actions/settings` は 40 近い export を持つが、ここでは
 * `updateBusinessHoursSettings` 1 つだけを返す部分 mock で足りる。
 * このテストの module graph でこの barrel を **値** import しているのは
 * BusinessHoursSection.tsx:27 の 1 本だけで、`business-hours-defaults.ts:1` と
 * `business-hours-validation.ts:1` は `import type`（`verbatimModuleSyntax: true`
 * で消える）だから。値 import が増えたらこの mock も増やすこと。
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installJSDOMForTests } from "../../../../setup-dom";
import { DEFAULT_BUSINESS_HOURS_WEEK } from "@/shared/lib/business-hours";
import type { MutationResult } from "@/shared/lib/mutation-result";
import type { Serialized } from "@/shared/lib/serialize";
import type { SettingsData } from "@/shared/domain/settings/types";

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
  updateBusinessHoursSettings: mockUpdate,
}));

type StubChildren = { children?: ReactNode };

// Radix (Select / Switch) を jsdom で動かさないための最小スタブ。
// refund-dialog.test.tsx / faq-item-template-select.test.tsx と同型。
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
  Select: ({ children }: StubChildren) => <div>{children}</div>,
  SelectContent: ({ children }: StubChildren) => <div>{children}</div>,
  SelectItem: ({ children }: StubChildren) => <div>{children}</div>,
  SelectTrigger: ({ children }: StubChildren) => <div>{children}</div>,
  SelectValue: () => <span />,
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
  Textarea: ({
    value,
    onChange,
    disabled,
  }: {
    value?: string;
    onChange?: (e: { target: { value: string } }) => void;
    disabled?: boolean;
  }) => (
    <textarea
      value={value}
      disabled={disabled}
      onChange={(e) => onChange?.({ target: { value: e.target.value } })}
    />
  ),
}));

const { BusinessHoursSection } =
  await import("@/app/(admin)/admin/(dashboard)/settings/_components/BusinessHoursSection");

const MOUNT_UPDATED_AT = "2026-08-15T08:00:00.000Z";
const REFRESHED_UPDATED_AT = "2026-08-15T09:00:00.000Z";

/**
 * BusinessHoursSection が読む settings の列は businessHours / holidayNotice /
 * organizationUpdatedAt の 3 つだけ。Serialized<SettingsData> の全列 (180 超) を
 * 書き起こしても本題が埋まるだけなので、必要な 3 列だけ持つオブジェクトを
 * prop 型に合わせる（このテスト専用の cast）。
 */
function buildSettings(
  organizationUpdatedAt: string,
): Serialized<SettingsData> {
  return {
    businessHours: DEFAULT_BUSINESS_HOURS_WEEK,
    holidayNotice: null,
    organizationUpdatedAt,
  } as unknown as Serialized<SettingsData>; // test-double
}

describe("BusinessHoursSection の楽観ロック token", () => {
  let container: HTMLDivElement;
  let root: Root;

  function findSaveButton(): HTMLButtonElement | undefined {
    return [...container.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "営業時間設定を保存",
    );
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
        <BusinessHoursSection
          settings={buildSettings(MOUNT_UPDATED_AT)}
          readOnly={false}
        />,
      );
    });

    await act(async () => {
      findSaveButton()?.click();
    });

    // CONFLICT を受けた router.refresh() で RSC が取り直され、新しい
    // organizationUpdatedAt が prop で届いた状態を再現する。
    // 同じ位置・同じ型なので client state (businessHours / holidayNotice) は保持される。
    await act(async () => {
      root.render(
        <BusinessHoursSection
          settings={buildSettings(REFRESHED_UPDATED_AT)}
          readOnly={false}
        />,
      );
    });

    await act(async () => {
      findSaveButton()?.click();
    });

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate.mock.calls[1][0].expectedUpdatedAt).toBe(
      MOUNT_UPDATED_AT,
    );
  });
});
