# 顧客管理強化 実装計画（Phase 4）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理者機能パリティ設計の Phase 4（最終フェーズ）。顧客管理を4点強化する —
(1) 重複顧客の自動検出cron + 顧客一覧での可視化 + マージ候補プリフィル、
(2) 顧客統計の手動再計算ボタン + 既存recompute条件の穴埋め、
(3) 顧客詳細へのイベント参加履歴統合、(4) 顧客への一括メール送信（プリセット+自由文）。

**Architecture:** すべて既存スキーマの上に構築する（DB migration 不要 — `flagReasons`/
`flaggedForReviewAt`/`emailCanonical`/`phoneNumber`/`marketingOptIn` は全て既存列、
`EventRegistration.customerId` も既存FK）。事前調査で設計docの記載に対し2つの重要な
修正が必要と判明した:

1. **flagReasons上書き問題（重大・要修正）**: 既存の週次 customer-risk-scan cron が
   使う `applyRiskFlagsCommand` は `Customer.flagReasons` 配列を**無条件に丸ごと
   置換**する設計（「常に直近の検知結果を表す」という意図的設計）。設計doc通りに
   新規の日次重複検出cronが同じ配列に同じ書込みパターンで書き込むと、
   **後発で走った方のcronが先発の検知結果を消してしまう**（risk-scanが
   `rapid_booking` を検知した直後に重複検出cronが走ると `flagReasons` が
   `["DUPLICATE_CANDIDATE"]` だけになり `rapid_booking` が消える、逆も同様）。
   本計画は `reconcileFlagReasonsCommand`（呼出側が所有する理由コード集合の
   範囲でのみ配列を書き換える）を新設し、両cronをこれ経由に統一することで解決する。
2. **MergeCustomerDialogのプリフィルは実装済みではない（設計docは過大に書いている）**:
   現状 `sourceCustomer`（マージ元）と `open`/`onOpenChange` のみを受け取り、
   マージ先候補は毎回手動検索が必要。「候補プリフィルで開く」は新規実装が要る。
   また候補を安定的に指すID列を新規に永続化する（スキーマ変更）よりも、
   クリック時に emailCanonical/phoneNumber 一致を都度検索する方が、データ変化に
   対して stale にならずクリーン（スキーマ変更なし）なため、この方式を採用する。

一括メール送信は「テンプレート選択」を文字通り既存の26種の取引メールテンプレート
（`EMAIL_TEMPLATE_REGISTRY`）から選ぶ機能として実装しない — 事前調査の結果、
既存テンプレートは全て `reservationId`/`eventDate` 等ドメイン固有の props を要求し
「顧客+自由文」を汎用的に流し込める形になっておらず、文字通りの実装は新規の
汎用レンダリング基盤を要する非自明な作業になると判明した。代わりに、この
コードベース既存の「プリセット選択 + 自由入力」パターン（`RefundDialog`/
`CancellationReasonDialog` の `REASON_PRESETS` 方式）を踏襲し、一括メール送信ダイアログに
数種の定型文プリセット + 自由文を選べるUIとする。送信自体は Phase 2 で実証済みの
`sendEventBroadcast`/`EventBroadcastEmail`/`broadcastEventAction` パターンを
顧客向けに複製する（新規インフラではなく、確立済みパターンの横展開）。

**Tech Stack:** Next.js 16 App Router / Prisma 7 / Zod 4 + conform / React Email
（`_registry` パターン）/ Bun test（`scripts/run-tests.ts` 経由必須）。

## Global Constraints

- DB migration は不要（全フィールド既存）。schema.prisma は変更しない。
- `Customer.flagReasons`（`String[] @default([])`）への書込みは必ず
  `reconcileFlagReasonsCommand`（Task 2 で新設）経由にする。直接
  `prisma.customer.update({data:{flagReasons:...}})` で丸ごと置換しない
  （既存 risk-scan cron との衝突を防ぐため）。
- 新規理由コードは `RISK_FLAG_REASON`（`src/shared/lib/validations/enums/helpers.ts`）に
  追加する（enum ではなく string 定数なので migration 不要）。
- 一括メールの自由文は plain text としてエスケープ描画する（raw HTML 注入は許可しない）。
  `EventBroadcastEmail.tsx` の `whiteSpace: "pre-wrap"` パターンをそのまま踏襲する。
- 新規 cron route は `.claude/skills/add-cron-job/SKILL.md` の手順に従う
  （`connection()` → `authorizeCronRequest` の順序、`cronRoutePaths` への登録、
  `scripts/setup-cloud-scheduler.sh` の `JOBS` 配列への登録は
  `architecture-boundaries.test.ts`/`cron-oidc-clean-break.test.ts` で強制される）。
- 新規メールテンプレートは `.claude/skills/add-email-template` の手順（component +
  fixture + `_registry`エントリの3点セット）に従う。
- 各 task 完了時、変更ロジックに対応する既存テストコマンドで確認する
  (`bun scripts/run-tests.ts <対象ファイル>`)。全task完了後に
  `bun run validate` と `bun run test:unit`/`test:integration` をフルスイートで実行する。

---

### Task 1: `reconcileFlagReasonsCommand` 新設 + 既存 risk-scan の移行

**Files:**

- Modify: `src/shared/domain/customers/risk-detection.ts`
- Test: `__tests__/unit/domain/customers/risk-detection.test.ts`（既存ファイルがあれば
  追記、無ければ新規作成 — 事前調査で確認された実テストは
  `__tests__/integration/domain/customers/risk-detection.test.ts`（統合テスト、
  実DB要）だったため、この unit test は新規の可能性が高い。実装前に
  `__tests__/unit/domain/customers/` を確認すること）

**Interfaces:**

- Produces: `reconcileFlagReasonsCommand(customerId: string, params: {
ownedReasons: readonly RiskFlagReason[]; detectedReasons: readonly RiskFlagReason[] })
=> Promise<number>`（Task 2 で重複検出コマンドが同じ関数を消費する）

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/unit/domain/customers/risk-detection.test.ts` に以下を追加（ファイルが
存在しなければ新規作成、その場合は既存の `mock.module("@/shared/db/prisma", ...)`
パターンを他の customers ドメインの unit test から確認して合わせること）:

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const mockFindUnique =
  mock<(args: unknown) => Promise<{ flagReasons: string[] } | null>>();
const mockUpdateMany = mock<(args: unknown) => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 1 }),
);
const mockTransaction = mock(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    customer: { findUnique: mockFindUnique, updateMany: mockUpdateMany },
  }),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: { $transaction: mockTransaction },
}));

const { reconcileFlagReasonsCommand } =
  await import("@/shared/domain/customers/risk-detection");

describe("reconcileFlagReasonsCommand", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdateMany.mockReset();
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  test("他cron所有の理由コードを温存しつつ自分の所有分だけ書き換える", async () => {
    mockFindUnique.mockResolvedValue({
      flagReasons: ["rapid_booking", "DUPLICATE_CANDIDATE"],
    });

    await reconcileFlagReasonsCommand("customer-1", {
      ownedReasons: [
        "rapid_booking",
        "frequent_cancellation",
        "repeated_no_show",
      ],
      detectedReasons: ["frequent_cancellation"],
    });

    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          flagReasons: expect.arrayContaining([
            "DUPLICATE_CANDIDATE",
            "frequent_cancellation",
          ]),
        }),
      }),
    );
    const call = mockUpdateMany.mock.calls[0]?.[0] as {
      data: { flagReasons: string[] };
    };
    expect(call.data.flagReasons).not.toContain("rapid_booking");
    expect(call.data.flagReasons.length).toBe(2);
  });

  test("最終的な flagReasons が空になれば flaggedForReviewAt も null にする", async () => {
    mockFindUnique.mockResolvedValue({ flagReasons: ["rapid_booking"] });

    await reconcileFlagReasonsCommand("customer-1", {
      ownedReasons: [
        "rapid_booking",
        "frequent_cancellation",
        "repeated_no_show",
      ],
      detectedReasons: [],
    });

    const call = mockUpdateMany.mock.calls[0]?.[0] as {
      data: { flagReasons: string[]; flaggedForReviewAt: Date | null };
    };
    expect(call.data.flagReasons).toEqual([]);
    expect(call.data.flaggedForReviewAt).toBeNull();
  });

  test("存在しない顧客IDは何もせず 0 を返す", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await reconcileFlagReasonsCommand("nonexistent", {
      ownedReasons: ["rapid_booking"],
      detectedReasons: ["rapid_booking"],
    });

    expect(result).toBe(0);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/domain/customers/risk-detection.test.ts`
Expected: FAIL — `reconcileFlagReasonsCommand` が存在しない。

- [ ] **Step 3: `reconcileFlagReasonsCommand` を実装し、`applyRiskFlagsCommand` を移行**

`src/shared/domain/customers/risk-detection.ts` の `applyRiskFlagsCommand` の直前に
追加:

