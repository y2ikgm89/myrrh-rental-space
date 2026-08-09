# TermsAgreement 再同意フロー (LOGIN_SIGNUP scope) 設計

- 日付: 2026-07-18
- ステータス: 実装着手前(writing-plans相当)
- 出典: マイページ実装監査 (2026-07-18) の critic #7 - 「TermsScope が新版へ差し替わったときの再同意 UI が /mypage 全域に存在しない」

## 背景

現状、公開規約 (`TermsDocument`) が更新されても、既存の顧客に対して再同意を促す UI・強制ゲートは一切ない。

- `grep -rn 'reagree|re-agree|再同意|reconsent|re-consent'` → 0 件 (=全域未実装)
- LOGIN_SIGNUP scope の同意は初回サインアップの `SIGNUP_TERMS_COOKIE` 消費 (`SignupTermsConsumer` → `consumeSignupTermsAction`) 経由でのみ記録される
- 一度サインアップ済みの顧客が数ヶ月後に mypage に戻っても、規約が更新されていることに気づかない
- 結果: 変更後の規約に「無同意」のまま予約作成・問い合わせ送信・イベント参加が続く証跡が残り、電気通信事業法・特商法・利用規約変更の合理性判例のいずれの観点でもリスクが立つ

## 調査で確定した事実 (前提)

- **`TermsDocument` は versioning していない**。同一 `id` を上書き更新する SSoT モデルで、履歴は `TermsAgreement.contentSnapshot` (同意時 HTML 全文) + `contentHash: sha256(contentSnapshot)` (`prisma/schema.prisma:1770-1771`) が担っている
- **`TermsAgreement` は append-only**。update/updateMany/delete/deleteMany/upsert は src 全域で grep gate 禁止 (当時の rule §9「不変レコードシングルトン」)。再同意は必ず「新規 insert」で表現する
- **`TermsAgreement` は `(termsId, scope, agreedAt)` の複合レコード**。同一 `termsId` でも scope 違いは独立した契約として扱う。よって「予約フォームで RESERVATION scope 同意した」ことは LOGIN_SIGNUP scope 契約の代替にはならない
- **既存 gate `assertAllRequiredTermsAgreed` は 4 経路で稼働中**: RESERVATION / INQUIRY / EVENT_REGISTRATION / RESERVATION_SERIES scope で「client claim 集合 ⊇ サーバー側 required 集合」を強制 (`src/shared/lib/terms-consent-gate.ts`, `src/shared/domain/terms/queries.ts`)。**LOGIN_SIGNUP scope の gate は初回 cookie 消費のみで、以後は無い**
- **既存 SSoT: `getRequiredTermsByScope(scope)`** が `scopes: { has: scope }` で ARRAY contains 検索する SSoT (`src/shared/domain/terms/queries.ts:207-232`)。'use cache' 経由
- **`MypageAuthGate` (async SC)** は `await connection()` 冒頭 → `verifyCustomerSession` → `ensureCustomerLinked` → isActive check → email 未登録 redirect の順に gate 判定を積んでおり、そこに新規 gate を追加できる余地がある (`src/app/(public)/mypage/layout.tsx:50-81`)
- **mypage 配下の page 群** (現存): `/mypage`, `/mypage/events`, `/mypage/inquiries`, `/mypage/inquiries/[id]`, `/mypage/reservations/[id]`, `/mypage/reservations/[id]/edit`, `/mypage/settings`
- **cookie mutation は Server Component から不可** (Next.js 公式 canonical)。ただし本設計では cookie を触らない (cookie 経路は初回 signup 専用)
- **PII を含むクエリは `"use cache"` 禁止** ([[project_cache-pii-leak-projectwide-audit-2026-06-17]])。customer 単位の再同意判定は生 Prisma で書く

## 外部検証

- **電気通信事業法 第 27 条の 5 (通信の秘密・特定利用者情報の取扱い)** と **特定商取引法 第 11 条 (通信販売の広告)** ともに、規約改定時に利用者に周知して合意を得る運用を求める。個別合意 (interstitial での明示同意) が最も証跡が残る方式
- **民法 (改正民法 第 548 条の 4)** の定型約款変更判例: 「相手方に不利益をもたらす変更」は個別合意が原則。当システムは規約更新の重要度分類を持たないため、「LOGIN_SIGNUP scope の全 doc 差分」を一律「再同意対象」として扱うのが安全側 fallback
- **OWASP Session Management Cheat Sheet**: 「material change to terms after session established → force re-consent on next authenticated interaction」推奨。next-auth interstitial pattern と一致

