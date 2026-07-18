# Reservation optimistic concurrency 設計

- 起票: 2026-07-18
- コンテキスト: マイページ実装監査 (2026-07-18) の critic #4「optimistic concurrency
  (updatedAt / version 列) がない」の対応
- 元 finding は監査セッションのコンテキストとして共有された内容 (本 PR 起票時点で
  `docs/audits/mypage-audit-2026-07-18.md` は未作成。監査 doc の書き出し自体は
  本 PR の scope 外)

## 1. 背景

顧客が `/mypage/reservations/[id]/edit` を 2 タブで同じ予約に対して開き、両タブで
異なる時刻・スペースに変更して submit すると、`updateCustomerReservation`
([src/shared/domain/reservations/customer-commands.ts:157-441](src/shared/domain/reservations/customer-commands.ts:157))
に流れる 2 リクエストの race を防ぐ機構が存在しない。

現存する保護は:

- `lockSpaceForTransaction(tx, spaceId)` (advisory lock 728351): 空き重複だけを
  serialize
- 最終 update の updateMany に `paymentStatus: PaymentStatus.UNPAID` 述語:
  決済 TOCTOU (`createCheckoutSessionCommand` との race) だけを serialize

どちらも「同一予約 A に対して、タブ 1 が 10:00-11:00 に変更、タブ 2 が 14:00-15:00 に
変更」という単純な lost-update race を防がない。両方 UNPAID・空き重複なしの前提で
両更新が成功し、後着だけが残り、先着の意図は AuditLog にも表示されない (silent race)。

同型の value-replace race がありうる他 3 経路の実体調査結果:

| モデル              | 顧客セルフ更新                                                         | 顧客セルフキャンセル                 | 実質的な lost-update race                                                       |
| ------------------- | ---------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `Reservation`       | ✅ `updateCustomerReservation` (時間/スペース差替え)                   | ✅ `cancelCustomerReservation`       | **有り**: value-replace のため後着で先着の意図が消える                          |
| `ReservationSeries` | ❌ 経路なし                                                            | ✅ `cancelCustomerReservationSeries` | 無し: cancel の double-submit は `updateMany` の status claim で自然 idempotent |
| `EventRegistration` | ❌ 経路なし (admin only)                                               | ✅ `cancelEventRegistration`         | 無し: 同上                                                                      |
| `Inquiry`           | ❌ **顧客セルフ更新経路が存在しない** (`mypage/inquiries/` は表示のみ) | ❌                                   | 無し (経路なし)                                                                 |

したがって本設計の対象は `Reservation.update` の 1 経路に限定する。

## 2. 対象範囲 (Scope)

### 対象

- `prisma/schema.prisma` の `Reservation` モデル: `version Int @default(0)` 列を追加
- `updateCustomerReservation` (customer-commands.ts): updateMany の WHERE に
  `version` 述語追加 + `version: { increment: 1 }`
- `customerReservationEditSchema` (`src/shared/lib/validations/customer-reservation.ts`):
  `version` を必須 int で受け取る
- `edit-reservation-form.tsx`: hidden input で version を submit
- `page.tsx` (edit ページのローダー): 予約 fetch 結果に version を含めて form に渡す
- 実 DB 統合テスト: race 再現 (先着 succeed / 後着 CONFLICT + form 警告表示)

### 対象外 (non-goal)

- **`ReservationSeries` の series-all cancel**: cancel は既存 status claim で
  自然 idempotent。version 列を足しても振る舞いは変わらず dead weight
- **`EventRegistration.cancel`**: 同上
- **`Inquiry`**: 顧客セルフ更新経路が存在しないため対象外
- **admin 経路の update**: 別 command (`updateAdminReservationCommand`)。admin は
  意図的に他人の予約を編集できる権限を持つため、顧客セルフ変更と同じ optimistic
  concurrency を課すか否かは別の product 判断。本 PR では admin 側は据え置き
  (顧客 form から admin form へ version がフローする経路も無い)
- **差分表示 UI**: 「旧値 / 新値 / 現 DB 値」を並べる merge UI は本 PR では
  実装しない。UX として oversized・実装コスト過大 (YAGNI)
- **AuditLog への conflict rejection 記録**: 現状の update path 成功時のみ既存の
  audit を書く方針を維持。失敗 (CONFLICT) を追加で書くのは attacker probing signal
  にはなるが、rate limit で既にカバーされており、AuditLog の書込は hash chain 契約
  との整合維持コストがあるため本 PR では見送り

## 3. 設計判断

### 3.1 カラム型: `version Int @default(0)`

Prisma には built-in の optimistic locking は無い (Prisma 7 時点)。community/業界
標準は Int の version 列を updateMany + WHERE version 述語 + `version: { increment: 1 }`
で claim する。

`updatedAt DateTime @updatedAt` の流用を採用しなかった理由:

- 既に `Reservation.updatedAt` は存在するが、Prisma の `@updatedAt` が任意の update
  で自動更新するため、意図的な version increment 制御 (この update だけを対象に前値
  matching) との干渉が起こる (updateMany に updatedAt を data で明示指定しないと
  auto-update されるが、指定すれば手動制御になる、という不明瞭さ)