```ts
const RISK_SCAN_OWNED_REASONS: readonly RiskFlagReason[] = [
  RISK_FLAG_REASON.RAPID_BOOKING,
  RISK_FLAG_REASON.FREQUENT_CANCELLATION,
  RISK_FLAG_REASON.REPEATED_NO_SHOW,
];

/**
 * `Customer.flagReasons` を「呼出側が所有する理由コード集合」の範囲でのみ
 * 書き換える。複数の独立した cron（customer-risk-scan / duplicate-detection）が
 * 同一の `flagReasons` 配列を共有するため、無条件の配列置換だと後発 cron が
 * 先発 cron の検知結果を消してしまう（逆も同様）。`ownedReasons` に含まれる
 * コードだけを既存配列から除去し、`detectedReasons`（`ownedReasons` の部分集合）
 * を足し戻すことで、他 cron 所有の理由コードを温存する。
 *
 * 最終的な `flagReasons` が空になれば `flaggedForReviewAt` も null に戻す
 * （「要注意」表示は理由が1つも無ければ出さない）。空でなければ now を設定する
 * （複数 cron のどちらが最後に触ったかに関わらず「直近に何らかのフラグが
 * 更新された時刻」を表す）。
 */
export async function reconcileFlagReasonsCommand(
  customerId: string,
  params: {
    ownedReasons: readonly RiskFlagReason[];
    detectedReasons: readonly RiskFlagReason[];
  },
): Promise<number> {
  const ownedSet = new Set<string>(params.ownedReasons);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.customer.findUnique({
      where: { id: customerId },
      select: { flagReasons: true },
    });
    if (!existing) return 0;

    const preserved = existing.flagReasons.filter(
      (reason) => !ownedSet.has(reason),
    );
    const nextReasons = [...preserved, ...params.detectedReasons];

    const result = await tx.customer.updateMany({
      where: { id: customerId },
      data: {
        flagReasons: nextReasons,
        flaggedForReviewAt: nextReasons.length > 0 ? new Date() : null,
      },
    });
    return result.count;
  });
}
```

`applyRiskFlagsCommand` の実装本体を置き換える（関数シグネチャ・JSDoc・戻り値の
意味は変更しない）:

```ts
/**
 * 検知結果を Customer レコードに反映する。risk-scan が所有する3つの理由コード
 * （rapid_booking/frequent_cancellation/repeated_no_show）の範囲でのみ
 * `flagReasons` を書き換え、他 cron（duplicate-detection）由来のコードは
 * `reconcileFlagReasonsCommand` が温存する。
 */
export async function applyRiskFlagsCommand(
  detected: readonly DetectedRiskyCustomer[],
): Promise<number> {
  let updated = 0;
  for (const { customerId, reasons } of detected) {
    updated += await reconcileFlagReasonsCommand(customerId, {
      ownedReasons: RISK_SCAN_OWNED_REASONS,
      detectedReasons: reasons,
    });
  }
  return updated;
}
```

`prisma` の import が既に無ければ追加する（ファイル冒頭で既に
`import { prisma } from "@/shared/db/prisma";` が存在するはずなので確認のみ）。

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/domain/customers/risk-detection.test.ts`
Expected: PASS

- [ ] **Step 5: 既存の risk-detection 統合テストが壊れていないことを確認する**

Run: `bun scripts/run-tests.ts __tests__/integration/domain/customers/risk-detection.test.ts`
Expected: PASS（`applyRiskFlagsCommand` の外部インターフェースは変更していないため、
既存の呼出し元・アサーションは影響を受けないはず。壊れていた場合、
`flaggedForReviewAt` の計算方式が変わったことが原因である可能性が高いので、
その観点で確認する）

- [ ] **Step 6: 型チェック**

Run: `bun run type-check`
Expected: exit 0

- [ ] **Step 7: コミット**

```bash
git add src/shared/domain/customers/risk-detection.ts \
  __tests__/unit/domain/customers/risk-detection.test.ts
git commit -m "fix(admin): make Customer.flagReasons writes reason-scoped to prevent cross-cron clobbering"
```

---

### Task 2: 重複検出ドメインロジック + `DUPLICATE_CANDIDATE` 理由コード追加

**Files:**

- Create: `src/shared/domain/customers/duplicate-detection.ts`
- Modify: `src/shared/lib/validations/enums/helpers.ts`
- Test: `__tests__/integration/domain/customers/duplicate-detection.test.ts`（新規、
  実DB要 — 顧客の生成・emailCanonical/phoneNumber一致の検証に real fixture が必要）

**Interfaces:**

- Consumes: Task 1 の `reconcileFlagReasonsCommand`
- Produces: `detectDuplicateCandidates(): Promise<DetectedDuplicateCustomer[]>`、
  `applyDuplicateCandidateFlagsCommand(detected): Promise<number>`、
  `findDuplicateCandidateFor(customerId: string): Promise<DuplicateCandidateResult | null>`
  （Task 4 の MergeCustomerDialog プリフィルが消費する）

- [ ] **Step 1: `RISK_FLAG_REASON` に `DUPLICATE_CANDIDATE` を追加**

`src/shared/lib/validations/enums/helpers.ts` の `RISK_FLAG_REASON` ブロックを変更:

```ts
export const RISK_FLAG_REASON = {
  RAPID_BOOKING: "rapid_booking",
  FREQUENT_CANCELLATION: "frequent_cancellation",
  REPEATED_NO_SHOW: "repeated_no_show",
  DUPLICATE_CANDIDATE: "duplicate_candidate",
} as const;
```

`RISK_FLAG_REASON_LABELS` に追加:

```ts
export const RISK_FLAG_REASON_LABELS: Record<RiskFlagReason, string> = {
  [RISK_FLAG_REASON.RAPID_BOOKING]: "短時間に多数の予約/申込",
  [RISK_FLAG_REASON.FREQUENT_CANCELLATION]: "繰り返しキャンセル",
  [RISK_FLAG_REASON.REPEATED_NO_SHOW]: "無断キャンセル(NO_SHOW)多発",
  [RISK_FLAG_REASON.DUPLICATE_CANDIDATE]: "重複顧客の疑い",
};
```

- [ ] **Step 2: 失敗する統合テストを書く**

`__tests__/integration/domain/customers/duplicate-detection.test.ts` を新規作成
（実装前に `prisma/schema.prisma` の `Customer` モデルの必須フィールドを直接読み、
以下フィクスチャが漏れなく必須フィールドを満たすか確認すること — このプロジェクトの
過去の全タスクで計画のサンプルフィクスチャは何らかの点で stale だったため、
必ず現物の schema.prisma と突合してから使う）:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

const { prisma: basePrisma } = await import("@/shared/db/prisma");
const { detectDuplicateCandidates, findDuplicateCandidateFor } =
  await import("@/shared/domain/customers/duplicate-detection");

describe("detectDuplicateCandidates / findDuplicateCandidateFor", () => {
  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("emailCanonical が一致する2顧客をペアとして検出する", async () => {
    const sharedEmail = `dup-email-${randomUUID()}@example.com`;
    const a = await basePrisma.customer.create({
      data: {
        lastName: "山田",
        firstName: "太郎",
        email: sharedEmail,
        emailCanonical: sharedEmail,
      },
    });
    const b = await basePrisma.customer.create({
      data: {
        lastName: "山田",
        firstName: "次郎",
        email: sharedEmail,
        emailCanonical: sharedEmail,
      },
    });

    const detected = await detectDuplicateCandidates();
    const detectedIds = detected.map((d) => d.customerId);
    expect(detectedIds).toContain(a.id);
    expect(detectedIds).toContain(b.id);

    const candidate = await findDuplicateCandidateFor(a.id);
    expect(candidate?.id).toBe(b.id);

    await basePrisma.customer.delete({ where: { id: a.id } });
    await basePrisma.customer.delete({ where: { id: b.id } });
  });

  test("phoneNumber が完全一致する2顧客をペアとして検出する(email は別)", async () => {
    const sharedPhone = "090-1234-5678";
    const a = await basePrisma.customer.create({
      data: {
        lastName: "佐藤",
        firstName: "花子",
        email: `phone-dup-a-${randomUUID()}@example.com`,
        emailCanonical: `phone-dup-a-${randomUUID()}@example.com`,
        phoneNumber: sharedPhone,
      },
    });
    const b = await basePrisma.customer.create({
      data: {
        lastName: "佐藤",
        firstName: "次子",
        email: `phone-dup-b-${randomUUID()}@example.com`,
        emailCanonical: `phone-dup-b-${randomUUID()}@example.com`,
        phoneNumber: sharedPhone,
      },
    });

    const detected = await detectDuplicateCandidates();
    const detectedIds = detected.map((d) => d.customerId);
    expect(detectedIds).toContain(a.id);
    expect(detectedIds).toContain(b.id);

    await basePrisma.customer.delete({ where: { id: a.id } });
    await basePrisma.customer.delete({ where: { id: b.id } });
  });

  test("一致する相手がいない顧客は検出されない", async () => {
    const solo = await basePrisma.customer.create({
      data: {
        lastName: "鈴木",
        firstName: "一郎",
        email: `solo-${randomUUID()}@example.com`,
        emailCanonical: `solo-${randomUUID()}@example.com`,
      },
    });

    const candidate = await findDuplicateCandidateFor(solo.id);
    expect(candidate).toBeNull();

    await basePrisma.customer.delete({ where: { id: solo.id } });
  });
});
```

このテストを `scripts/test-db-runner-env.ts` の `SERIAL_DB_TESTS` にフルパス登録する
（このプロジェクトの必須ルール、未登録だと並列バケットで共有DBと競合する）。

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `bun scripts/run-tests.ts __tests__/integration/domain/customers/duplicate-detection.test.ts`
Expected: FAIL — モジュールが存在しない。

- [ ] **Step 4: `duplicate-detection.ts` を実装**

`src/shared/domain/customers/duplicate-detection.ts` を新規作成:

```ts
import "server-only";

import { prisma } from "@/shared/db/prisma";
import { RISK_FLAG_REASON } from "@/shared/lib/validations/enums/helpers";
import { reconcileFlagReasonsCommand } from "./risk-detection";

const DUPLICATE_DETECTION_OWNED_REASONS = [
  RISK_FLAG_REASON.DUPLICATE_CANDIDATE,
] as const;

export type DetectedDuplicateCustomer = {
  readonly customerId: string;
};

export type DuplicateCandidateResult = {
  readonly id: string;
  readonly lastName: string;
  readonly firstName: string;
  readonly email: string;
};

/**
 * `emailCanonical` 一致または `phoneNumber` 完全一致（ファジーマッチは対象外、
 * 設計docのユーザー決定）でグループ化し、2件以上のグループに属する全顧客を
 * 検出結果として返す。3件以上のグループも「重複の疑いあり」として全員フラグする
 * （マージ候補の1件への絞り込みは `findDuplicateCandidateFor` が個別に行う）。
 */
export async function detectDuplicateCandidates(): Promise<
  DetectedDuplicateCustomer[]
> {
  const [emailGroups, phoneGroups] = await Promise.all([
    prisma.customer.groupBy({
      by: ["emailCanonical"],
      _count: { _all: true },
      having: { emailCanonical: { _count: { gte: 2 } } },
    }),
    prisma.customer.groupBy({
      by: ["phoneNumber"],
      where: { phoneNumber: { not: null } },
      _count: { _all: true },
      having: { phoneNumber: { _count: { gte: 2 } } },
    }),
  ]);

  const customerIds = new Set<string>();

  if (emailGroups.length > 0) {
    const rows = await prisma.customer.findMany({
      where: {
        emailCanonical: { in: emailGroups.map((g) => g.emailCanonical) },
      },
      select: { id: true },
    });
    for (const row of rows) customerIds.add(row.id);
  }

  if (phoneGroups.length > 0) {
    const phoneNumbers = phoneGroups
      .map((g) => g.phoneNumber)
      .filter((p): p is string => p !== null);
    if (phoneNumbers.length > 0) {
      const rows = await prisma.customer.findMany({
        where: { phoneNumber: { in: phoneNumbers } },
        select: { id: true },
      });
      for (const row of rows) customerIds.add(row.id);
    }
  }

  return Array.from(customerIds).map((customerId) => ({ customerId }));
}

/** 検知結果を Customer.flagReasons に反映する（Task 1 の reconcile 経由）。 */
export async function applyDuplicateCandidateFlagsCommand(
  detected: readonly DetectedDuplicateCustomer[],
): Promise<number> {
  let updated = 0;
  for (const { customerId } of detected) {
    updated += await reconcileFlagReasonsCommand(customerId, {
      ownedReasons: DUPLICATE_DETECTION_OWNED_REASONS,
      detectedReasons: [RISK_FLAG_REASON.DUPLICATE_CANDIDATE],
    });
  }
  return updated;
}

/**
 * 指定顧客と emailCanonical または phoneNumber が一致する、最も古い（作成日時が
 * 早い）他の顧客を1件返す。cron の検知結果を新規フィールドとして永続化するのでは
 * なく、クリック時に都度検索することで、データ変化に対して stale にならない。
 * 一致する相手が居なければ null（複数一致する場合も最古の1件のみ返す —
 * MergeCustomerDialog は1候補のプリフィルのみサポートするため）。
 */
export async function findDuplicateCandidateFor(
  customerId: string,
): Promise<DuplicateCandidateResult | null> {
  const self = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { emailCanonical: true, phoneNumber: true },
  });
  if (!self) return null;

  const candidate = await prisma.customer.findFirst({
    where: {
      id: { not: customerId },
      OR: [
        { emailCanonical: self.emailCanonical },
        ...(self.phoneNumber ? [{ phoneNumber: self.phoneNumber }] : []),
      ],
    },
    select: { id: true, lastName: true, firstName: true, email: true },
    orderBy: { createdAt: "asc" },
  });

  return candidate;
}
```

- [ ] **Step 5: テストを実行して通ることを確認する**

Run: `bun scripts/run-tests.ts __tests__/integration/domain/customers/duplicate-detection.test.ts`
Expected: PASS

- [ ] **Step 6: 型チェック**

Run: `bun run type-check`
Expected: exit 0

- [ ] **Step 7: コミット**

```bash
git add src/shared/domain/customers/duplicate-detection.ts \
  src/shared/lib/validations/enums/helpers.ts \
  __tests__/integration/domain/customers/duplicate-detection.test.ts \
  scripts/test-db-runner-env.ts
git commit -m "feat(admin): add duplicate-customer detection domain logic"
```

---

### Task 3: 重複検出cronルート新設

**Files:**

- Create: `src/app/api/cron/customer-duplicate-scan/route.ts`
- Test: `__tests__/unit/api/cron-customer-duplicate-scan.test.ts`
- Modify: `__tests__/unit/architecture/cron-oidc-clean-break.test.ts`
- Modify: `scripts/setup-cloud-scheduler.sh`

**Interfaces:**

- Consumes: Task 2 の `detectDuplicateCandidates`/`applyDuplicateCandidateFlagsCommand`

- [ ] **Step 1: 既存の `customer-risk-scan` route を実装前に読む**

`src/app/api/cron/customer-risk-scan/route.ts` を全文読み、実装時に完全にミラーする
（`connection()` → `authorizeCronRequest` → 通知重複防止チェック → 検知 → 反映 →
通知作成、の順序を厳守する）。実装前にこのファイルを直接読むこと（本 brief の
サンプルコードだけを信用しない）。

- [ ] **Step 2: 失敗するテストを書く**

`__tests__/unit/api/cron-customer-duplicate-scan.test.ts` を、既存の
`__tests__/unit/api/cron-customer-risk-scan.test.ts`（先に読むこと）と同型の
mock 構成で新規作成し、以下を検証する:

- 認証失敗時は `authorizeCronRequest` のエラーレスポンスをそのまま返す
- 検知0件なら `detected: 0` を返し `applyDuplicateCandidateFlagsCommand` を呼ばない
- 検知N件なら `applyDuplicateCandidateFlagsCommand` を呼び `detected: N` を返す
- 例外時は `jsonError` で 500 を返す

（具体的な mock 対象・アサーションは `cron-customer-risk-scan.test.ts` の実物を見て
1:1 で対応させること。通知重複防止に使う `NOTIFICATION_TYPE` の値は新規追加が
必要な場合、`src/shared/lib/validations/enums/helpers.ts` の `NOTIFICATION_TYPE`
定数と `NOTIFICATION_TYPE_LABELS` の両方に追加すること。）

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/api/cron-customer-duplicate-scan.test.ts`
Expected: FAIL — route が存在しない。

- [ ] **Step 4: cron route を実装**

`src/app/api/cron/customer-duplicate-scan/route.ts` を新規作成し、
`customer-risk-scan/route.ts` の構造を完全にミラーする（`authorizeCronRequest`
の `operation` は `"customerDuplicateScan"`、`detectDuplicateCandidates()` /
`applyDuplicateCandidateFlagsCommand()` を呼ぶ。通知重複防止は既存の
`NOTIFICATION_TYPE.CUSTOMER_FLAGGED` を再利用するか、新規
`CUSTOMER_DUPLICATE_DETECTED` を追加するかは実装時に既存の
`NOTIFICATION_TYPE` 定数を読んで判断する — 既存の型を再利用できるなら
新規追加しない方がシンプル）。feature module gate は
`customer-risk-scan` と同じ理由（Customer は単一 feature module に
紐付かない）で設けない。

- [ ] **Step 5: `cronRoutePaths` に新ルートを登録**

`__tests__/unit/architecture/cron-oidc-clean-break.test.ts` の `cronRoutePaths`
配列（既存の `"src/app/api/cron/customer-risk-scan/route.ts"` 等のエントリを
grep で見つける）に `"src/app/api/cron/customer-duplicate-scan/route.ts"` を追加する。

- [ ] **Step 6: `scripts/setup-cloud-scheduler.sh` の `JOBS` 配列に登録**

既存の `customer-risk-scan` エントリの書式に合わせて追加する（週次でなく日次、
設計doc通り）:

```bash
"customer-duplicate-scan|0 3 * * *|/api/cron/customer-duplicate-scan|重複顧客自動検出（日次）"
```

（既存の `customer-risk-scan` エントリの実際のcron式・区切り文字は実装時に
このファイルを直接読んで確認し、完全に同じ書式で追記すること。）

- [ ] **Step 7: テストを実行して通ることを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/api/cron-customer-duplicate-scan.test.ts __tests__/unit/architecture/cron-oidc-clean-break.test.ts`
Expected: PASS

- [ ] **Step 8: 型チェック + lint**

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 9: コミット**

```bash
git add src/app/api/cron/customer-duplicate-scan/route.ts \
  __tests__/unit/api/cron-customer-duplicate-scan.test.ts \
  __tests__/unit/architecture/cron-oidc-clean-break.test.ts \
  scripts/setup-cloud-scheduler.sh
git commit -m "feat(admin): add daily customer-duplicate-scan cron job"
```

---

