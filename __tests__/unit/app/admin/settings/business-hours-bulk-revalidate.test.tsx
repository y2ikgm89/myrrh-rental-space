/**
 * @description 営業時間の一括適用後に slotErrors が再検証される回帰テスト。
 *
 * 個別 mutator（handleIsOpenChange / handleSlotChange / handleAddSlot /
 * handleRemoveSlot）は state 更新内で `setSlotErrors(validateSlots(updated))`
 * するが、一括系の applyTemplateToAll / copyToAllDays にはそれが無く、
 * 直したはずのエラーが残る / 新しいエラーが出ない。
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

mock.module("@/admin/actions/settings", () => ({
  updateBusinessHoursSettings: mock(async () => ({})),
}));

type StubChildren = { children?: ReactNode };

// Radix (Select / Switch) を jsdom で動かさないための最小スタブ。
// Select 系だけはテンプレート選択を駆動できるよう native <select> にする。
mock.module("@/admin/components/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    title,
  }: StubChildren & {
    onClick?: () => void;
    disabled?: boolean;
    title?: string;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled} title={title}>
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
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children?: ReactNode;
    onValueChange?: (v: string) => void;
    value?: string;
  }) => (
    <select value={value} onChange={(e) => onValueChange?.(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: StubChildren) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: StubChildren) => <>{children}</>,
  SelectItem: ({ children, value }: StubChildren & { value: string }) => (
    <option value={value}>{children}</option>
  ),
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

/**
 * BusinessHoursSection が読む settings の列は businessHours / holidayNotice /
 * organizationUpdatedAt の 3 つだけ。Serialized<SettingsData> の全列 (180 超) を
 * 書き起こしても本題が埋まるだけなので、必要な 3 列だけ持つオブジェクトを
 * prop 型に合わせる（このテスト専用の cast）。
 */
function buildSettings(): Serialized<SettingsData> {
  return {
    businessHours: DEFAULT_BUSINESS_HOURS_WEEK,
    holidayNotice: null,
    organizationUpdatedAt: "2026-08-15T08:00:00.000Z",
  } as unknown as Serialized<SettingsData>;
}

const CLOSE_BEFORE_OPEN_ERROR = "終了は開始より後";

describe("BusinessHoursSection の一括適用後の再検証", () => {
  let container: HTMLDivElement;
  let root: Root;

  function dayBlocks(): HTMLDivElement[] {
    return [...container.querySelectorAll("div.rounded-lg.border")].filter(
      (el): el is HTMLDivElement => el instanceof HTMLDivElement,
    );
  }

  function timeInputsOf(block: Element): HTMLInputElement[] {
    return [...block.querySelectorAll("input")].filter(
      (el): el is HTMLInputElement =>
        el instanceof HTMLInputElement && el.type !== "checkbox",
    );
  }

  function setInputValue(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!setter) {
      throw new Error("HTMLInputElement value setter is missing");
    }
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function renderSection(): Promise<void> {
    await act(async () => {
      root.render(
        <BusinessHoursSection settings={buildSettings()} readOnly={false} />,
      );
    });
  }

  /** 月曜（最初の曜日ブロック）の closeTime を openTime より前にしてエラーを出す */
  async function makeMondayCloseBeforeOpen(): Promise<void> {
    const monday = dayBlocks()[0];
    if (!monday) throw new Error("月曜日のブロックが見つからない");
    const closeTime = timeInputsOf(monday)[1];
    if (!closeTime) throw new Error("月曜の終了時刻 input が見つからない");
    await act(async () => {
      setInputValue(closeTime, "08:00");
    });
  }

  beforeEach(() => {
    installJSDOMForTests();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("copyToAllDays の後にスロットエラーが再検証される", async () => {
    await renderSection();
    await makeMondayCloseBeforeOpen();
    expect(container.textContent).toContain(CLOSE_BEFORE_OPEN_ERROR);

    const copyButtons = [...container.querySelectorAll("button")].filter(
      (b) => b.title === "この設定を全曜日にコピー",
    );
    const secondOpenDayCopy = copyButtons[1];
    if (!secondOpenDayCopy) {
      throw new Error("2 番目の営業曜日のコピーボタンが見つからない");
    }

    await act(async () => {
      secondOpenDayCopy.click();
    });

    expect(container.textContent).not.toContain(CLOSE_BEFORE_OPEN_ERROR);
  });

  test("applyTemplateToAll の後にスロットエラーが再検証される", async () => {
    await renderSection();
    await makeMondayCloseBeforeOpen();
    expect(container.textContent).toContain(CLOSE_BEFORE_OPEN_ERROR);

    const templateSelect = [...container.querySelectorAll("select")].find(
      (el) => [...el.options].some((option) => option.value === "lunch-break"),
    );
    if (!templateSelect) {
      throw new Error("テンプレート select が見つからない");
    }

    await act(async () => {
      templateSelect.value = "lunch-break";
      templateSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const applyButton = [...container.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "全曜日に適用",
    );
    if (!applyButton) throw new Error("全曜日に適用ボタンが見つからない");

    await act(async () => {
      applyButton.click();
    });

    expect(container.textContent).not.toContain(CLOSE_BEFORE_OPEN_ERROR);
  });
});