- 同一 ms tick 内の 2 update を PostgreSQL microsecond 精度でも実測衝突する
  ケースが報告されている
- 「クリーンな公式推奨」というユーザー方針に対し、Int increment は明示的で
  Hibernate / Rails / Django と同型・可読性が高い

### 3.2 UPDATE 述語パターン

```ts
const updated = await tx.reservation.updateMany({
  where: {
    id: reservationId,
    deletedAt: null,
    paymentStatus: PaymentStatus.UNPAID,
    version: input.version, // 新規追加
  },
  data: {
    // ...既存 fields...
    version: { increment: 1 }, // 新規追加
  },
});

if (updated.count === 0) {
  return {
    success: false,
    error:
      "予約情報が別のデバイスまたはタブで変更されました。ページを再読み込みしてから、もう一度お試しください。",
  };
}
```

既存の `paymentStatus: UNPAID` 述語 (Codex P1 の TOCTOU 対策) は保持したまま、
`version` 述語を追加する。count=0 の分岐は「決済が同時に開始された」「別タブで先に
更新された」の 2 種を区別せず、顧客向けメッセージは後者を優先する (前者は既に
「PAID → gate」ですでに UX で伝えている)。

**エラーメッセージの意味論**: 「決済処理が開始された」のエラー文言は既存の paymentStatus
gate (customer-commands.ts:263-269) と、tx 内 updateMany count=0 (customer-commands.ts:430-437)
の 2 経路で使われている。version conflict 導入後は count=0 経路が「決済 or version mismatch」
の union になるため、上記文言に統一する。決済経路との弁別が必要になったら (未来の要件)
error code 分岐を検討する。

### 3.3 UX: form 上警告 + reload リンク

- CONFLICT を検知したら `MutationError` として form の `formErrors` 表示帯に
  上記メッセージを出す (既存の `edit-reservation-form.tsx:177-184` の帯を再利用)
- メッセージ末尾に「予約詳細に戻る」リンク (既存の「キャンセル」ボタンと同じ
  `/mypage/reservations/[id]` へのフルページ遷移) を出す。router.push で再取得すれば
  最新 version が form 初期値に反映される
- 差分表示 / 自動 reload は採用しない (顧客の入力を失わせないため、まず form を
  残して顧客に判断させる)

### 3.4 破壊的変更 OK: expand/contract 分離しない

- ユーザー指示: 「破壊的変更をしてもいいので、公式推奨で後方互換性のないクリーンな
  実装を目指して」
- `version` は additive column (`@default(0)`) なので DB migration 自体は breaking
  ではない (squawk / breaking grep 通過見込み・自動計画ダウンタイムは発動しない)
- ただし code 側は big-bang: version を送らない旧 form でリクエストが来ると
  Zod parse で reject される。Cloud Run の rolling deploy 中に「旧 form
  (version 未送信) + 新 code (version 必須)」が数十秒~数分交錯する可能性はある
- 影響は edit form の submit のみで、失敗しても form 上でエラーが出るだけ・
  データ破壊なし。再読込 → 再 submit で成功する。ユーザー許諾済みのためこの窓は
  受容する

## 4. Migration

- 名称: `add_reservation_version`
- 生成 (対話): `bun run db:migrate --name add_reservation_version`
- 生成 SQL (期待):
  ```sql
  ALTER TABLE "reservations" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
  ```
- squawk lint: `bun scripts/lint-migrations.ts prisma/migrations/<dir>/migration.sql`
  - `NOT NULL DEFAULT` は行 rewrite せず即完了 (Postgres 11+ は fast path・
    metadata-only)。要 squawk 警告確認、必要なら適切な ignore コメント付与
- baseline (`prisma/migrations/00000000000000_init/`) は編集しない
- `prisma/seed.ts`: 全新規 Reservation 作成箇所は Prisma default (0) で埋まるため
  変更不要

## 5. 変更対象ファイル (詳細)

| ファイル                                                                               | 変更内容                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                                                 | `Reservation` に `version Int @default(0)` 追加                                                                                                                                                                                                                                                                                                                                                            |
| `prisma/migrations/<ts>_add_reservation_version/migration.sql`                         | `ALTER TABLE reservations ADD COLUMN version INTEGER NOT NULL DEFAULT 0;`                                                                                                                                                                                                                                                                                                                                  |
| `src/shared/lib/validations/customer-reservation.ts`                                   | `customerReservationEditSchema` に `version: z.int().nonnegative()` を追加                                                                                                                                                                                                                                                                                                                                 |
| `src/shared/domain/reservations/customer-commands.ts`                                  | `updateCustomerReservation` の `input` 型に `version: number` を追加。tx 内 updateMany の WHERE に `version: input.version` を追加、data に `version: { increment: 1 }` を追加。count=0 の分岐で返す error 文言を現行「決済処理が開始された予約は変更できません…」から「予約情報が別のデバイスまたはタブで変更されました。ページを再読み込みしてから、もう一度お試しください。」に差し替える (詳細は §3.2) |
| `src/app/(public)/mypage/_shared/actions/reservation.ts`                               | `updateReservationAction` の handler で `data.version` を `updateCustomerReservation` に渡す                                                                                                                                                                                                                                                                                                               |
| `src/app/(public)/mypage/reservations/[id]/edit/page.tsx`                              | 予約 fetch の select に `version` 追加、`EditReservationForm` に渡す                                                                                                                                                                                                                                                                                                                                       |
| `src/app/(public)/mypage/reservations/[id]/edit/_components/edit-reservation-form.tsx` | props に `version: number`、`defaultValue` に `version`、hidden input を追加                                                                                                                                                                                                                                                                                                                               |
| `__tests__/integration/actions/public/mypage-reservation.test.ts` (既存)               | race 再現テスト追加: 同じ version で 2 update → 1 成功 / 1 conflict、conflict 後 version 増加で再試行 → 成功                                                                                                                                                                                                                                                                                               |
| `__tests__/unit/shared/lib/validations/customer-reservation.test.ts` (既存)            | schema に version 必須の検証追加                                                                                                                                                                                                                                                                                                                                                                           |