### Task 4: MergeCustomerDialog のプリフィル対応 + 起動導線

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/customers/_components/MergeCustomerDialog.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/customers/[id]/_components/CustomerDetail.tsx`
  （または `CustomerDetailActions` — 実装前に `MergeCustomerDialog` の現在の呼出し元を
  grep で確認し、正しいファイルを編集すること）
- Create: 新規 admin action（重複候補の検索。Task 2 の `findDuplicateCandidateFor`
  を呼ぶ薄いラッパー）
- Test: `__tests__/unit/components/admin/merge-customer-dialog.test.tsx`（既存が
  あれば追記）

**Interfaces:**

- Consumes: Task 2 の `findDuplicateCandidateFor`

- [ ] **Step 1: `MergeCustomerDialog.tsx` の現在の呼出し元を確認する**

`grep -rn "MergeCustomerDialog" src/app/'(admin)'` で呼出し元ファイルを特定し、
全文読む（設計doc・事前調査では `CustomerDetailActions` 経由の可能性が高いが、
実装前に必ず現物を確認すること）。

- [ ] **Step 2: 重複候補検索の薄い admin action を新設**

`src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts` に追加
（実装前にファイル冒頭の import と既存 action の書式を確認し、合わせること）:

```ts
export async function findDuplicateCandidateForCustomer(
  customerId: string,
): Promise<
  MutationResult<{
    candidate: {
      id: string;
      lastName: string;
      firstName: string;
      email: string;
    } | null;
  }>
