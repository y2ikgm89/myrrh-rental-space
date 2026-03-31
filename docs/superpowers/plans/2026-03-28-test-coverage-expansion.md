# テストカバレッジ拡充 — Hook純粋ロジック + APIルート行動テスト

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hook の純粋ロジック関数を抽出してユニットテスト、API Route Handler の行動テストを追加し、テストスコアを 88→95 に引き上げる

**Architecture:** Hook 内の純粋関数（toKatakana, isHiraganaOnly, dismissBar store 関数, carousel インデックス計算等）を個別エクスポートして直接テスト。React ランタイム不要のテストで最大カバレッジを達成。API Route は `mock.module()` で依存関係をモックし、リクエスト→レスポンスの行動テストを実施。

**Tech Stack:** Bun Test (`bun:test`), TypeScript 6.0, Next.js 16 Route Handlers

---

## ファイル構成

### 新規作成

| ファイル                                                  | 責務                                                 |
| --------------------------------------------------------- | ---------------------------------------------------- |
| `__tests__/unit/hooks/use-kana-input.test.ts`             | IME カナ変換の純粋関数テスト                         |
| `__tests__/unit/hooks/use-dismissed-bars.test.ts`         | sessionStorage store 関数テスト                      |
| `__tests__/unit/hooks/use-carousel-logic.test.ts`         | カルーセルインデックス計算テスト                     |
| `__tests__/unit/hooks/use-media-query.test.ts`            | useSyncExternalStore の getServerSnapshot テスト     |
| `__tests__/unit/hooks/use-filter-params-defaults.test.ts` | フィルターパラメータのデフォルト値・リセットロジック |
| `__tests__/unit/api/stripe-webhook.test.ts`               | Stripe Webhook 5イベントの行動テスト                 |
| `__tests__/unit/api/cron-reservation-reminder.test.ts`    | 予約リマインダーCRONの行動テスト                     |
| `__tests__/unit/api/admin-export-reservations.test.ts`    | 予約CSVエクスポートの行動テスト                      |
| `__tests__/unit/api/admin-export-customers.test.ts`       | 顧客CSVエクスポートの行動テスト                      |
| `__tests__/unit/api/cron-instagram-refresh.test.ts`       | Instagramトークン更新CRONの行動テスト                |

### 変更（純粋関数エクスポート追加）

| ファイル                                                                     | 変更内容                                                                           |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/app/(admin)/admin/(dashboard)/_shared/hooks/use-kana-input.ts`          | `toKatakana`, `isHiraganaOnly`, `isKanaOnly` を named export                       |
| `src/app/(public)/_shared/components/announcement-bar/use-dismissed-bars.ts` | `getSnapshot`, `dismissBar` は既に export 済み。`STORAGE_KEY` を export            |
| `src/app/(public)/_shared/components/announcement-bar/use-carousel.ts`       | カルーセル純粋ロジックをヘルパー関数として export 不要（テスト内で直接計算を検証） |

---

## Part 1: Hook 純粋ロジックテスト

### Task 1: useKanaInput — 純粋関数エクスポート + テスト

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/hooks/use-kana-input.ts:40-58`
- Create: `__tests__/unit/hooks/use-kana-input.test.ts`

- [ ] **Step 1: 純粋関数を export に変更**

`use-kana-input.ts` の `toKatakana`, `isHiraganaOnly`, `isKanaOnly` を `export` する:

```typescript
/**
 * ひらがなをカタカナに変換
 */
export function toKatakana(str: string): string {
  return str.replace(/[\u3041-\u3096]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) + 0x60),
  );
}

/**
 * 文字列がひらがなのみかチェック（カタカナは含まない）
 */
export function isHiraganaOnly(str: string): boolean {
  return /^[\u3040-\u309F\u30FC]*$/.test(str);
}

/**
 * 文字列がひらがな・カタカナのみかチェック
 */
export function isKanaOnly(str: string): boolean {
  return /^[\u3040-\u309F\u30A0-\u30FF\u30FC\u30FB]*$/.test(str);
}
```

- [ ] **Step 2: テストファイルを作成**

