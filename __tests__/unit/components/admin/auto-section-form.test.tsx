import { afterEach, describe, expect, mock, test } from "bun:test";
import { z } from "zod";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

/**
 * design-system component 専用の prop（`forceMount` / `onValueChange` 等）を
 * そのまま DOM 要素へ渡すと React が警告を `console.error` に出し、
 * `__tests__/helpers/console-guard.ts` が落とす。DOM に意味があるのは
 * 属性形の prop だけなので、それだけ通す。
 */
function domSafeProps(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).filter(
      ([key]) =>
        key.startsWith("data-") ||
        key.startsWith("aria-") ||
        key === "className" ||
        key === "id" ||
        key === "role",
    ),
  );
}

function Passthrough({
  children,
  ...props
}: {
  children?: ReactNode;
  [key: string]: unknown;
}) {
  return <div {...domSafeProps(props)}>{children}</div>;
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
  }) => <div {...domSafeProps(props)}>{children}</div>,
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
const { ctaConfigSchema } =
  await import("@/shared/lib/sections/definitions/cta/schema");
const { formatZodFieldErrors } =
  await import("@/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form/helpers");
const { getArrayItemShape, getSelectOptions } =
  await import("@/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/zod-introspection");
const { conceptConfigSchema } =
  await import("@/shared/lib/sections/definitions/concept/schema");
import type { PageSectionData } from "@/app/(admin)/admin/(dashboard)/_shared/actions/page-section-types";

function buildFeaturesSection(): PageSectionData {
  return {
    id: "section-test-id",
    pageId: "page-test-id",
    type: "features",
    // items 配列は空 (default []) — AutoArrayField が「追加」ボタンのみ描画
    config: featuresConfigSchema.parse({}),
    configUnreadable: false,
    order: 0,
    isActive: true,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  };
}

/** buttons 配列を持つ section。url は必須かつ内部パスのみ許可される。 */
function buildCtaSection(): PageSectionData {
  return {
    id: "section-cta-id",
    pageId: "page-test-id",
    type: "cta",
    config: ctaConfigSchema.parse({}),
    configUnreadable: false,
    order: 0,
    isActive: true,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  };
}