> {
  const validated = idSchema.safeParse(customerId);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "read",
    resourceId: validated.data,
    execute: async () => {
      const candidate = await findDuplicateCandidateFor(validated.data);
      return { candidate };
    },
  });
}
```

（`idSchema`・`executeAdminMutationResult`・`createValidationMutationError` の import
元は同ファイル内の既存 action から確認すること。`resource: "customer", action: "read"`
の組み合わせが admin permission 定義に存在するか確認し、無ければ既存の
`"customer"/"read"` を使う他の action を参考にする。）

- [ ] **Step 3: `MergeCustomerDialog.tsx` に `initialCandidate` optional prop を追加**

現在の props 型（`sourceCustomer`/`open`/`onOpenChange`）に追加:

```ts
type Props = {
  sourceCustomer: {
    id: string;
    lastName: string;
    firstName: string;
    email: string;
  };
  /**
   * 重複検出cronが検知した候補を、検索操作なしで初期選択状態にする
   * (Phase 4: 顧客管理強化)。未指定なら従来通り空の検索状態で開く。
   */
  initialCandidate?: {
    id: string;
    lastName: string;
    firstName: string;
    email: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
```

コンポーネント内部の `selected`/`results` state の初期値を `initialCandidate` から
シードする（実装前に現在の `useState` 呼び出し箇所を確認し、正しい型に合わせること。
`open` が `true` になるたびに再シードする必要がある場合は `useEffect` を使うが、
まず現在の実装がダイアログを閉じるたびに state をリセットしているかを確認し、
既存のリセットパターンに合わせること）。

- [ ] **Step 4: 呼出し元で `findDuplicateCandidateForCustomer` を呼び、結果を prop で渡す**

Step 1 で特定した呼出し元コンポーネントで、マージダイアログを開くボタンの
`onClick` ハンドラを非同期化し、`findDuplicateCandidateForCustomer(customer.id)`
を呼んでから `initialCandidate` 付きでダイアログを開く。`要注意`カードに
`DUPLICATE_CANDIDATE` が含まれる場合のみこの事前検索を行い、含まれなければ
従来通り即座に（`initialCandidate` なしで）開く。

- [ ] **Step 5: 型チェック + lint**

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 6: ブラウザで手動確認**

重複検出cronで `DUPLICATE_CANDIDATE` フラグが付いた顧客の詳細ページで
マージダイアログを開くと候補が事前選択済みであること、フラグの無い顧客では
従来通り空の検索状態で開くことを確認する。

- [ ] **Step 7: コミット**

```bash
git add "src/app/(admin)/admin/(dashboard)/customers/_components/MergeCustomerDialog.tsx" \
  src/app/"(admin)"/admin/"(dashboard)"/_shared/actions/customer.ts
# Step 1 で特定した呼出し元ファイルも追加すること
git commit -m "feat(admin): prefill MergeCustomerDialog with detected duplicate candidate"
```

---

### Task 5: 顧客統計の手動再計算ボタン

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/customers/[id]/_components/CustomerDetail.tsx`
- Test: `__tests__/unit/actions/customer-recompute-stats.test.ts`（新規）

**Interfaces:**

- Consumes: 既存の `recomputeCustomerReservationStats(tx, customerId)`
  （`src/shared/domain/reservations/payloads.ts:264-295`）

- [ ] **Step 1: 失敗するユニットテストを書く**

`__tests__/unit/actions/customer-recompute-stats.test.ts` を新規作成
（`toggleCustomerActive`/`clearCustomerRiskFlag` の既存 unit test ファイルの
mock 構成をお手本にする — 同ディレクトリ内で grep して確認すること）:

```ts
import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockExecuteAdminMutationResult = mock();
const mockTransaction = mock();
const mockRecomputeCustomerReservationStats = mock(async () => undefined);

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: (
    ...args: Parameters<typeof mockExecuteAdminMutationResult>
  ) => mockExecuteAdminMutationResult(...args),
}));
mock.module("@/shared/db/prisma", () => ({
  prisma: { $transaction: (...args: unknown[]) => mockTransaction(...args) },
}));
mock.module("@/shared/domain/reservations/payloads", () => ({
  recomputeCustomerReservationStats: (
    ...args: Parameters<typeof mockRecomputeCustomerReservationStats>
  ) => mockRecomputeCustomerReservationStats(...args),
}));
mock.module("next/cache", () => ({
  updateTag: mock(() => undefined),
}));
mock.module("@/shared/lib/audit-request-context", () => ({
  buildAuditRequestContext: () =>
    Promise.resolve({ ip: null, userAgent: null }),
}));
mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: mock(async () => undefined),
}));
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise.catch(() => undefined);
  },
}));

const CUSTOMER_ID = "cm0customer1234567890123";

describe("recomputeCustomerStatsAction", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockReset();
    mockTransaction.mockReset();
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({}),
    );
    mockRecomputeCustomerReservationStats.mockReset();
    mockRecomputeCustomerReservationStats.mockResolvedValue(undefined);
  });

  test("不正な顧客IDは VALIDATION エラーになる", async () => {
    const { recomputeCustomerStatsAction } =
      await import("@/app/(admin)/admin/(dashboard)/_shared/actions/customer");
    const { isMutationError } = await import("@/shared/lib/mutation-result");

    const result = await recomputeCustomerStatsAction("not-a-cuid");
    expect(isMutationError(result)).toBe(true);
    expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
  });

  test("正しい顧客IDで recomputeCustomerReservationStats を tx 内で呼ぶ", async () => {
    mockExecuteAdminMutationResult.mockImplementation(async (options) =>
      options.execute({ id: "admin-1" }),
    );

    const { recomputeCustomerStatsAction } =
      await import("@/app/(admin)/admin/(dashboard)/_shared/actions/customer");

    await recomputeCustomerStatsAction(CUSTOMER_ID);

    expect(mockTransaction).toHaveBeenCalled();
    expect(mockRecomputeCustomerReservationStats).toHaveBeenCalledWith(
      expect.anything(),
      CUSTOMER_ID,
    );
    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "customer",
        action: "update",
        resourceId: CUSTOMER_ID,
      }),
    );
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/customer-recompute-stats.test.ts`
Expected: FAIL — `recomputeCustomerStatsAction` が存在しない。

- [ ] **Step 3: `recomputeCustomerStatsAction` を実装**

`src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts` に、
`toggleCustomerActive`（既存関数、同ファイル内）の直後に追加。既存の import
（`prisma`は直接使わずtoggleCustomerActiveの実装パターンに準拠しつつ、本関数は
transactionが必要な点が既存の同ファイル内関数と異なることに注意 — 実装前に
`@/shared/db/prisma` の import が既にこのファイルにあるか確認し、無ければ
追加すること。`src/app/(admin)/admin/*` からの Prisma 直 import は
`architecture-boundaries.test.ts` の thin-admin-action gate で禁止されている
可能性があるため、代わりに `recomputeCustomerReservationStats` 自体に
transaction 開始責務を持たせるラッパー関数をドメイン層
（`src/shared/domain/reservations/payloads.ts` または新規の
`src/shared/domain/customers/commands.ts`）に追加する方針に切り替えること。
具体的には次のドメイン層関数を新設する:

```ts
// src/shared/domain/customers/commands.ts (既存ファイルに追記。実装前に
// このファイルが実在し import 済みか確認すること)
export async function recomputeCustomerStatsCommand(
  customerId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await recomputeCustomerReservationStats(tx, customerId);
  });
}
```

そのうえで admin action 側は次の形にする:

```ts
export async function recomputeCustomerStatsAction(
  customerId: string,
): Promise<MutationResult<{ actorUserId: string }>> {
  const validated = idSchema.safeParse(customerId);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    resourceId: validated.data,
    execute: async (user) => {
      await recomputeCustomerStatsCommand(validated.data);
      return { actorUserId: user.id };
    },
    afterSuccess: (outcome) => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(validated.data));

      fireAndForget(
        createAuditLogRecord({
          userId: outcome.actorUserId,
          action: AuditAction.UPDATE,
          resource: "customer.stats",
          resourceId: validated.data,
          metadata: { trigger: "manual_recompute" },
        }),
        {
          operation: "auditLogRecomputeCustomerStats",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
        },
      );
    },
  });
}
```

（`idSchema`/`MutationResult`/`createValidationMutationError`/`AuditAction`/
`CACHE_TAGS`/`getCacheTag`/`fireAndForget`/`createAuditLogRecord`/`ErrorCategory`/
`ErrorSeverity` の import は `toggleCustomerActive` が既にこのファイルで import
済みのはずなので、そこから流用する。）

- [ ] **Step 4: `CustomerDetail.tsx` の「統計情報」カードにボタンを追加**

`統計情報` `DetailSection` の直後（実装前に現在のJSX構造を確認すること）に、
`ReservationDetail.tsx` の「顧客情報を更新」ボタンと同型のパターンで追加:

```tsx
const [isRecomputePending, startRecomputeTransition] = useTransition();

const handleRecomputeStats = () => {
  startRecomputeTransition(async () => {
    const result = await recomputeCustomerStatsAction(customer.id);
    if (isMutationError(result)) {
      toast.error(result.error);
    } else {
      toast.success("統計情報を再計算しました");
      router.refresh();
    }
  });
};
```

`統計情報` カードのフッターまたはヘッダー内に:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={handleRecomputeStats}
  disabled={isRecomputePending}
>
  {isRecomputePending ? "再計算中..." : "統計を再計算"}
</Button>
```

（`useTransition`/`useRouter`/`toast`/`isMutationError` が既に import 済みか
確認し、無ければ追加する。）

- [ ] **Step 5: テストを実行して通ることを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/customer-recompute-stats.test.ts`
Expected: PASS

- [ ] **Step 6: 型チェック + lint**

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 7: ブラウザで手動確認**

顧客詳細ページで「統計を再計算」ボタンを押し、成功トーストが出て
（値が変わっていれば）画面が更新されることを確認する。

- [ ] **Step 8: コミット**

```bash
git add src/app/"(admin)"/admin/"(dashboard)"/_shared/actions/customer.ts \
  src/shared/domain/customers/commands.ts \
  "src/app/(admin)/admin/(dashboard)/customers/[id]/_components/CustomerDetail.tsx" \
  __tests__/unit/actions/customer-recompute-stats.test.ts
git commit -m "feat(admin): add manual customer stats recompute button"
```

---

### Task 6: `updateAdminReservationCommand` の recompute トリガー条件拡張

**Files:**

- Modify: `src/shared/domain/reservations/admin-commands.ts`
- Test: `__tests__/unit/domain/reservations/commands.test.ts`（既存ファイルに追記）

**Interfaces:**

- Consumes: 既存の `recomputeCustomerReservationStats`

- [ ] **Step 1: 失敗するユニットテストを書く**

実装前に `src/shared/domain/reservations/admin-commands.ts` の
`updateAdminReservationCommand` 内の recompute トリガー条件ブロックを直接読み、
現在の正確な行番号・変数名を確認する（このプランの Global Constraints セクションで
既知の通り、この関数は今週の別PRで変更されており設計doc記載の行番号は
古くなっている可能性が高い）。

`__tests__/unit/domain/reservations/commands.test.ts` の
`describe("updateAdminReservationCommand", ...)` ブロック内、既存の正常系
テストの末尾に追記（既存の `mockRecomputeCustomerReservationStats` 相当の
mock 変数名を実ファイルから確認して使うこと）:

```ts
test("同一顧客のまま totalPrice のみ変更した場合も recompute が発火する", async () => {
  await updateAdminReservationCommand("res-1", {
    ...validInput,
    totalPrice: (validInput.totalPrice ?? 0) + 5000,
  });

  expect(mockRecomputeCustomerReservationStats).toHaveBeenCalled();
});

test("totalPrice・customerId とも変更が無ければ recompute は発火しない", async () => {
  mockRecomputeCustomerReservationStats.mockClear();
  await updateAdminReservationCommand("res-1", validInput);

  expect(mockRecomputeCustomerReservationStats).not.toHaveBeenCalled();
});
```

（`validInput` が既存テストファイル内でどう定義されているか、
`mockRecomputeCustomerReservationStats` という mock 変数が既に存在するか
（Phase 2/3 の既存テストで同名の mock を使っている可能性が高い）を実ファイルで
確認し、無ければ同ファイル内の mock.module 宣言に追加すること。）

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/domain/reservations/commands.test.ts`
Expected: FAIL — 新規テストが、現状 customerId 変更時のみ発火する実装に対して失敗する。

- [ ] **Step 3: recompute トリガー条件を拡張**

`admin-commands.ts` の該当ブロック（Step 1 で確認した実際の行）を変更する。
現状:

```ts
if (currentReservation.customerId !== input.customerId) {
  await recomputeCustomerReservationStats(tx, currentReservation.customerId);
  await recomputeCustomerReservationStats(tx, input.customerId);
}
```

これを、「顧客が変わった場合」と「同一顧客のまま金額が変わった場合」の両方で
発火するよう拡張する（顧客変更時は旧顧客・新顧客の両方を再計算、金額のみ変更時は
同一顧客を1回だけ再計算 — 二重発火させない）:

```ts
if (currentReservation.customerId !== input.customerId) {
  await recomputeCustomerReservationStats(tx, currentReservation.customerId);
  await recomputeCustomerReservationStats(tx, input.customerId);
} else if (
  input.totalPrice !== undefined &&
  currentReservation.totalPrice !== finalTotalPrice
) {
  // Phase 4: 顧客管理強化で既知の穴を修正。同一顧客のまま totalPrice のみ
  // 変更した場合、これまで Customer.totalSpent が再計算されず stale な
  // ままだった（上記コメント参照）。
  await recomputeCustomerReservationStats(tx, input.customerId);
}
```

（`currentReservation.totalPrice` と `finalTotalPrice` という変数名が実際に
このスコープに存在するかを Step 1 で確認した実ファイルで必ず確認すること。
存在しない場合は、この関数内で最終的に確定した totalPrice を保持している
実際の変数名に置き換える。）

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/domain/reservations/commands.test.ts`
Expected: PASS（既存テストも含め全件）

- [ ] **Step 5: 型チェック**

Run: `bun run type-check`
Expected: exit 0

- [ ] **Step 6: コミット**

```bash
git add src/shared/domain/reservations/admin-commands.ts \
  __tests__/unit/domain/reservations/commands.test.ts
git commit -m "fix(admin): recompute customer stats when totalPrice changes on same customer"
```

---

### Task 7: `getCustomerById` へのイベント参加履歴 include 追加

**Files:**

- Modify: `src/shared/domain/customers/queries.ts`
- Modify: `src/shared/domain/customers/types.ts`
- Test: `__tests__/integration/domain/customers/queries.test.ts`（既存ファイルが
  あれば追記、無ければ新規作成 — 実装前に `__tests__/` 配下で
  `getCustomerById` を検証する既存テストの有無を grep で確認すること）

**Interfaces:**

- Produces: `CustomerWithReservationsAndAccount` に `eventRegistrations` フィールドが
  追加される（Task 8 が消費する）

- [ ] **Step 1: 失敗するテストを書く**

（既存テストファイルの有無に応じて新規作成または追記。実DBが必要なら
`SERIAL_DB_TESTS` への登録も忘れないこと。）フィクスチャは Event/EventTimeSlot/
EventTicket/EventRegistration の作成が必要になるため、既存の
`__tests__/integration/domain/events/` 配下の類似フィクスチャ（Phase 2 で
何度も使われたパターン）を参考にする — 特に Event の必須フィールド
（`descriptionJson`/`descriptionHtml`/`descriptionPlainText`/`scheduleMode`/
`registrationOpen`/`firstSlotStartAt`/`lastSlotEndAt`）を漏らさないこと。

```ts
test("getCustomerById は customerId に紐づくイベント参加履歴を含む(最新20件)", async () => {
  // Customer + Event(+ Slot + Ticket) + EventRegistration(customerId: customer.id) を作成
  const result = await getCustomerById(customer.id);
  expect(result?.eventRegistrations).toHaveLength(1);
  expect(result?.eventRegistrations[0]?.event.title).toBe(event.title);
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: 対象テストファイルを `bun scripts/run-tests.ts` で実行。
Expected: FAIL — `eventRegistrations` が存在しない。

- [ ] **Step 3: `getCustomerById` の include にイベント参加履歴を追加**

`src/shared/domain/customers/queries.ts` の `getCustomerById` の
`prisma.customer.findUnique` の `include` に追加:

```ts
      eventRegistrations: {
        include: {
          event: {
            select: { id: true, title: true, slug: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
```

戻り値のマッピング処理（`reservations` を `CustomerReservationRecord[]` に
変換している箇所の近く）に、同様の `eventRegistrations` マッピングを追加する
（実装時に現在のマッピング関数の正確な形を確認し、同じスタイルで書くこと。
日付フィールドは `Serialized<>` 型に合わせて ISO 文字列化が必要な点に注意 —
既存の `reservations` マッピングが `startTime`/`endTime` をどう変換しているか
確認して合わせること）。

- [ ] **Step 4: `types.ts` に型を追加**

`src/shared/domain/customers/types.ts` に追加:

```ts
type CustomerEventRegistrationRecord = {
  id: string;
  status: RegistrationStatus;
  quantity: number;
  createdAt: Date;
  event: { id: string; title: string; slug: string };
};
```

`CustomerWithReservationsAndAccount` 型に `eventRegistrations` を追加
（既存フィールドは変更しない加算のみのため非破壊）:

```ts
export type CustomerWithReservationsAndAccount = Serialized<
  CustomerRecord & {
    reservations: CustomerReservationRecord[];
    eventRegistrations: CustomerEventRegistrationRecord[];
    user: { accounts: CustomerAccountInfo[] } | null;
    emailDeliveryStatus: EmailDeliveryStatus;
  }
>;
```

（`RegistrationStatus` の import 元が `@/shared/lib/validations/enums/prisma-types`
であることを確認する — `@generated/prisma` からの直 import は禁止。）

- [ ] **Step 5: テストを実行して通ることを確認する**

Run: 対象テストファイルを `bun scripts/run-tests.ts` で実行。
Expected: PASS

- [ ] **Step 6: 型チェック**

Run: `bun run type-check`
Expected: exit 0（既存の `getCustomerById` 呼出し元が壊れていないことを確認 —
`CustomerWithReservationsAndAccount` を消費する箇所は加算のみのため
型エラーは出ないはず）

- [ ] **Step 7: コミット**

```bash
git add src/shared/domain/customers/queries.ts src/shared/domain/customers/types.ts \
  # Step 1 で作成/変更したテストファイルも追加すること
git commit -m "feat(admin): include event registration history in getCustomerById"
```

---

### Task 8: 顧客詳細への「イベント参加履歴」カード追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/customers/[id]/_components/CustomerDetail.tsx`

**Interfaces:**

- Consumes: Task 7 の `CustomerWithReservationsAndAccount.eventRegistrations`

- [ ] **Step 1: 既存の「予約履歴」カードの直後にイベント参加履歴カードを追加**

`CustomerDetail.tsx` の「予約履歴（最新20件）」`Card`（実装前に正確な行番号を
確認すること）の直後に、同型のカードを追加する:

```tsx
{
  /* イベント参加履歴 */
}
<Card>
  <CardHeader>
    <CardTitle>イベント参加履歴（最新20件）</CardTitle>
  </CardHeader>
  <CardContent>
    {customer.eventRegistrations.length === 0 ? (
      <p className="text-muted-foreground text-center py-4">
        イベント参加履歴がありません
      </p>
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>イベント名</TableHead>
            <TableHead>申込日</TableHead>
            <TableHead>数量</TableHead>
            <TableHead>ステータス</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customer.eventRegistrations.map((registration) => (
            <TableRow key={registration.id}>
              <TableCell className="font-medium">
                {registration.event.title}
              </TableCell>
              <TableCell>
                {formatDateTimeShort(registration.createdAt)}
              </TableCell>
              <TableCell>{registration.quantity}</TableCell>
              <TableCell>
                <RegistrationStatusBadge status={registration.status} />
              </TableCell>
              <TableCell>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/events/${registration.event.id}`}>
                    詳細
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
  </CardContent>
</Card>;
```

（`RegistrationStatusBadge` は `@/admin/components/status-badges` から import
する。「詳細」リンクは登録単体の専用ページが存在しないため、対象イベントの
管理詳細ページ `/admin/events/${event.id}` へのリンクとする — 実装前に
`/admin/events/[id]` ルートが実在することを確認すること。）

- [ ] **Step 2: 型チェック + lint**

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 3: ブラウザで手動確認**

イベントに申込済みの顧客の詳細ページを開き、「イベント参加履歴」カードに
正しく表示され、「詳細」リンクが対象イベントの管理ページに遷移することを確認する。
申込が無い顧客では空状態メッセージが表示されることも確認する。

- [ ] **Step 4: コミット**

```bash
git add "src/app/(admin)/admin/(dashboard)/customers/[id]/_components/CustomerDetail.tsx"
git commit -m "feat(admin): add event registration history card to customer detail"
```

---

### Task 9: 顧客一括メール送信（ドメイン層）

**Files:**

- Create: `src/shared/emails/customer-broadcast.tsx`
- Create: `src/shared/emails/customer-broadcast.fixture.ts`
- Modify: `src/shared/emails/_registry/data.ts`
- Modify: `src/shared/emails/_registry/index.ts`
- Modify: `src/shared/lib/email/customer-emails.ts`（無ければ新規作成 — 実装前に
  `src/shared/lib/email/` 配下の既存ファイル構成を確認すること）
- Modify: `src/shared/lib/rate-limit.ts`
- Test: `__tests__/unit/lib/email/customer-broadcast.test.ts`（新規、
  `sendEventBroadcast` の既存テストがあれば同型の mock 構成を踏襲する）

**Interfaces:**

- Produces: `sendCustomerBroadcast(customerIds: string[], params: {subject: string;
body: string; broadcastNonce: string}) => Promise<CustomerBroadcastResult>`
  （Task 10 の action が消費する）

- [ ] **Step 1: `.claude/skills/add-email-template/SKILL.md` を読む**

実装前にこのスキルファイルを読み、テンプレート追加の正確な手順（component +
fixture + `_registry` の3点セットの正確な形）を確認する。

- [ ] **Step 2: 失敗するユニットテストを書く**

`__tests__/unit/lib/email/customer-broadcast.test.ts` を新規作成
（`src/shared/lib/email/event-emails.ts` の `sendEventBroadcast` に対応する
既存テストファイルがあれば grep で見つけて同型の mock 構成をコピーする）:

```ts
import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockFindMany = mock();
const mockSendEmail = mock(
  async () => ({ ok: true, messageId: "msg-1" }) as const,
);
const mockGetEmailFooterData = mock(async () => ({ siteName: "Myrrh" }));

mock.module("@/shared/db/prisma", () => ({
  prisma: { customer: { findMany: mockFindMany } },
}));
mock.module("@/shared/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));
mock.module("@/shared/emails/_shared/footer-data", () => ({
  getEmailFooterData: () => mockGetEmailFooterData(),
}));

const { sendCustomerBroadcast } =
  await import("@/shared/lib/email/customer-emails");

describe("sendCustomerBroadcast", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg-1" });
  });

  test("marketingOptIn: false の顧客は送信対象から除外し excluded に計上する", async () => {
    mockFindMany.mockResolvedValue([
      { id: "c1", email: "a@example.com", marketingOptIn: true },
    ]);

    const result = await sendCustomerBroadcast(["c1", "c2"], {
      subject: "お知らせ",
      body: "本文",
      broadcastNonce: "nonce-1",
    });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["c1", "c2"] },
          marketingOptIn: true,
        }),
      }),
    );
    expect(result.sent).toBe(1);
    expect(result.excluded).toBe(1);
  });

  test("全員 opt-out の場合は送信0件・excluded=選択数で成功扱いにする", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await sendCustomerBroadcast(["c1", "c2"], {
      subject: "お知らせ",
      body: "本文",
      broadcastNonce: "nonce-2",
    });

    expect(result.ok).toBe(true);
    expect(result.sent).toBe(0);
    expect(result.excluded).toBe(2);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test("送信成功件数を正しくカウントする", async () => {
    mockFindMany.mockResolvedValue([
      { id: "c1", email: "a@example.com", marketingOptIn: true },
      { id: "c2", email: "b@example.com", marketingOptIn: true },
    ]);
    mockSendEmail
      .mockResolvedValueOnce({ ok: true, messageId: "m1" })
      .mockResolvedValueOnce({ ok: false, reason: "suppressed" });

    const result = await sendCustomerBroadcast(["c1", "c2"], {
      subject: "お知らせ",
      body: "本文",
      broadcastNonce: "nonce-3",
    });

    expect(result.sent).toBe(1);
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/lib/email/customer-broadcast.test.ts`
Expected: FAIL — モジュールが存在しない。

- [ ] **Step 4: `CustomerBroadcastEmail` テンプレートを実装**

`src/shared/emails/customer-broadcast.tsx` を新規作成し、
`src/shared/emails/event-broadcast.tsx`（`EventBroadcastEmail`、Step 1 で全文を
読んだはず）を完全にミラーするが、`eventTitle`/`eventUrl` を持たない
（顧客一斉送信は特定イベントに紐づかないため）:

```tsx
import { Hr, Section, Text } from "@react-email/components";
import { customerBroadcastFixture } from "./customer-broadcast.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  detailsHeading,
  detailsSection,
  heading,
  hr,
  text,
} from "./_shared/styles";

type Props = {
  /** 管理者が入力した件名。本メールの subject にも使う。 */
  subject: string;
  /**
   * 管理者が入力した本文（plain text）。全員共通のbodyとして送るため
   * 個人名プレースホルダは含めない（EventBroadcastEmail と同じ設計判断）。
   * `whiteSpace: "pre-wrap"` で改行を保持して描画する。
   */
  bodyText: string;
  footer: EmailFooterData;
};

/**
 * 管理者オーサリング型 顧客一斉配信（Phase 4: 顧客管理強化）。
 *
 * `EventBroadcastEmail`（T12）と同じ設計判断: 全員共通の件名・本文を送る
 * ため customerName を含めない。個別署名が必要なユースケースは対象外。
 */
export function CustomerBroadcastEmail({ subject, bodyText, footer }: Props) {
  return (
    <EmailLayout preview={subject} footer={footer}>
      <Text style={heading}>{subject}</Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>お知らせ内容</Text>
        <Hr style={hr} />
        <Text style={{ ...text, whiteSpace: "pre-wrap", margin: 0 }}>
          {bodyText}
        </Text>
      </Section>

      <Hr style={hr} />

      <Text style={text}>
        ご不明な点がございましたら、本メールへ返信いただくかお問い合わせフォームより
        ご連絡ください。
      </Text>
    </EmailLayout>
  );
}

CustomerBroadcastEmail.PreviewProps = customerBroadcastFixture;

export default CustomerBroadcastEmail;
```

`src/shared/emails/customer-broadcast.fixture.ts` を新規作成（既存の
`event-broadcast.fixture.ts` を参考に、`subject`/`bodyText`/`footer` のみの
シンプルなフィクスチャにする）。

- [ ] **Step 5: `_registry` にエントリを追加**

Step 1 で読んだ `add-email-template` スキルの手順に厳密に従い、
`src/shared/emails/_registry/data.ts`（キー/ラベルのクライアントセーフ SSoT）と
`src/shared/emails/_registry/index.ts`（`defineEntry` によるフルエントリ）の
両方に `"customer-broadcast"` エントリを追加する。

- [ ] **Step 6: `sendCustomerBroadcast` を実装**

`src/shared/lib/email/customer-emails.ts` を新規作成（既存の
`event-emails.ts` の `sendEventBroadcast` を完全にミラーするが、
「登録済み参加者から email!==null を抽出」ではなく「指定 customerId 群から
`marketingOptIn: true` の顧客を抽出」する点が異なる）:

```ts
import "server-only";

import { prisma } from "@/shared/db/prisma";
import { sendEmail } from "@/shared/lib/email/send";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { CustomerBroadcastEmail } from "@/shared/emails/customer-broadcast";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { hashForKey } from "@/shared/lib/hash-for-key"; // 実装前に既存のハッシュ関数の
// 正確な import 元を event-emails.ts
// から確認すること

export type CustomerBroadcastResult = {
  readonly ok: boolean;
  readonly sent: number;
  readonly excluded: number;
};

/**
 * 選択された顧客のうち `marketingOptIn: true` の顧客のみへ一斉送信する
 * （`marketingOptIn: false` は excluded に計上、送信対象から除外 — 同意ゲート）。
 */
export async function sendCustomerBroadcast(
  customerIds: string[],
  params: { subject: string; body: string; broadcastNonce: string },
): Promise<CustomerBroadcastResult> {
  const recipients = await prisma.customer.findMany({
    where: { id: { in: customerIds }, marketingOptIn: true },
    select: { id: true, email: true },
  });

  const excluded = customerIds.length - recipients.length;

  if (recipients.length === 0) {
    return { ok: true, sent: 0, excluded };
  }

  const footer = await getEmailFooterData();

  const results = await Promise.allSettled(
    recipients.map((customer) =>
      sendEmail({
        payload: {
          to: customer.email,
          subject: params.subject,
          react: CustomerBroadcastEmail({
            subject: params.subject,
            bodyText: params.body,
            footer,
          }),
        },
        idempotencyKey: `customer-broadcast/${customer.id}/${hashForKey(customer.email)}/${params.broadcastNonce}`,
        operation: "sendCustomerBroadcast",
        context: { customerId: customer.id },
      }),
    ),
  );

  let sent = 0;
  for (const [i, result] of results.entries()) {
    if (result.status === "fulfilled" && result.value.ok) {
      sent += 1;
    } else if (result.status === "rejected") {
      const customer = recipients[i];
      if (customer) {
        logError(normalizeError(result.reason), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "sendCustomerBroadcast",
            customerId: customer.id,
          },
        });
      }
    }
  }

  return { ok: true, sent, excluded };
}
```

（`hashForKey` の正確な import パスは `event-emails.ts` の冒頭 import を見て
確認し、上記のプレースホルダパスを実際のパスに置き換えること。）

- [ ] **Step 7: レート制限を追加**

`src/shared/lib/rate-limit.ts` の `eventBroadcastRateLimiter` の直後に追加:

```ts
// 顧客一斉送信の暴走防止（1時間に3回まで）。IP でなく管理操作単位で十分
// （executeAdminMutationResult の RBAC + AuditLog と多層防御）。
export const customerBroadcastRateLimiter = createRateLimiter({
  interval: 60 * 60 * 1000,
  maxRequests: 3,
});
```

- [ ] **Step 8: テストを実行して通ることを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/lib/email/customer-broadcast.test.ts`
Expected: PASS