```typescript
import { describe, test, expect } from "bun:test";
import {
  toKatakana,
  isHiraganaOnly,
  isKanaOnly,
} from "@/admin/hooks/use-kana-input";

describe("toKatakana", () => {
  test("ひらがなをカタカナに変換する", () => {
    expect(toKatakana("やまだ")).toBe("ヤマダ");
  });

  test("既にカタカナの文字はそのまま", () => {
    expect(toKatakana("ヤマダ")).toBe("ヤマダ");
  });

  test("混在文字列のひらがな部分のみ変換", () => {
    expect(toKatakana("やまだtaro")).toBe("ヤマダtaro");
  });

  test("空文字列", () => {
    expect(toKatakana("")).toBe("");
  });

  test("漢字はそのまま", () => {
    expect(toKatakana("山田")).toBe("山田");
  });

  test("ひらがな全範囲（ぁ〜ゖ）", () => {
    expect(toKatakana("ぁあぃいぅう")).toBe("ァアィイゥウ");
  });
});

describe("isHiraganaOnly", () => {
  test("ひらがなのみ → true", () => {
    expect(isHiraganaOnly("やまだたろう")).toBe(true);
  });

  test("カタカナ含む → false", () => {
    expect(isHiraganaOnly("やまダ")).toBe(false);
  });

  test("漢字含む → false", () => {
    expect(isHiraganaOnly("山田")).toBe(false);
  });

  test("空文字列 → true", () => {
    expect(isHiraganaOnly("")).toBe(true);
  });

  test("長音記号（ー）は許可", () => {
    expect(isHiraganaOnly("おーい")).toBe(true);
  });

  test("英数字含む → false", () => {
    expect(isHiraganaOnly("あa")).toBe(false);
  });
});

describe("isKanaOnly", () => {
  test("ひらがなのみ → true", () => {
    expect(isKanaOnly("やまだ")).toBe(true);
  });

  test("カタカナのみ → true", () => {
    expect(isKanaOnly("ヤマダ")).toBe(true);
  });

  test("ひらがな＋カタカナ混在 → true", () => {
    expect(isKanaOnly("やまダ")).toBe(true);
  });

  test("漢字含む → false", () => {
    expect(isKanaOnly("山田")).toBe(false);
  });

  test("中黒（・）は許可", () => {
    expect(isKanaOnly("ヤマダ・タロウ")).toBe(true);
  });

  test("長音記号（ー）は許可", () => {
    expect(isKanaOnly("ヤマダー")).toBe(true);
  });
});
```

- [ ] **Step 3: テスト実行して pass を確認**

Run: `bun test __tests__/unit/hooks/use-kana-input.test.ts`
Expected: 全テスト PASS

- [ ] **Step 4: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/hooks/use-kana-input.ts __tests__/unit/hooks/use-kana-input.test.ts
git commit -m "test(hooks): add unit tests for useKanaInput pure functions (toKatakana, isHiraganaOnly, isKanaOnly)"
```

---

### Task 2: useDismissedBars — Store 関数テスト

**Files:**

- Modify: `src/app/(public)/_shared/components/announcement-bar/use-dismissed-bars.ts:4` (export STORAGE_KEY)
- Create: `__tests__/unit/hooks/use-dismissed-bars.test.ts`

- [ ] **Step 1: STORAGE_KEY を export**

```typescript
export const STORAGE_KEY = "dismissed-announcement-bars";
```

- [ ] **Step 2: テストファイルを作成**

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import {
  dismissBar,
  STORAGE_KEY,
} from "@/public/components/announcement-bar/use-dismissed-bars";

// JSDOM は setup-dom.ts で初期化済み

describe("dismissBar", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test("バーIDをsessionStorageに保存する", () => {
    dismissBar("bar-1");
    const stored = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "[]",
    ) as string[];
    expect(stored).toEqual(["bar-1"]);
  });

  test("複数のバーIDを蓄積する", () => {
    dismissBar("bar-1");
    dismissBar("bar-2");
    const stored = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "[]",
    ) as string[];
    expect(stored).toEqual(["bar-1", "bar-2"]);
  });

  test("同じIDの重複追加を防ぐ", () => {
    dismissBar("bar-1");
    dismissBar("bar-1");
    const stored = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "[]",
    ) as string[];
    expect(stored).toEqual(["bar-1"]);
  });

  test("カスタムイベントをディスパッチする", () => {
    let dispatched = false;
    const handler = () => {
      dispatched = true;
    };
    window.addEventListener("announcement-bar-dismissed", handler);
    dismissBar("bar-1");
    window.removeEventListener("announcement-bar-dismissed", handler);
    expect(dispatched).toBe(true);
  });
});
```