/** group フィールド（画像グループ）を持つ section。 */
function buildConceptSection(): PageSectionData {
  return {
    id: "section-concept-id",
    pageId: "page-test-id",
    type: "concept",
    config: conceptConfigSchema.parse({}),
    configUnreadable: false,
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

  // 配列アイテムを追加したとき、select フィールドに `""` を入れないことを固定する。
  //
  // 壊れていたとき（監査 F-34）: `createEmptyItem()` が itemFields 全キーに `""` を
  // 入れていた。`z.enum(...).default(...)` の `ZodDefault` は input が `undefined`
  // のときしか発火しないので、`""` は enum に素通りして `safeParse` が失敗する。
  // conform は `status !== "success"` で submit を止めるため、ボタンを 1 件足した
  // だけで**そのセクション全体が保存不能**になる。エラーキーは
  // `buttons.0.variant` で conform の name と一致せず、画面には何も出ない。
  test("配列アイテム追加時、select には有効な enum 値が入る", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const localRoot = createRoot(container);
    root = localRoot;

    act(() => {
      localRoot.render(
        <AutoSectionForm
          section={buildCtaSection()}
          onSave={() => undefined}
          isPending={false}
        />,
      );
    });

    const addButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("追加"),
    );
    expect(addButton).toBeDefined();

    act(() => {
      addButton?.click();
    });

    // 期待値は**スキーマから取る**。両側を手で書くと同じ思い込みで書けてしまう。
    const buttonsSchema = ctaConfigSchema.shape["buttons"];
    expect(buttonsSchema).toBeDefined();
    const itemShape = getArrayItemShape(buttonsSchema as z.ZodType);
    expect(itemShape).toBeDefined();
    const variantSchema = itemShape?.["variant"];
    expect(variantSchema).toBeDefined();
    const allowed = getSelectOptions(variantSchema as z.ZodType);
    expect(allowed.length).toBeGreaterThan(0);

    const variantInput = container.querySelector<HTMLInputElement>(
      'input[name="buttons[0].variant"]',
    );
    expect(variantInput).not.toBeNull();
    // ここが "" だと enum に弾かれ、保存ボタンが無反応になる。
    // input が無いときも `""` になるので、その場合もここで落ちる。
    expect(allowed).toContain(variantInput?.value ?? "");
  });

  // group を折りたたんでも input が DOM に残ることを固定する。
  //
  // 壊れていたとき（監査 F-35）: `{isOpen && (<CardContent …>)}` で unmount して
  // いた。conform は送信時の FormData から payload を組むので、折りたたんだまま
  // 保存すると `image.url` / `image.alt` が 1 件も入らない。schema 側の
  // `.prefault({})` が `{url:"",alt:""}` を補って **parse は成功する**ため、
  // `submission.status === "success"` のまま onSave に到達し、**選択済みの画像 URL が
  // 空文字で上書き保存される**。エラーも警告も出ない。
  test("group を折りたたんでも sub-field の input は DOM に残る", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const localRoot = createRoot(container);
    root = localRoot;

    act(() => {
      localRoot.render(
        <AutoSectionForm
          section={buildConceptSection()}
          onSave={() => undefined}
          isPending={false}
        />,
      );
    });

    const countGroupInputs = () =>
      container?.querySelectorAll('[name^="image."]').length ?? 0;

    // 前提: 展開状態では sub-field が描画されている（gate が空振りしていない）。
    expect(countGroupInputs()).toBeGreaterThan(0);

    const toggle = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("画像"),
    );
    expect(toggle).toBeDefined();

    // click が起こす state 更新には非同期に解決するものがある（conform の
    // form observation）。同期 act だとそれが act の外で流れ、React が
    // `not wrapped in act(...)` を出す。async act で microtask まで排水する。
    await act(async () => {
      toggle?.click();
    });

    // 折りたたみは表示だけの操作。input は残る。
    expect(countGroupInputs()).toBeGreaterThan(0);
  });

  // 配列アイテムのエラーキーが、conform が実際に描画する input の `name` と
  // 一致することを固定する。
  //
  // 壊れていたとき: `formatZodFieldErrors` が zod の path `["buttons",0,"url"]` を
  // `buttons.0.url` にしていた。conform の name は `buttons[0].url` なので
  // `field.errors` は空のままで、エラーは 1 文字も描画されない。さらに conform は
  // status !== "success" で submit を止めるため **保存ボタンが無反応**になる。
  // 画面には「未保存の変更があります」だけが残り、原因を示すものが何も無い。
  //
  // 期待値は**描画された DOM から取る**。両側を手で書くと、同じ思い込みで
  // 両方書けてしまい drift を検出できない（それが元の欠陥の作られ方だった）。
  //
  // なお submit を流して「エラー文言が出ること」までは、この環境では見られない。
  // jsdom 側の制約で `new FormData(form)` が空を返し、form 内に 25 個の input が
  // あっても conform の `parse` に何も渡らないため、検証が常に成功してしまう。
  test("配列アイテムのエラーキーが conform の field name と一致する", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const localRoot = createRoot(container);
    root = localRoot;

    act(() => {
      localRoot.render(
        <AutoSectionForm
          section={buildCtaSection()}
          onSave={() => undefined}
          isPending={false}
        />,
      );
    });

    // ボタンを 1 件追加して、配列アイテムの input を描画させる。
    const addButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("追加"),
    );
    act(() => {
      addButton?.click();
    });

    const renderedName = Array.from(
      container.querySelectorAll<HTMLInputElement>("input[name]"),
    )
      .map((input) => input.name)
      .find((name) => name.endsWith("url"));
    // gate 自体が空振りしていないこと（描画されていなければ以降は無意味）。
    expect(renderedName).toBeDefined();
    if (renderedName === undefined) return;

    // 同じ入力を schema に流して、エラーキーを作らせる。
    const invalid = {
      ...ctaConfigSchema.parse({}),
      buttons: [{ url: "https://example.com" }],
    };
    const result = ctaConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(Object.keys(formatZodFieldErrors(result.error))).toContain(
      renderedName,
    );
  });

  test("path 無しの Zod issue は form レベルキーに落ちる", () => {
    const error = new z.ZodError([
      { code: "custom", path: [], message: "form-level" },
    ]);
    expect(formatZodFieldErrors(error)).toEqual({ "": ["form-level"] });
  });
});
