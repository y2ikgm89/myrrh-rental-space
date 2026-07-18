# Reservation optimistic concurrency 設計

- 起票: 2026-07-18
- コンテキスト: マイページ実装監査 (2026-07-18) の critic #4「optimistic concurrency
  (updatedAt / version 列) がない」の対応
- 元 finding は監査セッションのコンテキストとして共有された内容 (本 PR 起票時点で
  `docs/audits/mypage-audit-2026-07-18.md` は未作成。監査 doc の書き出し自体は
  本 PR の scope 外)

## 1. 背景

Reservation の value-replace update (時間・スペース・料金の書き換え) には 3 種の
race window がある:

1. **顧客タブ間 race**: 顧客が `/mypage/reservations/[id]/edit` を 2 タブで開き、
   両タブで異なる時刻に submit → `updateCustomerReservation` に流れる 2 リクエストで
   後着が勝ち、先着の意図が silent に消える
2. **admin タブ間 race**: 管理者が同予約を 2 タブで開いて別々の値で保存 →
   `updateAdminReservationCommand` で同型に silent overwrite
3. **顧客 vs admin race**: 顧客が edit 画面を開いた状態で、admin が別画面から
   時間帯を変更 → 顧客の submit が admin 変更を silent に上書き

現存する保護:

- `lockSpaceForTransaction(tx, spaceId)` (advisory lock 728351): 空き重複だけを
  serialize
- customer path の updateMany に `paymentStatus: PaymentStatus.UNPAID` 述語:
  決済 TOCTOU (`createCheckoutSessionCommand` との race) だけを serialize
- admin path の `tx.reservation.update` は WHERE claim を持たない

どれも「同一予約 A に対して 2 form が異なる値で submit」という lost-update race を
防がない。両方 UNPAID・空き重複なしの前提で両更新が成功し、後着だけが残り、
先着の意図は AuditLog にも表示されない (silent race)。

同型の value-replace race がありうる他モデルの実体調査結果:

| モデル              | 顧客セルフ更新                                                         | 顧客セルフキャンセル                 | 実質的な lost-update race                                                       |
| ------------------- | ---------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `Reservation`       | ✅ `updateCustomerReservation` + `updateAdminReservationCommand`       | ✅ `cancelCustomerReservation`       | **有り**: value-replace のため後着で先着の意図が消える (顧客・admin 双方)       |
| `ReservationSeries` | ❌ 経路なし                                                            | ✅ `cancelCustomerReservationSeries` | 無し: cancel の double-submit は `updateMany` の status claim で自然 idempotent |
| `EventRegistration` | ❌ 経路なし (admin only)                                               | ✅ `cancelEventRegistration`         | 無し: 同上                                                                      |
| `Inquiry`           | ❌ **顧客セルフ更新経路が存在しない** (`mypage/inquiries/` は表示のみ) | ❌                                   | 無し (経路なし)                                                                 |

したがって本設計の対象は `Reservation` の **form-driven update path 2 種**
(顧客セルフ + admin) に限定する。

## 2. 対象範囲 (Scope)

### 対象 (form-driven update path 全て)

- `prisma/schema.prisma` の `Reservation` モデル: `version Int @default(0)` 列を追加
- **customer path**:
  - `updateCustomerReservation` (customer-commands.ts): updateMany の WHERE に
    `version` 述語追加 + `version: { increment: 1 }`
  - `customerReservationEditSchema` (`src/shared/lib/validations/customer-reservation.ts`):
    `version` を必須 int で受け取る
  - Customer `edit-reservation-form.tsx`: hidden input で version を submit
  - Customer edit loader (`mypage/reservations/[id]/edit/page.tsx`): 予約 fetch に
    version を含めて form に渡す