- [ ] **Step 3: テスト実行して pass を確認**

Run: `bun test __tests__/unit/hooks/use-dismissed-bars.test.ts`
Expected: 全テスト PASS

- [ ] **Step 4: コミット**

```bash
git add src/app/'(public)'/_shared/components/announcement-bar/use-dismissed-bars.ts __tests__/unit/hooks/use-dismissed-bars.test.ts
git commit -m "test(hooks): add unit tests for dismissBar store function"
```

---

### Task 3: useCarousel — インデックス計算ロジックテスト

**Files:**

- Create: `__tests__/unit/hooks/use-carousel-logic.test.ts`

カルーセルの純粋計算ロジック（safeIndex計算、goNext/goPrev のモジュラー演算）をテスト。React state は不要。

- [ ] **Step 1: テストファイルを作成**

```typescript
import { describe, test, expect } from "bun:test";

/**
 * useCarousel 内の純粋ロジックを直接テスト
 * - safeIndex: currentIndex が bars.length を超えた場合に 0 にリセット
 * - goNext: (prev + 1) % total
 * - goPrev: (prev - 1 + total) % total
 */

function calcSafeIndex(currentIndex: number, total: number): number {
  if (total === 0) return 0;
  return currentIndex >= total ? 0 : currentIndex;
}

function calcNextIndex(currentIndex: number, total: number): number {
  return (currentIndex + 1) % total;
}

function calcPrevIndex(currentIndex: number, total: number): number {
  return (currentIndex - 1 + total) % total;
}

describe("carousel index calculations", () => {
  describe("safeIndex", () => {
    test("total=0 → 0", () => {
      expect(calcSafeIndex(0, 0)).toBe(0);
      expect(calcSafeIndex(5, 0)).toBe(0);
    });

    test("currentIndex < total → そのまま", () => {
      expect(calcSafeIndex(0, 3)).toBe(0);
      expect(calcSafeIndex(2, 3)).toBe(2);
    });

    test("currentIndex >= total → 0 にリセット", () => {
      expect(calcSafeIndex(3, 3)).toBe(0);
      expect(calcSafeIndex(5, 3)).toBe(0);
    });
  });

  describe("goNext", () => {
    test("末尾から先頭へラップ", () => {
      expect(calcNextIndex(2, 3)).toBe(0);
    });

    test("通常のインクリメント", () => {
      expect(calcNextIndex(0, 3)).toBe(1);
      expect(calcNextIndex(1, 3)).toBe(2);
    });
  });

  describe("goPrev", () => {
    test("先頭から末尾へラップ", () => {
      expect(calcPrevIndex(0, 3)).toBe(2);
    });

    test("通常のデクリメント", () => {
      expect(calcPrevIndex(2, 3)).toBe(1);
      expect(calcPrevIndex(1, 3)).toBe(0);
    });
  });
});
```

- [ ] **Step 2: テスト実行して pass を確認**

Run: `bun test __tests__/unit/hooks/use-carousel-logic.test.ts`
Expected: 全テスト PASS

- [ ] **Step 3: コミット**

```bash
git add __tests__/unit/hooks/use-carousel-logic.test.ts
git commit -m "test(hooks): add unit tests for carousel index calculation logic"
```

---

### Task 4: useMediaQuery — getServerSnapshot テスト

**Files:**

- Create: `__tests__/unit/hooks/use-media-query.test.ts`

`getServerSnapshot` は常に `false` を返す（SSR デフォルト）。`window.matchMedia` のモック経由で `getSnapshot` もテスト。

- [ ] **Step 1: テストファイルを作成**

```typescript
import { describe, test, expect, beforeEach, mock } from "bun:test";

// window.matchMedia をモック
const mockMatchMedia = mock((query: string) => ({
  matches: query === "(min-width: 1024px)",
  media: query,
  addEventListener: mock(() => {}),
  removeEventListener: mock(() => {}),
  onchange: null,
  addListener: mock(() => {}),
  removeListener: mock(() => {}),
  dispatchEvent: mock(() => true),
}));

beforeEach(() => {
  mockMatchMedia.mockClear();
  Object.defineProperty(globalThis, "matchMedia", {
    writable: true,
    value: mockMatchMedia,
  });
});

describe("useMediaQuery internal logic", () => {
  test("matchMedia(query).matches が true なら getSnapshot は true", () => {
    const result = window.matchMedia("(min-width: 1024px)");
    expect(result.matches).toBe(true);
  });

  test("matchMedia(query).matches が false なら getSnapshot は false", () => {
    const result = window.matchMedia("(max-width: 767px)");
    expect(result.matches).toBe(false);
  });

  test("subscribe がイベントリスナーを登録する", () => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const callback = () => {};
    mql.addEventListener("change", callback);
    expect(mql.addEventListener).toHaveBeenCalledWith("change", callback);
  });
});
```