## ゴール

1. LOGIN_SIGNUP scope の必須規約が新版に差し替わった (`sha256(contentHtml)` 差分検出) 顧客に対して、次回 mypage 進入時に**強制的に再同意 UI へ redirect** する
2. 未同意 (agreement 未存在) の顧客も同じ経路で吸収する (cookie 消費失敗 or scope 後付け追加のリカバリ)
3. **過去分の予約・問い合わせ・イベント履歴の閲覧は許可**する ("証跡アクセスは agreement 前提外"・領収書 DL・税務資料アクセスを閉ざさない)
4. 再同意記録は append-only 契約準拠で「新規 `TermsAgreement.createMany` insert」のみで表現する
5. LINE ログインでメール未登録の顧客が settings 強制 redirect 中に再同意 gate と競合しないよう、gate の優先順位を明示する

## 非ゴール (スコープ外)

- **admin での changelog 表示 UI**: `TermsDocument.changelog` は既存列で「改訂時の周知文」用途 (`terms.ts:141`) だが、admin 側 UI は本 PR では触らない
- **差分 diff の視覚表示** (旧版 vs 新版の diff highlight): 実装コストと UX 価値の tradeoff で Phase 2+ に先送り。まずは「規約が更新されました。以下をご確認の上、改めて同意してください」+ 現行 contentHtml 全文表示 + チェックボックスで最小 MVP
- **予約フォーム UI との統合** (「LOGIN_SIGNUP で同意済みなら RESERVATION scope の同 doc 再クリック省略」等): 既存の 4 scope 独立契約 (証跡別文脈保存) を崩す変更なので実施しない
- **その他 scope (RESERVATION / INQUIRY / EVENT_REGISTRATION / RESERVATION_SERIES) の再同意**: これらは各フォームの `assertAllRequiredTermsAgreed` gate が既に「送信時点の必須規約全件」を強制するため、フォームを開いた時点で常に新版に対して同意させる構造になっている。追加 gate 不要
- **guest (未認証) への再同意通知**: guest には continuous な session 契約が無いため対象外 (次回 signup/login で LOGIN_SIGNUP scope gate を通す)
- **Phase 2 の Server Action 側 curl-bypass gate**: 予約作成・キャンセル・問い合わせ送信 Server Action の handler 冒頭に `assertLoginSignupReagreed(customerId)` を追加して curl bypass を塞ぐ設計は下記「Phase 分割」に記す。**本 PR (Phase 1) には含めない** (1 PR = 1 logical change 原則)

## アーキテクチャ設計

### 1. 差分検出方針: `contentHash` の on-the-fly 計算比較

`TermsDocument` に `contentHash` 列は無い (現状は `contentHtml` のみ)。`TermsAgreement.contentHash` (同意時スナップショットの sha256) と、現行 `TermsDocument.contentHtml` から on-the-fly で計算した sha256 を比較する。

- LOGIN_SIGNUP scope の必須 doc は通常 2-3 件 (terms-of-use, privacy-policy, cookie-policy 相当)
- 各 doc の `contentHtml` は数十 KB, sha256 は数百マイクロ秒
- customer あたり mypage 1 リクエストで数 ms のオーバーヘッド → 無視できる

**採用理由 vs 代替案**:

| 案                                                                 | 概要                                                                            | Trade-off                                                                        | 判定                                                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **A (採用)** on-the-fly hash 計算                                  | 現行 `contentHtml` から都度 sha256、`TermsAgreement.contentHash` と比較         | migration 不要、実装最小、性能十分                                               | ✅                                                                                                                   |
| B: `TermsDocument.contentHash` 列を stored generated column で持つ | Postgres の GENERATED ALWAYS AS で自動更新                                      | migration 必要、admin update paths (`commands.ts:98-143`) との整合、index 化可能 | ❌ 過剰                                                                                                              |
| C: `TermsDocument.publishedAt` / `updatedAt` を判定に使う          | 「顧客の LOGIN_SIGNUP 同意の最新 `agreedAt` < `TermsDocument.updatedAt`」で判定 | migration 不要                                                                   | ❌ typo 修正・`displayOrder` 変更でも false positive、`updateTermsCommand` は publishedAt を保持するので信頼できない |

### 2. Query: `getReagreeRequiredTermsForCustomer(customerId)`

`src/shared/domain/terms/queries.ts` に**追加** (既存 `getRequiredTermsByScope` の直後):