- **admin path**:
  - `updateAdminReservationCommand` (admin-commands.ts): 現行 `tx.reservation.update` を
    `tx.reservation.updateMany` (WHERE に `id + deletedAt + version`) に置き換え + increment
  - `updateReservationFormSchema` (`admin/(dashboard)/reservations/_components/reservation-form-schema.ts`):
    `version` を必須 int で受け取る
  - Admin `ReservationEditForm.tsx`: hidden input で version を submit
  - Admin edit loader (`admin/(dashboard)/reservations/[id]/edit/page.tsx`):
    予約 fetch に version を含めて form に渡す
- **共通 UX**: CONFLICT を form 警告帯に表示 (customer / admin 同一メッセージ・
  同一「詳細に戻る」フルページ遷移パターン)
- 実 DB 統合テスト: 顧客タブ間 / admin タブ間 / 顧客 vs admin の 3 race を再現

### 対象外 (non-goal)

- **`ReservationSeries` の series-all cancel**: cancel は既存 status claim で
  自然 idempotent。version 列を足しても振る舞いは変わらず dead weight
- **`EventRegistration.cancel`**: 同上
- **`Inquiry`**: 顧客セルフ更新経路が存在しないため対象外
- **非 form path の全 update (cron / payment / calendar-sync / claim / lifecycle /
  data-retention / reminder / cancel-core)**: これらは version 列を touch しない。
  楽観制御 (optimistic locking) は「エンティティを load → mutate → save」の form
  操作にのみ適用するのが Rails ActiveRecord `optimistic_locking` / Hibernate
  `@Version` の公式挙動と同じ。bulk update / webhook driven writes / cron の
  status 遷移は Rails `.update_all` / Hibernate native query に相当し、元々版数
  管理の対象外。これらの書込との race は以下の既存機構でカバー済み:
  - cron の status 遷移 → form の `CANCELLABLE_STATUSES` チェックで reject
  - 決済 TOCTOU → 既存の `paymentStatus: UNPAID` 述語で serialize
- **差分表示 UI**: 「旧値 / 新値 / 現 DB 値」を並べる merge UI は本 PR では
  実装しない。UX として oversized・実装コスト過大 (YAGNI)
- **AuditLog への conflict rejection 記録**: 現状の update path 成功時のみ既存の
  audit を書く方針を維持。失敗 (CONFLICT) を追加で書くのは attacker probing signal
  にはなるが、rate limit で既にカバーされており、AuditLog の書込は hash chain 契約
  との整合維持コストがあるため本 PR では見送り

## 3. 設計判断

### 3.1 カラム型: `version Int @default(0)`

Prisma には built-in の optimistic locking は無い (Prisma 7 時点)。community/業界
標準は Int の version 列を `updateMany` + WHERE version 述語 + `version: { increment: 1 }`
で claim する。同型が Rails ActiveRecord `optimistic_locking`
(`lock_version` int, `.save` で自動 increment・古い版数の save は
`ActiveRecord::StaleObjectError`) と Hibernate `@Version`
(`Long version`, session flush 時に自動 increment・stale なら
`OptimisticLockException`)。Django も `select_for_update` を推奨するが、Django
標準 field ではなく手動 int + `.filter(version=...)`.update() で実装するのが定石。

`updatedAt DateTime @updatedAt` の流用を採用しなかった理由:

- 既に `Reservation.updatedAt` は存在するが、Prisma の `@updatedAt` が任意の update
  で自動更新するため、意図的な version increment 制御 (この update だけを対象に前値
  matching) との干渉が起こる (updateMany に updatedAt を data で明示指定しないと
  auto-update されるが、指定すれば手動制御になる、という不明瞭さ)
- 同一 ms tick 内の 2 update を PostgreSQL microsecond 精度でも実測衝突する
  ケースが報告されている
- 「クリーンな公式推奨」というユーザー方針に対し、Int increment は明示的で
  Hibernate / Rails / Django と同型・可読性が高い

### 3.1.1 適用境界: form path のみ (Rails / Hibernate と同一)