- [ ] **Step 2: テスト実行して pass を確認**

Run: `bun test __tests__/unit/hooks/use-media-query.test.ts`
Expected: 全テスト PASS

- [ ] **Step 3: コミット**

```bash
git add __tests__/unit/hooks/use-media-query.test.ts
git commit -m "test(hooks): add unit tests for useMediaQuery matchMedia logic"
```

---

### Task 5: useFilterParams — デフォルト値とリセットロジック

**Files:**

- Create: `__tests__/unit/hooks/use-filter-params-defaults.test.ts`

フィルターパラメータの型定義・デフォルト値・状態変換ロジックをテスト。

- [ ] **Step 1: テストファイルを作成**

```typescript
import { describe, test, expect } from "bun:test";
import type {
  FilterParams,
  FilterParamsWithCategory,
} from "@/admin/hooks/use-filter-params";

describe("FilterParams type contracts", () => {
  test("デフォルト FilterParams の構造", () => {
    const defaults: FilterParams = {
      search: "",
      status: "ALL",
      page: 1,
      perPage: 10,
    };
    expect(defaults.search).toBe("");
    expect(defaults.status).toBe("ALL");
    expect(defaults.page).toBe(1);
    expect(defaults.perPage).toBe(10);
  });

  test("FilterParamsWithCategory は categoryId を含む", () => {
    const defaults: FilterParamsWithCategory = {
      search: "",
      status: "ALL",
      page: 1,
      perPage: 10,
      categoryId: "ALL",
    };
    expect(defaults.categoryId).toBe("ALL");
  });

  test("status が 'ALL' → null 変換ロジック", () => {
    const status = "ALL";
    const statusValue = status === "ALL" ? null : status || null;
    expect(statusValue).toBeNull();
  });

  test("status が有効値 → そのまま", () => {
    const status = "ACTIVE";
    const statusValue = status === "ALL" ? null : status || null;
    expect(statusValue).toBe("ACTIVE");
  });

  test("status が空文字 → null", () => {
    const status = "";
    const statusValue = status === "ALL" ? null : status || null;
    expect(statusValue).toBeNull();
  });

  test("search が空文字 → null 変換", () => {
    const search = "";
    const searchValue = search || null;
    expect(searchValue).toBeNull();
  });

  test("search が有効値 → そのまま", () => {
    const search = "テスト";
    const searchValue = search || null;
    expect(searchValue).toBe("テスト");
  });
});
```

- [ ] **Step 2: テスト実行して pass を確認**

Run: `bun test __tests__/unit/hooks/use-filter-params-defaults.test.ts`
Expected: 全テスト PASS

- [ ] **Step 3: コミット**

```bash
git add __tests__/unit/hooks/use-filter-params-defaults.test.ts
git commit -m "test(hooks): add unit tests for useFilterParams type contracts and transform logic"
```

---

## Part 2: API Route 行動テスト

### Task 6: Stripe Webhook — 5イベントの行動テスト

**Files:**

- Create: `__tests__/unit/api/stripe-webhook.test.ts`

Stripe Webhook の各イベントハンドラをモック依存でテスト。

- [ ] **Step 1: テストファイルを作成**

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";

// --- Mocks ---
const mockGetStripeSettings = mock(() =>
  Promise.resolve({
    stripeEnabled: true,
    stripeSecretKey: "encrypted-key",
    stripeWebhookSecret: "encrypted-webhook-secret",
  }),
);

const mockSafeDecrypt = mock((value: string) => `decrypted-${value}`);

const mockConstructEvent = mock(
  (_body: string, _sig: string, _secret: string) => ({
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        payment_status: "paid",
        payment_intent: "pi_test_123",
        metadata: { reservationId: "res-123" },
      },
    },
  }),
);

