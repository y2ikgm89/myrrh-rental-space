/**
 * @description `SpaceEditForm` の「設備リスト読み取り失敗ガード」の回帰テスト。
 *
 * このフォームは設備 1 件につき hidden input を 1 つしか出さない。DB の
 * `Space.facilities` が読めないまま空リストで start すると、価格や説明文だけを
 * 直して保存した操作で `Space.facilities` が空配列に上書きされる。
 * サイドバー設定（`SidebarSection` の `storedWidgetsInvalid`）と同じく、
 * 読めなかった間は保存を止め、操作者が消失を了承したときだけ解禁する。
 *
 * タブの中身は本題ではないので stub 化し、フォーム外殻（警告 Alert と送信ボタンの
 * 活性）だけを実際に描画して検証する。
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installJSDOMForTests } from "../../../../setup-dom";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

// ---------------------------------------------------------------------------
// Mocks — Server Action / URL state / Lexical エディタ / 各タブは本題ではない。
// SubmitButton・Alert・Button は本物を使う（disabled の配線が検証対象のため）。
// ---------------------------------------------------------------------------

mock.module("sonner", () => ({
  toast: { success: mock(() => undefined), error: mock(() => undefined) },
  Toaster: () => null,
}));

mock.module("next/link", () => ({
  default: ({ children, href }: { children?: ReactNode; href: string }) => (
    <a href={String(href)}>{children}</a>
  ),
}));

// nuqs は adapter context 前提なので丸ごと stub。barrel 経由で読み込まれる
// 他コンポーネントも同じ module を参照するため、使われている export は全部生やす。
type ParserStub = {
  withDefault: (value: unknown) => ParserStub;
  withOptions: (options: unknown) => ParserStub;
};
function parserStub(): ParserStub {
  const stub: ParserStub = {
    withDefault: () => stub,
    withOptions: () => stub,
  };
  return stub;
}

mock.module("nuqs", () => ({
  parseAsStringLiteral: parserStub,
  parseAsString: parserStub(),
  parseAsInteger: parserStub(),
  useQueryState: () => ["basic", async () => null],
  useQueryStates: () => [{}, async () => null],
  debounce: (value: unknown) => value,
}));

mock.module("@/admin/actions/space", () => ({
  createSpaceAction: async () => undefined,
  updateSpaceAction: async () => undefined,
}));

mock.module("@/admin/components/editor/lexical/use-draft-recovery", () => ({
  useDraftRecovery: () => ({
    isAvailable: false,
    savedAt: null,
    restore: () => undefined,
    dismiss: () => undefined,
  }),
}));

mock.module("@/admin/components/editor/lexical/plugins/AutoSavePlugin", () => ({
  clearDraft: () => undefined,
}));

mock.module(
  "@/admin/components/editor/lexical/parts/DraftRecoveryBanner",
  () => ({
    DraftRecoveryBanner: () => null,
  }),
);

mock.module("@/admin/components/editor/inline/hooks", () => ({
  useBeforeUnload: () => undefined,
}));

const SPACE_EDIT_FORM_DIR =
  "@/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form";

for (const tab of [
  "SpaceEditBasicTab",
  "SpaceEditPricingTab",
  "SpaceEditMediaTab",
  "SpaceEditDetailsTab",
  "SpaceEditPublishTab",
  "SpaceEditBlockedDatesTab",
]) {
  mock.module(`${SPACE_EDIT_FORM_DIR}/${tab}`, () => ({ [tab]: () => null }));
}

const { SpaceEditForm } =
  await import("@/app/(admin)/admin/(dashboard)/spaces/_components/SpaceEditForm");
const { DEFAULT_TAX_SETTINGS } = await import("@/shared/lib/pricing/tax");

type SpaceProp = NonNullable<Parameters<typeof SpaceEditForm>[0]["space"]>;

function buildSpace(facilitiesUnreadable: boolean): SpaceProp {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "space",
    name: "テストスペース",
    descriptionJson: null,
    descriptionHtml: "",
    descriptionPlainText: "",
    addressDetail: null,
    displayAddress: "東京都渋谷区",
    capacity: 10,
    area: null,
    hourlyPrice: 1000,
    mainImageUrl: "https://example.com/i.jpg",
    gallery: [],
    facilities: [],
    facilitiesUnreadable,
    businessHours: null,
    isPublished: true,
    publishedAt: null,
    isActive: true,
    reviewsEnabled: false,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    locationId: "22222222-2222-4222-8222-222222222222",
    categoryId: null,
    smartLockDeviceId: null,
    category: null,
    discountType: "NONE",
    discountValue: null,
    durationDiscountOverride: "INHERIT",
    taxRateType: "STANDARD",
    metaDescription: null,
    metaKeywords: null,
    ogpTitle: null,
    ogpDescription: null,
    ogpImageUrl: null,
    _count: { reservations: 0 },
  };
}

describe("SpaceEditForm — 設備リスト読み取り失敗ガード", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    installJSDOMForTests();
  });

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

  function renderForm(facilitiesUnreadable: boolean): HTMLDivElement {
    const el = document.createElement("div");
    document.body.appendChild(el);
    container = el;
    const localRoot = createRoot(el);
    root = localRoot;
    act(() => {
      localRoot.render(
        <SpaceEditForm
          space={buildSpace(facilitiesUnreadable)}
          mode="edit"
          availableLocations={[]}
          availableCategories={[]}
          taxSettings={DEFAULT_TAX_SETTINGS}
          reviewsFeatureEnabled={false}
        />,
      );
    });
    return el;
  }

  function findButtonByText(
    el: HTMLElement,
    text: string,
  ): HTMLButtonElement | undefined {
    return Array.from(el.querySelectorAll("button")).find((button) =>
      button.textContent?.includes(text),
    );
  }

  test("設備リストが読めた場合は警告を出さず保存できる", () => {
    const el = renderForm(false);

    expect(el.textContent).not.toContain("保存されている設備リストが不正です");
    expect(findButtonByText(el, "変更を保存")?.disabled).toBe(false);
  });

  test("設備リストが読めなかった場合は警告を出して保存を止める", () => {
    const el = renderForm(true);

    expect(el.textContent).toContain("保存されている設備リストが不正です");
    // 空配列で上書きされるのを防ぐため、送信ボタン自体を無効化する。
    expect(findButtonByText(el, "変更を保存")?.disabled).toBe(true);
  });

  test("「設備リストを空にする」を了承すると保存が解禁される", () => {
    const el = renderForm(true);

    const resetButton = findButtonByText(el, "設備リストを空にする");
    expect(resetButton).toBeDefined();
    expect(findButtonByText(el, "変更を保存")?.disabled).toBe(true);

    act(() => {
      resetButton?.click();
    });

    expect(findButtonByText(el, "変更を保存")?.disabled).toBe(false);
  });

  test("Ctrl+S も読み取り失敗中は送信しない", () => {
    const el = renderForm(true);

    const form = el.querySelector("form");
    expect(form).not.toBeNull();

    let submitted = 0;
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitted += 1;
    });

    act(() => {
      document.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "s",
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });

    // disabled な送信ボタンは requestSubmit() を止められないので、ハンドラ側で止める。
    expect(submitted).toBe(0);

    act(() => {
      findButtonByText(el, "設備リストを空にする")?.click();
    });
    act(() => {
      document.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "s",
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });

    expect(submitted).toBe(1);
  });
});
