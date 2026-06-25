import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

function Passthrough({
  children,
  ...props
}: {
  children?: ReactNode;
  [key: string]: unknown;
}) {
  return <div {...props}>{children}</div>;
}

function FakeLexicalEditor({
  onChange,
}: {
  contentJson: string;
  onChange: (value: string) => void;
}) {
  return (
    <button
      type="button"
      data-testid="editor-change"
      onClick={() => onChange('{"root":{"children":[{"text":"changed"}]}}')}
    >
      change editor
    </button>
  );
}

mock.module("next/dynamic", () => ({
  default: () => FakeLexicalEditor,
}));

mock.module("@/admin/components/ui", () => ({
  Accordion: Passthrough,
  AccordionContent: Passthrough,
  AccordionItem: Passthrough,
  AccordionTrigger: Passthrough,
  Button: ({
    children,
    ...props
  }: {
    children?: ReactNode;
    [key: string]: unknown;
  }) => <button {...props}>{children}</button>,
  Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Card: Passthrough,
  CardContent: Passthrough,
  Input: (props: { [key: string]: unknown }) => <input {...props} />,
  Label: ({
    children,
    ...props
  }: {
    children?: ReactNode;
    [key: string]: unknown;
  }) => <label {...props}>{children}</label>,
  Select: ({
    children,
    ...props
  }: {
    children?: ReactNode;
    [key: string]: unknown;
  }) => <div {...props}>{children}</div>,
  SelectContent: Passthrough,
  SelectItem: ({
    children,
    ...props
  }: {
    children?: ReactNode;
    [key: string]: unknown;
  }) => <div {...props}>{children}</div>,
  SelectTrigger: Passthrough,
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
  SubmitButton: ({
    children,
    disabled,
    isPending,
    label,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    isPending?: boolean;
    label?: string;
  }) => (
    <button type="submit" disabled={Boolean(disabled || isPending)}>
      {children ?? label}
    </button>
  ),
  Switch: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    [key: string]: unknown;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
      {...props}
    />
  ),
  Textarea: (props: { [key: string]: unknown }) => <textarea {...props} />,
  Table: ({ children }: { children?: ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children?: ReactNode }) => (
    <tbody>{children}</tbody>
  ),
  TableCell: ({ children, ...props }: { children?: ReactNode }) => (
    <td {...props}>{children}</td>
  ),
  TableRow: ({ children, ...props }: { children?: ReactNode }) => (
    <tr {...props}>{children}</tr>
  ),
  // Dialog 系（IconPickerField 等の子 component が import）
  Dialog: Passthrough,
  DialogPortal: Passthrough,
  DialogOverlay: Passthrough,
  DialogClose: Passthrough,
  DialogTrigger: Passthrough,
  DialogContent: Passthrough,
  DialogHeader: Passthrough,
  DialogFooter: Passthrough,
  DialogTitle: Passthrough,
  DialogDescription: Passthrough,
  // Tabs 系（AutoSectionForm が content / design タブで使用）
  Tabs: Passthrough,
  TabsList: Passthrough,
  TabsTrigger: ({
    children,
    ...props
  }: {
    children?: ReactNode;
    [key: string]: unknown;
  }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  TabsContent: Passthrough,
}));

mock.module("next/image", () => ({
  default: (props: { [key: string]: unknown }) => <img alt="" {...props} />,
}));

mock.module("@/admin/hooks/use-media-picker", () => ({
  useSingleMediaPicker: () => ({
    openPicker: () => undefined,
    mediaPickerDialog: null,
  }),
}));

mock.module("@/admin/hooks/use-media-upload", () => ({
  useMediaUpload: () => ({
    uploadFile: () => Promise.resolve(null),
    isUploading: false,
  }),
}));

const { AutoSectionForm } =
  await import("@/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form");
const { featuresConfigSchema } =
  await import("@/shared/lib/sections/definitions/features/schema");
import type { PageSectionData } from "@/app/(admin)/admin/(dashboard)/_shared/actions/page-section-types";

function buildFeaturesSection(): PageSectionData {
  return {
    id: "section-test-id",
    pageId: "page-test-id",
    type: "features",
    // items 配列は空 (default []) — AutoArrayField が「追加」ボタンのみ描画
    config: featuresConfigSchema.parse({}),
    order: 0,
    isActive: true,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  };
}

describe("AutoSectionForm", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
  });

  // 旧 「CUSTOM section の Lexical 本文編集」test は削除済。
  // CUSTOM section の title + body は config field として AutoSectionForm の
  // 通常 textarea / text input で編集する canonical pattern に統合された
  // (Section.title / contentHtml / contentJson 列削除 migration 適用済)。

  // 配列フィールドの「追加」ボタンは conform 制御関数 (form.insert) を onClick で
  // 直接呼ぶ。button は type="button"（admin の SubmitButton 規約 = type="submit"
  // 直書き禁止 に準拠）。クリックで item が実際に追加されることを検証する
  // (regression guard: 追加ボタンが無反応だった silent bug)。
  test("配列フィールドの追加ボタンは type=button で、クリックすると item が追加される", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const localRoot = createRoot(container);
    root = localRoot;

    act(() => {
      localRoot.render(
        <AutoSectionForm
          section={buildFeaturesSection()}
          onSave={() => undefined}
          isPending={false}
        />,
      );
    });

    const findAddButton = () =>
      Array.from(container?.querySelectorAll("button") ?? []).find((button) =>
        button.textContent?.includes("追加"),
      );

    const addButton = findAddButton();
    expect(addButton).toBeDefined();
    // admin SubmitButton 規約: type="submit" 直書き禁止
    expect(addButton?.getAttribute("type")).toBe("button");

    // 初期は item ゼロ（空プレースホルダー表示）
    expect(container.textContent).toContain("アイテムが追加されていません");

    // クリック → conform form.insert → requestSubmit → intent 処理 → item 追加
    act(() => {
      addButton?.click();
    });

    // item が 1 件追加され、空プレースホルダーが消える
    expect(container.textContent).not.toContain("アイテムが追加されていません");
    expect(container.textContent).toContain("#1");
  });
});