```ts
export async function getReagreeRequiredTermsForCustomer(
  customerId: string,
): Promise<RequiredTerm[]> {
  // 1) LOGIN_SIGNUP scope の必須 doc を取得 (PII の customerId を含むので 'use cache' 不可)
  const requiredDocs = await prisma.termsDocument.findMany({
    where: {
      deletedAt: null,
      isPublished: true,
      scopes: { has: TermsScope.LOGIN_SIGNUP },
    },
    orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
    select: { id: true, slug: true, title: true, contentHtml: true },
  });
  if (requiredDocs.length === 0) return [];

  // 2) この customer の LOGIN_SIGNUP scope 同意履歴を termsId 別に最新 hash 取得
  const latestAgreements = await prisma.termsAgreement.findMany({
    where: {
      customerId,
      scope: TermsScope.LOGIN_SIGNUP,
      termsId: { in: requiredDocs.map((d) => d.id) },
    },
    orderBy: { agreedAt: "desc" },
    distinct: ["termsId"],
    select: { termsId: true, contentHash: true },
  });
  const agreedHashByTermsId = new Map(
    latestAgreements.map((a) => [a.termsId, a.contentHash]),
  );

  // 3) hash 一致 (agreed) は skip、未同意 or 版違いは pending として返す
  return requiredDocs
    .filter((doc) => {
      const currentHash = createHash("sha256")
        .update(doc.contentHtml)
        .digest("hex");
      return agreedHashByTermsId.get(doc.id) !== currentHash;
    })
    .map((doc) => ({
      id: doc.id,
      slug: doc.slug,
      title: doc.title,
      contentHtml: doc.contentHtml,
    }));
}
```

**Prisma distinct**: `distinct: ["termsId"]` は Postgres `DISTINCT ON` に相当。`orderBy: agreedAt desc` と組み合わせて「termsId 別に最新の 1 行」を取れる (Prisma 公式)。

**エラー処理**: `safeFetch` を使わない (fallback を空配列にすると「再同意不要」と誤認して gate をすり抜ける silent failure になる)。DB 障害時は Prisma の例外を bubble → mypage の Suspense boundary が error.tsx にフリップ → 顧客には「エラーが発生しました」画面が出る (fail-closed)。

### 3. Gate: `MypageAuthGate` に「LOGIN_SIGNUP 再同意 gate」を追加

`src/app/(public)/mypage/layout.tsx` の gate 順序 (新規順):

```
1. isActive: false                → /login?error=account_suspended
2. customer.email == null         → /mypage/settings?require_email=true (settings 以外時)
3. reagree pending && !allowlist  → /mypage/terms/reagree?returnTo=<pathname>  ← 新規
4. それ以外                        → children 表示
```

**allowlist の理由**: タスク背景「過去分の予約閲覧は許可 (証跡アクセスは agreement 前提外)」に従い、以下の read-only 経路は redirect しない (税務資料・領収書 DL の保証):

```ts
const REAGREE_ALLOWLIST_PREFIXES: readonly string[] = [
  "/mypage/terms/reagree", // 本体
  "/mypage/settings", // メール未登録者向け必須経路 (優先度 gate #2 の続き)
  "/mypage/reservations", // 履歴閲覧・領収書 DL (edit も含むが後述の Server Action gate で覆う)
  "/mypage/inquiries", // 履歴・詳細閲覧
  "/mypage/events", // 履歴閲覧
];
```

**dashboard (`/mypage` root) は allowlist に含めない**。dashboard は新規予約・お知らせ表示など mutation 起点の hub なので、trip wire として最短で再同意 gate に飛ばす。ただし顧客体験としては「/mypage 開いたら reagree に飛ばされる」となるため、reagree ページから「返却先」を「元パス (query returnTo)」に保持し、同意後は元へ戻す。

**settings が allowlist に入る優先順位の理由**: LINE ログインでメール未登録の顧客は gate #2 で `/mypage/settings` に強制 redirect される。ここに再同意 gate が追加されると settings と reagree の循環 redirect が起きるので、settings は allowlist で例外化する。「メール登録完了 → mypage 復帰 → reagree gate 発動」の順序で吸収する。

**pathname 取得**: `x-pathname` header を [`proxy.ts`] が付与している既存慣例に従う (既存の email gate と同じ)。

### 4. `/mypage/terms/reagree` page + form + action

**ファイル配置**:

- `src/app/(public)/mypage/terms/reagree/page.tsx` — Server Component
- `src/app/(public)/mypage/terms/reagree/_components/reagree-form.tsx` — Client Component (conform + Zod 4)
- `src/app/(public)/mypage/terms/reagree/_actions.ts` — Server Action (`executeConformMutation`)

**page.tsx (概要)**:

```tsx
export default async function TermsReagreePage({
  searchParams,
}: {
  searchParams: Promise<{ readonly returnTo?: string }>;
}): Promise<ReactElement> {
  // MypageAuthGate 通過後なので await connection() 済み。session も verify 済み。
  // ここで再度 pending を取得して 0 件なら redirect (直リンク対策)。
  const { user } = await verifyCustomerSession();
  const { customer } = await ensureCustomerLinked(user);
  const pending = await getReagreeRequiredTermsForCustomer(customer.id);
  if (pending.length === 0) redirect("/mypage");

  const { returnTo } = await searchParams;
  const safeReturnTo = sanitizeReturnTo(returnTo); // /mypage 配下のみ許可

  return <ReagreeForm pending={pending} returnTo={safeReturnTo} />;
}
```

**returnTo sanitization**: open redirect 対策で、`/mypage/*` の相対パスのみ許可。他はデフォルト `/mypage`。

**ReagreeForm (client, conform + Zod)**:

- 各 pending term に対して checkbox `agree[<termsId>]: boolean` (すべて必須 true)
- returnTo は hidden input
- submit → `reagreeAction` → `executeConformMutation` → `recordTermsAgreementsCommand`
- 成功時: `resetForm: true`, `revalidatePath("/mypage")`, 成功後 client 側で `router.push(returnTo)`

**Server Action**:

```ts
export async function reagreeAction(prev, formData) {
  return executeConformMutation(formData, reagreeSchema, async (input) => {
    const { user } = await verifyCustomerSession();
    const { customer } = await ensureCustomerLinked(user);
    if (!customer.isActive)
      throw new DomainError("アカウント停止中です", "FORBIDDEN");

    // Re-derive pending (client 入力は信用しない)
    const pending = await getReagreeRequiredTermsForCustomer(customer.id);
    const pendingIds = new Set(pending.map((p) => p.id));
    const agreedIds = new Set(input.agreedTermsIds);
    const missing = [...pendingIds].filter((id) => !agreedIds.has(id));
    if (missing.length > 0) {
      throw new DomainError("すべての規約に同意してください", "VALIDATION");
    }

    // 予期しない ID (pending でない・別 scope) は捨てる。invariant を守る
    const acceptedIds = [...pendingIds];
    if (acceptedIds.length === 0)
      return { returnTo: input.returnTo ?? "/mypage" };

    // append-only insert
    await recordTermsAgreementsCommand({
      termsIds: acceptedIds,
      scope: TermsScope.LOGIN_SIGNUP,
      customerId: customer.id,
      ipAddress: await getClientIpFromHeaders(),
      userAgent: (await headers()).get("user-agent") ?? null,
    });

    return { returnTo: sanitizeReturnTo(input.returnTo) };
  });
}
```

**client 側 signup-terms-consumer との重複**: `SignupTermsConsumer` は初回サインアップの cookie 消費専用で、再同意 flow とは責務が異なる。両者は独立に共存する。

### 5. append-only 契約整合

- 再同意記録は `recordTermsAgreementsCommand({ scope: LOGIN_SIGNUP })` の呼び出しのみ = `TermsAgreement.createMany` insert 1 発 (`commands.ts:384-425`)
- 既存 record の update / delete は行わない
- 同一 customer / termsId / scope で複数 record が積み上がる (=時系列の版履歴になる)
- `getReagreeRequiredTermsForCustomer` は `distinct: ["termsId"]` で最新 record のみ拾うので古い record は無視される

### 6. LINE ログイン メール未登録との優先順位

Gate #2 (email 未登録 → /mypage/settings) が Gate #3 (reagree) より先。理由:

1. メール登録は「システムからの通知が届くようにする」ための最重要 setup。ここが済まないと再同意通知メール (将来的機能) も届かない
2. settings は allowlist に入れて循環回避
3. 顧客体験: LINE ログイン → settings で email 登録 → mypage 復帰 → reagree gate → 元へ戻る、の直列順序で自然

### 7. 停止・ブラックリスト顧客

Gate #1 (isActive false → /login) が最上位。ブラックリスト顧客は reagree ページに到達しない。既存挙動と整合。

## Phase 分割

### Phase 1 (本 PR)

- `getReagreeRequiredTermsForCustomer(customerId)` 追加
- `MypageAuthGate` に gate + allowlist 追加
- `/mypage/terms/reagree` page + form + Server Action
- unit テスト (query + gate 判定)
- 実装ファイル ~5, ~250 行想定 (300 行 soft limit に収まる)