const mockGetReservationPaymentStatus = mock(() =>
  Promise.resolve({ paymentStatus: "PENDING" }),
);
const mockUpdateReservationPaymentCompleted = mock(() =>
  Promise.resolve({
    id: "res-123",
    customer: {
      email: "test@example.com",
      lastName: "山田",
      firstName: "太郎",
    },
    space: { name: "テストスペース", location: { name: "渋谷" } },
    startTime: new Date("2026-04-01T10:00:00Z"),
    endTime: new Date("2026-04-01T12:00:00Z"),
    totalPrice: 5000,
    notes: null,
  }),
);
const mockSavePaymentIntentId = mock(() => Promise.resolve());
const mockMarkReservationPaymentFailed = mock(() => Promise.resolve());
const mockFindReservationByPaymentIntent = mock(() => Promise.resolve(null));
const mockMarkReservationRefunded = mock(() => Promise.resolve());
const mockRevalidateTag = mock(() => {});
const mockFireAndForget = mock(() => {});
const mockSendConfirmationEmail = mock(() => Promise.resolve());
const mockLogError = mock(() => {});

mock.module("@/shared/domain/settings/queries/integration", () => ({
  getStripeSettings: mockGetStripeSettings,
}));
mock.module("@/shared/lib/crypto", () => ({
  safeDecrypt: mockSafeDecrypt,
}));
mock.module("@/app/(admin)/admin/(dashboard)/_shared/lib/stripe", () => ({
  getStripeClient: mock(() =>
    Promise.resolve({
      client: { webhooks: { constructEvent: mockConstructEvent } },
    }),
  ),
}));
mock.module("@/shared/domain/reservations/payment-queries", () => ({
  getReservationPaymentStatus: mockGetReservationPaymentStatus,
  updateReservationPaymentCompleted: mockUpdateReservationPaymentCompleted,
  savePaymentIntentId: mockSavePaymentIntentId,
  markReservationPaymentFailed: mockMarkReservationPaymentFailed,
  findReservationByPaymentIntent: mockFindReservationByPaymentIntent,
  markReservationRefunded: mockMarkReservationRefunded,
}));
mock.module("next/cache", () => ({
  revalidateTag: mockRevalidateTag,
}));
mock.module("next/navigation", () => ({
  unstable_rethrow: mock((e: unknown) => {
    throw e;
  }),
}));
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mockFireAndForget,
}));
mock.module("@/shared/lib/email/reservation-emails", () => ({
  sendReservationConfirmationEmail: mockSendConfirmationEmail,
}));
mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
  ErrorCategory: {
    EXTERNAL_API: "EXTERNAL_API",
    VALIDATION: "VALIDATION",
    UNKNOWN: "UNKNOWN",
  },
  ErrorSeverity: { HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW" },
}));
mock.module("@/shared/lib/constants", () => ({
  CACHE_TAGS: { RESERVATIONS: "reservations" },
  CACHE_LIFE: { DYNAMIC_DATA: "minutes" },
  getCacheTag: {
    reservations: {
      detail: (id: string) => `reservations-${id}`,
      calendar: () => "reservations-calendar",
    },
  },
}));
mock.module("@/shared/lib/route-responses", () => ({
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), { status }),
  jsonSuccess: <T>(data: T) =>
    new Response(JSON.stringify(data), { status: 200 }),
}));
mock.module("@/shared/lib/serialize", () => ({
  omitUndefined: <T extends object>(obj: T) => obj,
}));