Rails ActiveRecord は `.update_all` (bulk update / raw SQL) を `lock_version`
increment 対象外にしている。Hibernate も native query (HQL bypass) は
`@Version` を触らない。理由は「楽観制御はエンティティを load して mutate する
セッション」に紐付いた semantic であり、bulk 系や webhook 由来の状態遷移は
別 concern (typically status machine で表現) だから。

本 project でも同じ境界を採る:

- **form path (customer + admin edit)**: version 述語 claim + increment
- **非 form path**: version 触らない。以下 8 種の書込は既存の別 gate (status /
  paymentStatus / cron 冪等 flag) が race を吸収済み
  - `cancel-core.ts` (キャンセル claim)
  - `payment-commands.ts` (決済確定・払戻)
  - `payment-queries.ts` (checkout session 遷移)
  - `pending-expiry.ts` (cron 期限切れ)
  - `reminder-commands.ts` (cron リマインダー冪等)
  - `calendar-sync.ts` (GCal sync 完了フラグ)
  - `lifecycle-commands.ts` (restore / soft-delete)
  - `claim-commands.ts` (ゲスト予約 claim)
  - `data-retention/commands.ts`, `customers/commands.ts` (削除 cascade)

非 form path の書込は form 読み取り時の version と semantically 無関係。例えば
顧客が edit 画面を開いた後 cron が PENDING → CANCELLED に遷移させても、form
submit は既存の `CANCELLABLE_STATUSES.includes(reservation.status)` チェックで
reject される (現行 customer-commands.ts:255-257)。追加保護不要。

### 3.2 UPDATE 述語パターン

**customer path** (`updateCustomerReservation`, tx 内):

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

**admin path** (`updateAdminReservationCommand`, tx 内): 現行 `tx.reservation.update`
(WHERE claim 無し・count 判定不可) を `updateMany` に置き換える:

```ts
const updated = await tx.reservation.updateMany({
  where: {
    id,
    deletedAt: null,
    version: input.version, // 新規追加
  },
  data: {
    // ...既存 fields (現行 update の data と同一)...
    version: { increment: 1 }, // 新規追加
  },
});

if (updated.count === 0) {
  throw new DomainError(
    "予約情報が別の画面で変更されました。予約詳細画面に戻って再読み込みしてから、もう一度お試しください。",
    "CONFLICT",
  );
}

// icsSequence を後続処理で使う場合は別 select で取得 (updateMany は select 不可)
const refreshed = await tx.reservation.findUniqueOrThrow({
  where: { id },
  select: { icsSequence: true },
});
```

admin path は `paymentStatus: UNPAID` 述語を持たない (admin は PAID 予約も編集
可能な権限を持つため。current admin path も同様)。version 述語のみ追加する。

**返り値の変更**: 現行の `tx.reservation.update` は `updatedReservation.icsSequence`
を直接返せるが、`updateMany` は select 不可。admin path の後続処理で
`icsSequence` を使っている箇所 (admin-commands.ts:432-434) を `findUniqueOrThrow`
の追加 SELECT に切り替える (同 tx 内・成功後なので version 変化なし)。

**エラーメッセージの意味論**: 「決済処理が開始された」のエラー文言は既存の paymentStatus
gate (customer-commands.ts:263-269) と、tx 内 updateMany count=0 (customer-commands.ts:430-437)
の 2 経路で使われている。version conflict 導入後は count=0 経路が「決済 or version mismatch」
の union になるため、上記文言に統一する。決済経路との弁別が必要になったら (未来の要件)
error code 分岐を検討する。

### 3.3 UX: form 上警告 + reload リンク (customer / admin 同一パターン)

- CONFLICT を検知したら `MutationError` として form の `formErrors` 表示帯に
  上記メッセージを出す (既存の `edit-reservation-form.tsx:177-184` の帯を再利用、
  admin `ReservationEditForm.tsx` にも同型の formErrors 表示を追加)
- メッセージ末尾に「予約詳細に戻る」リンク (customer は `/mypage/reservations/[id]`、
  admin は `/admin/reservations/[id]` へのフルページ遷移) を出す。router.push で
  再取得すれば最新 version が form 初期値に反映される