- [ ] **Step 9: 型チェック**

Run: `bun run type-check`
Expected: exit 0

- [ ] **Step 10: コミット**

```bash
git add src/shared/emails/customer-broadcast.tsx src/shared/emails/customer-broadcast.fixture.ts \
  src/shared/emails/_registry/data.ts src/shared/emails/_registry/index.ts \
  src/shared/lib/email/customer-emails.ts src/shared/lib/rate-limit.ts \
  __tests__/unit/lib/email/customer-broadcast.test.ts
git commit -m "feat(admin): add customer broadcast email domain layer"
```

---

### Task 10: 顧客一括メール送信（UI + Server Action）

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerBulkEmailDialog.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/customer/bulk.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerBulkActions.tsx`
- Test: `__tests__/unit/components/admin/customer-bulk-email-dialog.test.tsx`（新規）
- Test: `__tests__/unit/actions/customer-bulk-email.test.ts`（新規）

**Interfaces:**

- Consumes: Task 9 の `sendCustomerBroadcast`

- [ ] **Step 1: 失敗するコンポーネントテストを書く**

`__tests__/unit/components/admin/customer-bulk-email-dialog.test.tsx` を、
`CancellationReasonDialog.tsx` の既存テスト
（`__tests__/unit/components/admin/cancellation-reason-dialog.test.tsx`）と
同型の mock 構成（`@/admin/components/ui` の Dialog/Select/Input/Textarea/Button
スタブ）で新規作成する。以下2点を検証する:

- プリセット選択時に件名・本文が自動入力される
- 「送信する」押下で `onConfirm({subject, body})` が呼ばれる

（具体的な JSX 構造は Step 3 で実装するコンポーネントに合わせて後から
書き起こしても良いが、TDD として先に「こう呼ばれてほしい」というテストを
書くこと。`CancellationReasonDialog.tsx` の `REASON_PRESETS`/`handleConfirm`
パターンを直接参照して構造を合わせる。）

- [ ] **Step 2: 失敗する action ユニットテストを書く**

`__tests__/unit/actions/customer-bulk-email.test.ts` を新規作成（Phase 3 の
`__tests__/unit/actions/reservation-cancellation-reason.test.ts` の
mock.module 構成パターンを参考にする）:

```ts
import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockExecuteAdminMutationResult = mock();
const mockSendCustomerBroadcast = mock();
const mockCheckActionRateLimit = mock(async () => ({ success: true }) as const);

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: (
    ...args: Parameters<typeof mockExecuteAdminMutationResult>
  ) => mockExecuteAdminMutationResult(...args),
}));
mock.module("@/shared/lib/email/customer-emails", () => ({
  sendCustomerBroadcast: (
    ...args: Parameters<typeof mockSendCustomerBroadcast>
  ) => mockSendCustomerBroadcast(...args),
}));
mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: (
    ...args: Parameters<typeof mockCheckActionRateLimit>
  ) => mockCheckActionRateLimit(...args),
  createValidationMutationError: (error: unknown) => ({
    error: "validation failed",
    code: "VALIDATION",
    zodError: error,
  }),
}));
mock.module("@/shared/lib/rate-limit", () => ({
  customerBroadcastRateLimiter: { check: mock(async () => true) },
}));