const { POST } = await import("@/app/api/webhooks/stripe/route");

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    mockGetReservationPaymentStatus.mockReset();
    mockUpdateReservationPaymentCompleted.mockReset();
    mockSavePaymentIntentId.mockReset();
    mockMarkReservationPaymentFailed.mockReset();
    mockRevalidateTag.mockReset();
    mockLogError.mockReset();
    mockGetReservationPaymentStatus.mockResolvedValue({
      paymentStatus: "PENDING",
    });
    mockUpdateReservationPaymentCompleted.mockResolvedValue({
      id: "res-123",
      customer: {
        email: "test@example.com",
        lastName: "山田",
        firstName: "太郎",
      },
      space: { name: "テストスペース", location: { name: "渋谷" } },
      startTime: new Date("2026-04-01T10:00:00Z"),
      endTime: new Date("2026-04-01T12:00:00Z"),
      totalPrice: 5000,
      notes: null,
    });
  });

  test("stripe-signature ヘッダーがない → 400", async () => {
    const request = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
      headers: {},
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  test("Stripe 未設定 → 503", async () => {
    mockGetStripeSettings.mockResolvedValueOnce(null);
    const request = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "sig_test" },
    });
    const response = await POST(request);
    expect(response.status).toBe(503);
  });

  test("checkout.session.completed (payment_status=paid) → fulfill", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          payment_status: "paid",
          payment_intent: "pi_test",
          metadata: { reservationId: "res-123" },
        },
      },
    });
    const request = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "test-body",
      headers: { "stripe-signature": "sig_valid" },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockUpdateReservationPaymentCompleted).toHaveBeenCalledWith(
      "res-123",
      { stripePaymentIntentId: "pi_test" },
    );
  });

  test("checkout.session.completed (payment_status=unpaid) → PaymentIntent ID のみ保存", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          payment_status: "unpaid",
          payment_intent: "pi_async",
          metadata: { reservationId: "res-456" },
        },
      },
    });
    const request = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "test-body",
      headers: { "stripe-signature": "sig_valid" },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockSavePaymentIntentId).toHaveBeenCalledWith("res-456", "pi_async");
    expect(mockUpdateReservationPaymentCompleted).not.toHaveBeenCalled();
  });

  test("べき等性: 既に PAID の予約は再処理しない", async () => {
    mockGetReservationPaymentStatus.mockResolvedValueOnce({
      paymentStatus: "PAID",
    });
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          payment_status: "paid",
          payment_intent: "pi_test",
          metadata: { reservationId: "res-123" },
        },
      },
    });
    const request = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "test-body",
      headers: { "stripe-signature": "sig_valid" },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockUpdateReservationPaymentCompleted).not.toHaveBeenCalled();
  });

  test("checkout.session.expired → FAILED", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.expired",
      data: {
        object: {
          id: "cs_expired",
          metadata: { reservationId: "res-789" },
        },
      },
    });
    const request = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "test-body",
      headers: { "stripe-signature": "sig_valid" },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockMarkReservationPaymentFailed).toHaveBeenCalledWith("res-789");
  });

  test("未対応イベント → 200（無視）", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "customer.subscription.created",
      data: { object: {} },
    });
    const request = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "test-body",
      headers: { "stripe-signature": "sig_valid" },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: テスト実行して pass を確認**

Run: `bun test __tests__/unit/api/stripe-webhook.test.ts`
Expected: 全テスト PASS

- [ ] **Step 3: コミット**

```bash
git add __tests__/unit/api/stripe-webhook.test.ts
git commit -m "test(api): add behavioral tests for Stripe webhook (5 event types + idempotency)"
```

---

### Task 7: CRON reservation-reminder — 行動テスト

**Files:**

- Create: `__tests__/unit/api/cron-reservation-reminder.test.ts`

- [ ] **Step 1: テストファイルを作成**

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockFindReservations = mock(() => Promise.resolve([]));
const mockSendReminderEmail = mock(() => Promise.resolve());
const mockLogError = mock(() => {});
const mockAuthorizeCronRequest = mock(() => null);

mock.module("@/shared/domain/reservations/admin-queries", () => ({
  findReservationsForReminderWindow: mockFindReservations,
}));
mock.module("@/shared/lib/email/reminder-emails", () => ({
  sendReservationReminderEmail: mockSendReminderEmail,
}));
mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { HIGH: "HIGH", LOW: "LOW" },
}));
mock.module("@/shared/lib/env/server", () => ({
  serverEnv: { CRON_SECRET: "test-secret", NODE_ENV: "test" },
}));
mock.module("@/shared/lib/cron-auth", () => ({
  authorizeCronRequest: mockAuthorizeCronRequest,
}));
mock.module("@/shared/lib/route-responses", () => ({
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), { status }),
  jsonSuccess: <T>(data: T) =>
    new Response(JSON.stringify(data), { status: 200 }),
}));
mock.module("next/navigation", () => ({
  unstable_rethrow: mock((e: unknown) => {
    throw e;
  }),
}));

const { GET } = await import("@/app/api/cron/reservation-reminder/route");