**Phase 1 の要件充足度**: mypage UI 経由の顧客はすべて再同意 gate を通る。curl 直接叩きの `/reservation` (認証必須ではない公開路) は既存 RESERVATION scope gate で塞がれるため、UI 経由の顧客に対する法務要件は満たされる。

### Phase 2 (別 PR: followup)

- 予約作成・キャンセル・問い合わせ・イベント申込の各 Server Action handler 冒頭に `assertLoginSignupReagreed(customerId)` を追加 (customer 認証済みのケースのみ)
- 目的: curl bypass の defense-in-depth (99% は UI 経由なので Phase 1 で実質的に足りるが、curl 直叩きでも塞ぐ)
- 実装は `src/shared/lib/terms-consent-gate.ts` に helper 追加 → 4-5 箇所の action で使用

### Phase 3 (Optional: 将来)

- 差分 diff 表示 UI (旧版 `TermsAgreement.contentSnapshot` vs 現行 `contentHtml`)
- admin での changelog 編集時に「LOGIN_SIGNUP scope 顧客への影響件数」を表示する summary panel

## テスト方針

### Unit

- `__tests__/unit/domain/terms/reagree-query.test.ts` (新規):
  - 未同意顧客 → 全 LOGIN_SIGNUP 必須 doc 返却
  - 同意済み・contentHtml 未変化 → 空配列
  - 同意済み・contentHtml 変化 → 差分 doc のみ返却
  - 他 scope (RESERVATION 等) の同意は無視
  - `distinct: ["termsId"]` が「termsId 別に最新 agreedAt」の doc を選ぶ
  - deletedAt / isPublished: false doc は除外
- `__tests__/unit/app/public/mypage/reagree-allowlist.test.ts` (新規):
  - allowlist prefix の判定ロジックが期待通り (settings / reservations / inquiries / events は通す, /mypage 直下 dashboard は落とす)

### Integration

- `__tests__/integration/actions/public/mypage-terms-reagree.test.ts` (新規):
  - 未同意 → reagree action で append-only insert → getReagreeRequiredTermsForCustomer が空になる (差分ゼロ化)
  - 全 pending チェックしない → DomainError("すべての規約に同意してください", "VALIDATION")
  - isActive: false 顧客 → DomainError("アカウント停止中です", "FORBIDDEN")

### 手動 (E2E は Phase 2 予定)

- `bun run dev` で管理画面から terms-of-use の contentHtml を編集 → 保存 → 顧客セッションで `/mypage` 訪問 → reagree にリダイレクトされる → 同意ボタン → 元 path へ戻る

## Migration

**不要**。schema は無変更。

- `TermsAgreement.contentHash` は既存列
- `TermsDocument.contentHash` は追加しない (差分検出は on-the-fly)
- 新規 `TermsScope` 値 (RESERVATION_SERIES 等) は既存

## 実装順序

1. `src/shared/domain/terms/queries.ts` に `getReagreeRequiredTermsForCustomer` 追加
2. `src/shared/lib/mypage/reagree-allowlist.ts` 新規 (SSoT: `REAGREE_ALLOWLIST_PREFIXES` + `isReagreeAllowlisted(pathname)`)
3. `src/app/(public)/mypage/layout.tsx` に gate #3 を追加
4. `src/app/(public)/mypage/terms/reagree/_lib/sanitize-return-to.ts` 新規
5. `src/app/(public)/mypage/terms/reagree/_actions.ts` (Server Action + Zod schema)
6. `src/app/(public)/mypage/terms/reagree/_components/reagree-form.tsx` (client)
7. `src/app/(public)/mypage/terms/reagree/page.tsx` (server)
8. Unit テスト (query + allowlist)
9. Integration テスト (action)
10. `bun run validate && bun run build` + テスト → commit → push → PR → auto-merge

## 決定事項サマリ

- **差分検出**: `TermsAgreement.contentHash` (既存) vs 現行 `TermsDocument.contentHtml` の on-the-fly sha256 (migration 不要)
- **対象 scope**: LOGIN_SIGNUP のみ (他 scope は各フォームの `assertAllRequiredTermsAgreed` で送信時 gate 済み)
- **強制方法**: MypageAuthGate で `/mypage/terms/reagree` に 302 redirect (allowlist で read-only 履歴閲覧は許可)
- **契約整合**: append-only insert のみ (update/delete 一切なし)
- **gate 優先順位**: isActive → email → reagree → children
- **PR 分割**: Phase 1 = UI 経由 gate (本 PR)、Phase 2 = Server Action curl-bypass 塞ぎ (別 PR)
- **migration**: 不要