const { broadcastCustomersAction } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/customer/bulk");
const { isMutationError } = await import("@/shared/lib/mutation-result");

const CUSTOMER_ID_1 = "cm0customer1234567890123";
const CUSTOMER_ID_2 = "cm0customer2234567890123";

describe("broadcastCustomersAction", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockReset();
    mockSendCustomerBroadcast.mockReset();
    mockExecuteAdminMutationResult.mockImplementation(async (options) =>
      options.execute({ id: "admin-1" }),
    );
  });

  test("空文字の subject は VALIDATION エラーになる", async () => {
    const result = await broadcastCustomersAction(
      [CUSTOMER_ID_1],
      "",
      "本文です",
    );
    expect(isMutationError(result)).toBe(true);
    expect(mockSendCustomerBroadcast).not.toHaveBeenCalled();
  });

  test("正しい入力で sendCustomerBroadcast を呼び sent/excluded を返す", async () => {
    mockSendCustomerBroadcast.mockResolvedValue({
      ok: true,
      sent: 1,
      excluded: 1,
    });

    const result = await broadcastCustomersAction(
      [CUSTOMER_ID_1, CUSTOMER_ID_2],
      "お知らせ",
      "本文です",
    );

    expect(isMutationError(result)).toBe(false);
    if (!isMutationError(result)) {
      expect(result.sent).toBe(1);
      expect(result.excluded).toBe(1);
    }
    expect(mockSendCustomerBroadcast).toHaveBeenCalledWith(
      [CUSTOMER_ID_1, CUSTOMER_ID_2],
      expect.objectContaining({ subject: "お知らせ", body: "本文です" }),
    );
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/components/admin/customer-bulk-email-dialog.test.tsx __tests__/unit/actions/customer-bulk-email.test.ts`
Expected: FAIL — モジュールが存在しない。

- [ ] **Step 4: `broadcastCustomersAction` を実装**

`src/app/(admin)/admin/(dashboard)/_shared/actions/customer/bulk.ts` に追加
（実装前にファイル冒頭の import と既存 bulk action の Zod schema パターンを
確認し、合わせること。既存の bulk action は id 配列を最大100件までに制限する
schema を使っているはずなのでそれを流用する）:

```ts
const broadcastSchema = z.object({
  customerIds: z
    .array(z.uuid({ error: "顧客IDが不正です" }))
    .min(1, { error: "1件以上選択してください" })
    .max(100, { error: "一度に送信できるのは100件までです" }),
  subject: z
    .string({ error: "件名を入力してください" })
    .trim()
    .min(1, "件名を入力してください")
    .max(200, "件名は200文字以内で入力してください"),
  body: z
    .string({ error: "本文を入力してください" })
    .trim()
    .min(1, "本文を入力してください")
    .max(5000, "本文は5000文字以内で入力してください"),
});

export async function broadcastCustomersAction(
  customerIds: string[],
  subject: string,
  body: string,
): Promise<MutationResult<{ sent: number; excluded: number }>> {
  const parsed = broadcastSchema.safeParse({ customerIds, subject, body });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  const rateLimit = await checkActionRateLimit({
    check: (_token) => customerBroadcastRateLimiter.check("customer-broadcast"),
  });
  if (!rateLimit.success) {
    return createMutationError(rateLimit.error, "VALIDATION");
    // 実装前に既存 bulk action がレート制限エラーをどう MutationResult に
    // 変換しているか確認し、同じ関数・書式に合わせること。
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    execute: async () => {
      const broadcastNonce = randomUUID();
      return sendCustomerBroadcast(parsed.data.customerIds, {
        subject: parsed.data.subject,
        body: parsed.data.body,
        broadcastNonce,
      });
    },
  });
}
```

（`MutationResult`/`createValidationMutationError`/`createMutationError`/
`executeAdminMutationResult`/`checkActionRateLimit` の import 元は同ファイル内の
既存 bulk action から確認して合わせること。AuditLog 記録は
`executeAdminMutationResult` 内の自動 `logAction`（resource:customer
action:update）に任せ、送信本文は個人情報増加を避けるため metadata に含めない
— `broadcastEventAction` と同じ判断。）

- [ ] **Step 5: `CustomerBulkEmailDialog.tsx` を実装**

`CancellationReasonDialog.tsx` の構造を完全にミラーするが、フィールドを
「キャンセル理由（プリセット+自由入力）」から「件名（Input）+ 本文
（プリセット+自由入力の Textarea）」に変更する:

```tsx
"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/admin/components/ui";

const BODY_PRESETS = [
  { value: "custom", label: "自由入力" },
  {
    value: "campaign",
    label: "キャンペーンのお知らせ",
    subject: "【お得なお知らせ】キャンペーンのご案内",
    body: "いつもご利用いただきありがとうございます。\n\n現在開催中のキャンペーンについてご案内いたします。",
  },
  {
    value: "maintenance",
    label: "メンテナンスのお知らせ",
    subject: "【重要】システムメンテナンスのお知らせ",
    body: "いつもご利用いただきありがとうございます。\n\n下記日程でシステムメンテナンスを実施いたします。",
  },
] as const;

const BODY_MAX = 5000;

interface CustomerBulkEmailDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: (options: { subject: string; body: string }) => void;
  readonly isPending: boolean;
  readonly targetCount: number;
}