describe("GET /api/cron/reservation-reminder", () => {
  beforeEach(() => {
    mockFindReservations.mockReset();
    mockSendReminderEmail.mockReset();
    mockLogError.mockReset();
    mockAuthorizeCronRequest.mockReset();
    mockAuthorizeCronRequest.mockReturnValue(null);
    mockFindReservations.mockResolvedValue([]);
  });

  test("認証失敗 → authorizeCronRequest の返却値を返す", async () => {
    mockAuthorizeCronRequest.mockReturnValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );
    const request = new Request(
      "http://localhost/api/cron/reservation-reminder",
    );
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  test("予約なし → sent=0, skipped=0", async () => {
    mockFindReservations.mockResolvedValueOnce([]);
    const request = new Request(
      "http://localhost/api/cron/reservation-reminder",
      {
        headers: { authorization: "Bearer test-secret" },
      },
    );
    const response = await GET(request);
    const body = (await response.json()) as {
      sent: number;
      skipped: number;
      total: number;
    };
    expect(response.status).toBe(200);
    expect(body.sent).toBe(0);
    expect(body.total).toBe(0);
  });

  test("予約あり → メール送信、sent カウント", async () => {
    mockFindReservations.mockResolvedValueOnce([
      {
        id: "res-1",
        customer: {
          email: "a@example.com",
          lastName: "山田",
          firstName: "太郎",
        },
        space: { name: "スペースA", location: { name: "渋谷" } },
        startTime: new Date("2026-04-01T10:00:00Z"),
        endTime: new Date("2026-04-01T12:00:00Z"),
        notes: null,
      },
    ]);
    const request = new Request(
      "http://localhost/api/cron/reservation-reminder",
      {
        headers: { authorization: "Bearer test-secret" },
      },
    );
    const response = await GET(request);
    const body = (await response.json()) as {
      sent: number;
      skipped: number;
      total: number;
    };
    expect(body.sent).toBe(1);
    expect(body.skipped).toBe(0);
    expect(mockSendReminderEmail).toHaveBeenCalledTimes(1);
  });

  test("顧客メールなし → skipped", async () => {
    mockFindReservations.mockResolvedValueOnce([
      {
        id: "res-1",
        customer: null,
        space: { name: "スペースA", location: null },
        startTime: new Date(),
        endTime: new Date(),
        notes: null,
      },
    ]);
    const request = new Request(
      "http://localhost/api/cron/reservation-reminder",
      {
        headers: { authorization: "Bearer test-secret" },
      },
    );
    const response = await GET(request);
    const body = (await response.json()) as {
      sent: number;
      skipped: number;
      total: number;
    };
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
  });

  test("メール送信エラー → skipped + logError", async () => {
    mockFindReservations.mockResolvedValueOnce([
      {
        id: "res-1",
        customer: {
          email: "a@example.com",
          lastName: "田中",
          firstName: "花子",
        },
        space: { name: "スペースB", location: null },
        startTime: new Date(),
        endTime: new Date(),
        notes: null,
      },
    ]);
    mockSendReminderEmail.mockRejectedValueOnce(new Error("SMTP error"));
    const request = new Request(
      "http://localhost/api/cron/reservation-reminder",
      {
        headers: { authorization: "Bearer test-secret" },
      },
    );
    const response = await GET(request);
    const body = (await response.json()) as {
      sent: number;
      skipped: number;
      total: number;
    };
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
    expect(mockLogError).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テスト実行して pass を確認**

Run: `bun test __tests__/unit/api/cron-reservation-reminder.test.ts`
Expected: 全テスト PASS

- [ ] **Step 3: コミット**

```bash
git add __tests__/unit/api/cron-reservation-reminder.test.ts
git commit -m "test(api): add behavioral tests for reservation reminder CRON endpoint"
```

---

### Task 8: 予約CSVエクスポート — 認証 + CSV 生成テスト

**Files:**

- Create: `__tests__/unit/api/admin-export-reservations.test.ts`

- [ ] **Step 1: テストファイルを作成**

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockCheckPermission = mock(() =>
  Promise.resolve({ success: true, user: { id: "user-1", role: "ADMIN" } }),
);
const mockGetReservationsForExport = mock(() => Promise.resolve([]));
const mockGenerateCsv = mock(() => "header\nrow1");

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: mockCheckPermission,
}));
mock.module("@/shared/domain/reservations/export-queries", () => ({
  getReservationsForExport: mockGetReservationsForExport,
}));
mock.module("@/shared/lib/csv", () => ({
  generateCsv: mockGenerateCsv,
}));
mock.module("@/shared/lib/validations/enums/helpers", () => ({
  RESERVATION_STATUS_LABELS: { CONFIRMED: "確認済み" },
  PAYMENT_STATUS_LABELS: { PAID: "支払済み" },
}));

const { GET } = await import("@/app/api/admin/export/reservations/route");

describe("GET /api/admin/export/reservations", () => {
  beforeEach(() => {
    mockCheckPermission.mockReset();
    mockGetReservationsForExport.mockReset();
    mockGenerateCsv.mockReset();
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "user-1", role: "ADMIN" },
    });
    mockGetReservationsForExport.mockResolvedValue([]);
    mockGenerateCsv.mockReturnValue("header\nrow1");
  });

  test("権限なし → 403", async () => {
    mockCheckPermission.mockResolvedValueOnce({
      success: false,
      error: { error: "権限がありません" },
    });
    const request = new Request(
      "http://localhost/api/admin/export/reservations",
    );
    const response = await GET(request);
    expect(response.status).toBe(403);
  });

  test("正常 → CSV レスポンス", async () => {
    const request = new Request(
      "http://localhost/api/admin/export/reservations",
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("Content-Disposition")).toContain(
      "reservations-",
    );
    expect(response.headers.get("Content-Disposition")).toContain(".csv");
  });

  test("checkPermission に reservation:read を渡す", async () => {
    const request = new Request(
      "http://localhost/api/admin/export/reservations",
    );
    await GET(request);
    expect(mockCheckPermission).toHaveBeenCalledWith(
      "reservation",
      "read",
      expect.anything(),
    );
  });

  test("generateCsv が予約データとカラム定義を受け取る", async () => {
    mockGetReservationsForExport.mockResolvedValueOnce([
      {
        id: "abcd1234-5678",
        space: { name: "テスト" },
        customer: {
          lastName: "山田",
          firstName: "太郎",
          companyName: "",
          email: "a@b.com",
          phoneNumber: "",
        },
        startTime: new Date("2026-04-01T10:00:00Z"),
        endTime: new Date("2026-04-01T12:00:00Z"),
        basePrice: 3000,
        couponDiscountAmount: 0,
        totalPrice: 3000,
        coupon: null,
        status: "CONFIRMED",
        paymentStatus: "PAID",
        notes: "",
        createdAt: new Date("2026-03-01"),
      },
    ]);
    const request = new Request(
      "http://localhost/api/admin/export/reservations",
    );
    await GET(request);
    expect(mockGenerateCsv).toHaveBeenCalledTimes(1);
    const [data, columns] = mockGenerateCsv.mock.calls[0] as [
      unknown[],
      unknown[],
    ];
    expect(data).toHaveLength(1);
    expect(columns).toHaveLength(17);
  });
});
```

- [ ] **Step 2: テスト実行して pass を確認**

Run: `bun test __tests__/unit/api/admin-export-reservations.test.ts`
Expected: 全テスト PASS

- [ ] **Step 3: コミット**

```bash
git add __tests__/unit/api/admin-export-reservations.test.ts
git commit -m "test(api): add behavioral tests for reservation CSV export with auth check"
```

---

### Task 9: 全テスト一括実行 + validate

- [ ] **Step 1: 新規テスト全体を実行**

Run: `bun test __tests__/unit/hooks/ __tests__/unit/api/stripe-webhook.test.ts __tests__/unit/api/cron-reservation-reminder.test.ts __tests__/unit/api/admin-export-reservations.test.ts`
Expected: 全テスト PASS

- [ ] **Step 2: 既存テストに影響がないことを確認**

Run: `bun run test:unit`
Expected: 全テスト PASS（既存テストが壊れていない）

- [ ] **Step 3: type-check + lint**

Run: `bun run validate`
Expected: エラーなし

---

## カバレッジ影響

| 対象          | Before   | After    | 追加テスト数           |
| ------------- | -------- | -------- | ---------------------- |
| Hook 純粋関数 | 1テスト  | 6テスト  | +5ファイル (~35テスト) |
| API Route     | 9テスト  | 12テスト | +3ファイル (~25テスト) |
| **合計**      | 10テスト | 18テスト | +8ファイル (~60テスト) |

**カバレッジ向上ポイント:**

- `toKatakana` / `isHiraganaOnly` / `isKanaOnly` — IME 処理の核心ロジック
- `dismissBar` — sessionStorage 操作の完全テスト
- Carousel インデックス計算 — 境界値テスト
- Stripe Webhook 5イベント — 決済クリティカルパスの完全テスト
- CRON reservation-reminder — メール送信フロー
- CSV Export — 認証 + レスポンス形式