- 差分表示 / 自動 reload は採用しない (顧客・管理者の入力を失わせないため、まず
  form を残して判断させる)

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

### Schema / Migration

| ファイル                                                       | 変更内容                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                         | `Reservation` に `version Int @default(0)` 追加                           |
| `prisma/migrations/<ts>_add_reservation_version/migration.sql` | `ALTER TABLE reservations ADD COLUMN version INTEGER NOT NULL DEFAULT 0;` |

### Customer path

| ファイル                                                                               | 変更内容                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/lib/validations/customer-reservation.ts`                                   | `customerReservationEditSchema` に `version: z.int().nonnegative()` を追加                                                                                                                                                                                                                                                                                                                                 |
| `src/shared/domain/reservations/customer-commands.ts`                                  | `updateCustomerReservation` の `input` 型に `version: number` を追加。tx 内 updateMany の WHERE に `version: input.version` を追加、data に `version: { increment: 1 }` を追加。count=0 の分岐で返す error 文言を現行「決済処理が開始された予約は変更できません…」から「予約情報が別のデバイスまたはタブで変更されました。ページを再読み込みしてから、もう一度お試しください。」に差し替える (詳細は §3.2) |
| `src/app/(public)/mypage/_shared/actions/reservation.ts`                               | `updateReservationAction` の handler で `data.version` を `updateCustomerReservation` に渡す                                                                                                                                                                                                                                                                                                               |
| `src/app/(public)/mypage/reservations/[id]/edit/page.tsx`                              | 予約 fetch の select に `version` 追加、`EditReservationForm` に渡す                                                                                                                                                                                                                                                                                                                                       |
| `src/app/(public)/mypage/reservations/[id]/edit/_components/edit-reservation-form.tsx` | props に `version: number`、`defaultValue` に `version`、hidden input を追加                                                                                                                                                                                                                                                                                                                               |

### Admin path

| ファイル                                                                                | 変更内容                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-schema.ts` | `updateReservationFormSchema` に `version: z.coerce.number().int().nonnegative()` を追加 (create schema は影響なし)                                                                                                                                                                                                                                          |
| `src/shared/domain/reservations/admin-commands.ts`                                      | `updateAdminReservationCommand` の `input` 型に `version: number` を追加。tx 内 `tx.reservation.update` を `tx.reservation.updateMany` に置き換え (WHERE に `id + deletedAt + version` 述語、data に `version: { increment: 1 }`)。count=0 で `DomainError("...", "CONFLICT")` を throw。後続で使う `icsSequence` は同 tx 内 `findUniqueOrThrow` で別 select |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/admin.ts`                | update action handler で form data の `version` を command input に渡す。既存の `executeAdminMutationResult` の DomainError 自動変換で CONFLICT が MutationError として form に流れる                                                                                                                                                                        |
| `src/app/(admin)/admin/(dashboard)/reservations/[id]/edit/page.tsx`                     | 予約 fetch の select に `version` 追加、`ReservationEditForm` に渡す                                                                                                                                                                                                                                                                                         |
| `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationEditForm.tsx`    | props に `version: number`、`defaultValue` に `version`、hidden input を追加、formErrors 帯を CONFLICT メッセージ表示に対応 (既存の error 表示帯があるかは実装時に確認)                                                                                                                                                                                      |

### Tests

| ファイル                                                                    | 変更内容                                                                                                                               |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `__tests__/integration/actions/public/mypage-reservation.test.ts` (既存)    | customer race 再現テスト追加: 同じ version で 2 update → 1 成功 / 1 CONFLICT、conflict 後 version 増加で再試行 → 成功                  |
| `__tests__/integration/reservations/admin-commands.test.ts` (既存)          | admin race 再現テスト追加 + 顧客 vs admin race (顧客 form で version=N を保持、admin が版数を N→N+1 に進める、顧客 submit が CONFLICT) |
| `__tests__/unit/shared/lib/validations/customer-reservation.test.ts` (既存) | schema に version 必須の検証追加                                                                                                       |
| `__tests__/unit/domain/reservations/commands.test.ts` (既存)                | admin form schema の version 必須検証・admin command の version 述語動作を追加                                                         |

**注記**:

- Customer / admin どちらの loader (`page.tsx`) でも `version` 列を select リストに
  明示追加する。tsc + Prisma 型は追従するため型検査で漏れは補足される
- admin schema の `version` は `z.coerce.number()` で受ける (FormData は文字列で
  送るため、customer 側の直接 int と扱いを分ける)。既存 admin schema が
  `z.preprocess` で他 field を coerce している同型 pattern に合わせる
- 変更ファイル計: schema/migration 2 + customer 5 + admin 5 + test 4 = **16 file**
  (CLAUDE.md 停止例外「20 file 超」の soft limit 未満、破壊的変更は user 承諾済み)

## 6. テスト計画

### 実 DB 統合テスト (追加)

**Customer race** (`__tests__/integration/actions/public/mypage-reservation.test.ts`):

1. **既存動作の regression**: 単発 update が version=0 → 1 に増加すること
2. **customer タブ間 race**: seed → 2 タブ想定で同じ version=0 を持って
   `updateReservationAction` 相当を並行実行 → 一方 succeed / 一方が「予約情報が
   別のデバイス...」エラー
3. **再試行成功**: conflict 後、最新 version を再取得して再 submit → 成功

**Admin race** (`__tests__/integration/reservations/admin-commands.test.ts`):

4. **admin タブ間 race**: 同 reservation の 2 admin update に version=0 → 一方
   succeed / 一方が `DomainError("...", "CONFLICT")` throw
5. **顧客 vs admin race**: 顧客 form で version=N を保持中に admin が update →
   顧客 submit が CONFLICT で reject される (逆向きも: admin が version=N を
   保持中に顧客が update → admin submit が CONFLICT)
6. **非 form path は version 触らない**: cron `pending-expiry` / payment
   `settleCheckoutSession` / cancel-core 経由の書込後、version 列が変化しない
   ことを確認 (§3.1.1 の境界維持を機械検証)

`SERIAL_DB_TESTS` 登録・`scripts/run-tests.ts` 経由の実行契約は既存
`__tests__/integration/**` と同じ。

### unit テスト (追加)

- customer schema: `version` 欠損 / 負数 / 非整数 → parse fail
- admin schema (`updateReservationFormSchema`): 同上 (FormData 文字列 → coerce
  経由でも int nonnegative)
- customer domain command: `version` mismatch を渡すと count=0 経路に入り
  「別のデバイス」文言を返す
- admin domain command: `version` mismatch で `DomainError("...", "CONFLICT")`
  throw

### 既存テストへの影響

- 既存の update ケース (customer / admin 両方) は fixture 作成時 `version: 0`
  の default で通る。form data 相当を組む箇所で `version` を追加送信する必要が
  ある (実装時に洗い出し・全件更新)。テスト側の破壊的変更は user 承諾済み

## 7. デプロイ

- `main` merge = 即本番デプロイ
- migration は additive (`ADD COLUMN NOT NULL DEFAULT 0`) のため breaking mode は
  発動しない (Postgres 11+ の fast-path、行 rewrite なし)
- rolling deploy 中の「旧 form / 新 code」窓は 3.4 で受容済み (customer / admin
  双方の form が対象。窓は数十秒〜数分)

## 8. PR 分割

**単一 PR**: form-driven update path 全体を一括で切り替える (customer + admin

- schema + tests)。CLAUDE.md 停止例外「20 file 超 / 1000 行超」の soft limit
  未満 (16 file 見込み)。破壊的変更は user 承諾済み。

段階分割 (customer PR → admin PR) を採用しない理由:

- schema version 列の semantics は「form-driven update path で必ず increment
  される契約」。customer path だけが increment し admin path が触らない中間状態は、
  spec §3.1.1 の境界と矛盾するため semantics が壊れる
- 中間 revision (customer だけ増分) が本番に出ると、admin edit 後に顧客 form が
  古い version=旧値で送っても admin の変更が silent overwrite される regression が
  発生する
- 一括切り替えの方が「clean な公式推奨」に忠実

## 9. リスク

| リスク                                                                                                                      | 対処                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| rolling deploy 窓での「旧 form → 新 code」失敗 (customer + admin)                                                           | ユーザー承諾済み・再読込で復旧・データ破壊なし                                                                                                                                                                                                                                                       |
| version 述語追加により既存の update-side-effects (email 通知 / SwitchBot 再発行 / audit) が「conflict なのに送信」する race | side-effects は既に update 成功後・fireAndForget で走る (customer は action 側、admin は command 呼出元)。count=0 で早期 return / DomainError throw されるため触発されない                                                                                                                           |
| version race と advisory lock 728351 の相互作用                                                                             | 728351 は space 単位 advisory lock。同一 space + 同一 reservation の 2 update は lock で直列化され、先着が commit (version 0 → 1) → 後着が lock 取得後に updateMany 実行時に version=0 述語 mismatch で count=0 となり CONFLICT 返却の順に確定する。race は lock 層でなく version 述語層で解決される |
| admin path の `updateMany` 化により従来の `update({..., select})` パターンが失われる                                        | 同 tx 内の `findUniqueOrThrow` で `icsSequence` 等を追加 SELECT する (§3.2)。update 成功後・同 tx 内・version は既に increment 済みなので stale read 無し                                                                                                                                            |
| 非 form path が誤って version を触ってしまう regression                                                                     | test #6 (§6) で cron / payment / cancel-core 経由の update 後 version 変化なしを機械検証。将来的な update path 追加時にも同 test が gate として機能                                                                                                                                                  |
| `page.tsx` の select が既存の client 型と齟齬 (customer / admin 双方)                                                       | Prisma client 再生成で追従。型検査と統合テストで捕捉                                                                                                                                                                                                                                                 |

## 10. 参考

- 元コード:
  - Customer path:
    - [src/shared/domain/reservations/customer-commands.ts:157-441](src/shared/domain/reservations/customer-commands.ts:157)
    - [src/app/(public)/mypage/_shared/actions/reservation.ts:158-307](<src/app/(public)/mypage/_shared/actions/reservation.ts:158>)
    - [src/app/(public)/mypage/reservations/[id]/edit/_components/edit-reservation-form.tsx](<src/app/(public)/mypage/reservations/[id]/edit/_components/edit-reservation-form.tsx>)
    - [src/shared/lib/validations/customer-reservation.ts](src/shared/lib/validations/customer-reservation.ts)
  - Admin path:
    - [src/shared/domain/reservations/admin-commands.ts:406-449](src/shared/domain/reservations/admin-commands.ts:406)
    - [src/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-schema.ts:187-201](<src/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-schema.ts:187>)
    - [src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationEditForm.tsx](<src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationEditForm.tsx>)
    - [src/app/(admin)/admin/(dashboard)/reservations/[id]/edit/page.tsx](<src/app/(admin)/admin/(dashboard)/reservations/[id]/edit/page.tsx>)
    - [src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/admin.ts](<src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/admin.ts>)
- 楽観制御の公式挙動:
  - Rails ActiveRecord `optimistic_locking`: <https://api.rubyonrails.org/classes/ActiveRecord/Locking/Optimistic.html>
    (`lock_version` int、`.save` で auto increment、bulk `.update_all` は対象外)
  - Hibernate `@Version`: <https://docs.jboss.org/hibernate/orm/current/userguide/html_single/Hibernate_User_Guide.html#locking-optimistic>
    (native query bypass)
- ルール: `.claude/skills/prisma-migration/SKILL.md`,
  `.claude/rules/business-domain.md`, `.claude/rules/forms-mutations.md`,
  `.claude/rules/db-domain.md`, `.claude/rules/migrations.md`