export function CustomerBulkEmailDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  targetCount,
}: CustomerBulkEmailDialogProps) {
  const [preset, setPreset] = useState<string>("custom");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setPreset("custom");
    setSubject("");
    setBody("");
    setError(null);
  };

  const handlePresetChange = (value: string) => {
    setPreset(value);
    const found = BODY_PRESETS.find((p) => p.value === value);
    if (found && "subject" in found) {
      setSubject(found.subject);
      setBody(found.body);
    } else {
      setSubject("");
      setBody("");
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handleConfirm = () => {
    setError(null);
    if (subject.trim() === "") {
      setError("件名を入力してください。");
      return;
    }
    if (body.trim() === "") {
      setError("本文を入力してください。");
      return;
    }
    if (body.length > BODY_MAX) {
      setError(`本文は ${BODY_MAX} 文字以内で入力してください。`);
      return;
    }
    onConfirm({ subject: subject.trim(), body: body.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>一括メール送信</DialogTitle>
          <DialogDescription>
            {targetCount}{" "}
            件の顧客のうち、メール配信に同意済みの顧客のみに送信されます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bulk-email-preset">テンプレート</Label>
            <Select
              value={preset}
              onValueChange={handlePresetChange}
              disabled={isPending}
            >
              <SelectTrigger id="bulk-email-preset">
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent>
                {BODY_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-email-subject">件名</Label>
            <Input
              id="bulk-email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={isPending}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-email-body">本文</Label>
            <Textarea
              id="bulk-email-body"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={isPending}
              maxLength={BODY_MAX}
            />
            <p className="text-xs text-muted-foreground">
              {body.length} / {BODY_MAX}
            </p>
          </div>

          {error !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isPending}>
            {isPending ? "送信中..." : "送信する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: `CustomerBulkActions.tsx` に配線**

`CustomerBulkActions.tsx`（既に `AnonymizeCustomerConfirmDialog` の
open-state パターンがあるため同型で追加）に、新規 state・ハンドラ・ボタンを
追加する（実装前に現在のファイル全文を読み、既存の `isPending`/
`startTransition` を流用するか新規の `useTransition` を設けるかを、
Phase 3 の `ReservationBulkActions.tsx` で確立したパターン
（共有 `isPending` でも `FloatingBulkActionBar` のモーダルが同時操作を
構造的に防ぐため実害なし、と確認済み）に合わせて判断すること）:

```tsx
const [emailDialogOpen, setEmailDialogOpen] = useState(false);

const handleConfirmBulkEmail = (options: { subject: string; body: string }) => {
  startTransition(async () => {
    const result = await broadcastCustomersAction(
      selectedIds,
      options.subject,
      options.body,
    );
    if (isMutationError(result)) {
      toast.error(result.error);
      return;
    }
    const parts: string[] = [];
    if (result.sent > 0) parts.push(`${result.sent}件送信`);
    if (result.excluded > 0)
      parts.push(`${result.excluded}件除外(配信停止済み)`);
    toast.success(
      parts.length > 0 ? parts.join("、") : "対象者がいませんでした",
    );
    setEmailDialogOpen(false);
    onClear();
  });
};
```

`FloatingBulkActionBar` 内にボタンを追加:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => setEmailDialogOpen(true)}
  disabled={isPending}
>
  一括メール送信
</Button>
```

`CustomerBulkEmailDialog` をレンダー:

```tsx
<CustomerBulkEmailDialog
  open={emailDialogOpen}
  onOpenChange={setEmailDialogOpen}
  onConfirm={handleConfirmBulkEmail}
  isPending={isPending}
  targetCount={selectedIds.length}
/>
```

- [ ] **Step 7: テストを実行して通ることを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/components/admin/customer-bulk-email-dialog.test.tsx __tests__/unit/actions/customer-bulk-email.test.ts`
Expected: PASS

- [ ] **Step 8: 型チェック + lint**

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 9: ブラウザで手動確認**

顧客一覧で複数選択→「一括メール送信」→プリセット選択で件名・本文が
自動入力されること、自由入力に切り替えられること、送信後にsent/excluded件数が
toastに表示されることを確認する。

- [ ] **Step 10: コミット**

```bash
git add "src/app/(admin)/admin/(dashboard)/customers/_components/CustomerBulkEmailDialog.tsx" \
  src/app/"(admin)"/admin/"(dashboard)"/_shared/actions/customer/bulk.ts \
  "src/app/(admin)/admin/(dashboard)/customers/_components/CustomerBulkActions.tsx" \
  __tests__/unit/components/admin/customer-bulk-email-dialog.test.tsx \
  __tests__/unit/actions/customer-bulk-email.test.ts
git commit -m "feat(admin): add bulk email send to customer bulk actions"
```

---

### Task 11: 最終検証

**Files:** なし（検証のみ）

- [ ] **Step 1: 型チェック**

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 2: 全 unit テスト**

Run: `bun run test:unit`
Expected: 全件 PASS（既知の無関係なローカル環境変数アーティファクト
`server-production-env.test.ts` の失敗のみ許容）

- [ ] **Step 3: 全 integration テスト**

Run: `bun run test:integration`
Expected: 全件 PASS

- [ ] **Step 4: architecture-boundaries + cron-oidc-clean-break**

Run: `bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts __tests__/unit/architecture/cron-oidc-clean-break.test.ts`
Expected: PASS（新規 cron route の登録漏れが無いことを含む）

- [ ] **Step 5: ブラウザでの一連の手動確認（回帰含む）**

- 重複顧客が検出され `flaggedOnly` フィルタで可視化されること、マージダイアログが
  候補プリフィルで開くこと、既存の risk-scan による要注意フラグ（設定していれば）が
  重複検出cronの実行後も消えずに残っていること（reconcile の動作確認）
- 顧客詳細の「統計を再計算」ボタンが正しく動作すること
- 予約の金額のみ変更した保存で顧客の統計が更新されること
- 顧客詳細にイベント参加履歴が表示されること
- 顧客一括メール送信がプリセット/自由文どちらでも動作し、`marketingOptIn: false`
  の顧客が正しく除外されること
- 既存機能（顧客一括有効化/無効化・ステータス変更・匿名化、要注意フラグ手動クリア等）に
  regression が無いこと

- [ ] **Step 6: このファイルの全チェックボックスが埋まっていることを確認してから完了**
