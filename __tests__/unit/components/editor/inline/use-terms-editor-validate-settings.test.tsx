/**
 * @description useTermsEditor → buildTermsSettingsFormData の実値渡しを固定する。
 *
 * 既存の helper 単体テストは container=null のとき values.slug / title が
 * FormData に載ることだけを見る。こちらは hook が validateSettings 経由で
 * その values に conform defaultValue（= terms.slug / title）を渡すことを固定する。
 * helper の null-container slug/title ブロックを外すと、このテストだけが赤くなる。
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installJSDOMForTests } from "../../../../setup-dom";
import type { AdminTermsDetail } from "@/shared/domain/terms/admin-queries";
import { TermsScope } from "@/shared/lib/validations/enums/prisma-types";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

mock.module("sonner", () => ({
  toast: { success: mock(() => undefined), error: mock(() => undefined) },
  Toaster: () => null,
}));

mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: mock(() => undefined),
    refresh: mock(() => undefined),
  }),
}));

mock.module("@/admin/actions/terms", () => ({
  createTerms: mock(() => Promise.resolve({ id: "unused" })),
  updateTerms: mock(() => Promise.resolve({ id: "unused" })),
  deleteTerms: mock(() => Promise.resolve({ id: "unused" })),
}));

// useEditorCore がマウント時に useConfirm() を呼ぶ。ConfirmProvider を載せる
// と AlertDialog（Radix）まで引き込むので、既存 Lexical テストと同じ stub。
mock.module("@/admin/contexts/confirm-context", () => ({
  useConfirm: () => mock(async () => true),
}));

const { useTermsEditor } =
  await import("@/admin/components/editor/inline/hooks/use-terms-editor");

const TERMS: AdminTermsDetail = {
  id: "00000000-0000-4000-8000-000000000001",
  type: "terms-of-use",
  slug: "kiyaku",
  title: "利用規約",
  contentJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
  contentHtml: "",
  isPublished: true,
  publishedAt: "2026-01-01T00:00:00.000Z",
  scopes: [TermsScope.RESERVATION],
  changelog: null,
  showInFooter: true,
  displayOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
};

describe("useTermsEditor.validateSettings", () => {
  let container: HTMLDivElement;
  let root: Root;
  const latest: { current: ReturnType<typeof useTermsEditor> | null } = {
    current: null,
  };

  function Harness() {
    latest.current = useTermsEditor({ mode: "edit", terms: TERMS });
    return null;
  }

  beforeEach(() => {
    installJSDOMForTests();
    latest.current = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("設定ダイアログ未マウントでも hook の slug / title 実値で validateSettings が success する", async () => {
    await act(async () => {
      root.render(<Harness />);
    });

    const parsed = latest.current?._test.validateSettings() ?? null;

    expect(parsed?.slug).toBe(TERMS.slug);
    expect(parsed?.title).toBe(TERMS.title);
  });
});