**src/app/(public)/mypage/reservations/[id]/edit/page.tsx の select 追加箇所**:
既存の予約 fetch (page loader) がどのように version 列を select しているか事前に
grep で確認 → select リストに version を明示追加する。noUncheckedIndexedAccess +
verbatimModuleSyntax 環境下でも型は自動追従する。

## 6. テスト計画

### 実 DB 統合テスト (追加)

`__tests__/integration/actions/public/mypage-reservation.test.ts` に:

1. **既存動作の regression**: 単発 update が version=0 → 1 に増加すること
2. **並行 race**: seed → 2 タブ想定で同じ version=0 を持って `updateReservationAction`
   相当を並行実行 → 一方 succeed / 一方が「予約情報が別のデバイス...」エラー
3. **再試行成功**: conflict 後、最新 version を再取得して再 submit → 成功

`SERIAL_DB_TESTS` 登録・`scripts/run-tests.ts` 経由の実行契約は既存
`__tests__/integration/**` と同じ。

### unit テスト (追加)

- schema: `version` 欠損 / 負数 / 非整数 → parse fail
- domain command: `version` mismatch を渡すと count=0 経路に入る

### 既存テストへの影響

- `__tests__/integration/actions/public/mypage-reservation.test.ts` の既存
  update ケースは fixture 作成時 `version: 0` の default で通る。form data 相当を
  組む箇所で `version` を追加送信する必要がある可能性あり (実装時に確認)

## 7. デプロイ

- `main` merge = 即本番デプロイ
- migration は additive (`ADD COLUMN NOT NULL DEFAULT 0`) のため breaking mode は
  発動しない (Postgres 11+ の fast-path、行 rewrite なし)
- rolling deploy 中の「旧 form / 新 code」窓は 3.4 で受容済み

## 8. PR 分割

**単一 PR**: scope が Reservation.update 経路のみに絞られたため、schema +
migration + domain + action + form + test を 1 PR にまとめる。CLAUDE.md の
PR 粒度 soft limit (300行 / 10 file) は上記 変更対象ファイル 8 件で余裕あり。

## 9. リスク

| リスク                                                                                                                      | 対処                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| rolling deploy 窓での「旧 form → 新 code」失敗                                                                              | ユーザー承諾済み・再読込で復旧・データ破壊なし                                                                                                                                                                                                                                                       |
| version 述語追加により既存の update-side-effects (email 通知 / SwitchBot 再発行 / audit) が「conflict なのに送信」する race | side-effects は既に `updateCustomerReservation` 成功後・fireAndForget で走る (customer-commands.ts return 後の action 側)。count=0 で早期 return されるため触発されない                                                                                                                              |
| version race と advisory lock 728351 の相互作用                                                                             | 728351 は space 単位 advisory lock。同一 space + 同一 reservation の 2 update は lock で直列化され、先着が commit (version 0 → 1) → 後着が lock 取得後に updateMany 実行時に version=0 述語 mismatch で count=0 となり CONFLICT 返却の順に確定する。race は lock 層でなく version 述語層で解決される |
| `page.tsx` の select が既存の client 型と齟齬                                                                               | Prisma client 再生成で追従。型検査と統合テストで捕捉                                                                                                                                                                                                                                                 |

## 10. 参考

- 元コード:
  - [src/shared/domain/reservations/customer-commands.ts:157-441](src/shared/domain/reservations/customer-commands.ts:157)
  - [src/app/(public)/mypage/_shared/actions/reservation.ts:158-307](<src/app/(public)/mypage/_shared/actions/reservation.ts:158>)
  - [src/app/(public)/mypage/reservations/[id]/edit/_components/edit-reservation-form.tsx](<src/app/(public)/mypage/reservations/[id]/edit/_components/edit-reservation-form.tsx>)
  - [src/shared/lib/validations/customer-reservation.ts](src/shared/lib/validations/customer-reservation.ts)
- ルール: `.claude/skills/prisma-migration/SKILL.md`,
  `.claude/rules/business-domain.md`, `.claude/rules/forms-mutations.md`,
  `.claude/rules/db-domain.md`, `.claude/rules/migrations.md`
