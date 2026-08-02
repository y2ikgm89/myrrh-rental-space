---
paths: ["prisma/**"]
---

# Prisma schema・migration・seed

## 基本フロー

1. `prisma/schema.prisma` を変更 → `bun run db:generate`
2. `bun run db:migrate --name <name>` で migration 生成・適用
3. `bun scripts/lint-migrations.ts prisma/migrations/<dir>/migration.sql` で squawk lint
4. テスト DB へは `bun run test:db:migrate`

## 禁止・制約

- **既存の `prisma/migrations/*/migration.sql` は編集禁止**。pre-commit
  （`scripts/check-protected-files.sh`）が改変（diff-filter=M）をブロックする。
  修正は新規 migration の追加のみ
- `db:push` / `db:reset` / `migrate reset` / `db pull` はユーザーの明示依頼時のみ
- **`prisma db pull` は CHECK 制約・constraint trigger を黙って落とす**。
  `blocked_dates_scope_target_check` や `events_schedule_integrity_check` trigger 等の
  手書き不変条件は baseline `00000000000000_init` にのみ存在する
- モデル名とテーブル名は `@@map` で乖離している（AuditLog → audit_logs 等、
  Better Auth 系は単数形）。migration SQL を書く・検証する際は schema.prisma と突合する

## squawk（migration lint）

- 意図的な破壊変更は SQL 文の**直前 1 行**に `-- squawk-ignore <rule名>` を書いて通す
  （rule 名必須。複数列の DROP は ALTER TABLE 文を列ごとに分割して per-column で ignore）
- npm ラッパー squawk-cli は spawn 失敗時 exit 0 の偽陰性があるため使わない
  （`SQUAWK_BIN` で公式バイナリを指定可能）

## デプロイとの連動（重要）

migration に `DROP COLUMN` / `RENAME COLUMN` / `RENAME TO` / `DROP TABLE` / `DROP TYPE` が
含まれると、main への merge で deploy workflow が自動的に breaking migration mode に入り、
public/admin 両サービスを scaling=0 停止 + 310 秒 drain する（**計画ダウンタイム発生**）。
Cloud Run のローリング窓を保つには expand/contract 分割を優先する。

## migration-history baseline reset（clean-break 例外）

通常の migration 作業ではない。ユーザーが既存データの全損を明示承認し、本番を新しい
空の Neon database/branch へ切替する場合のみ有効。適用前に: 現行 schema からの
baseline 生成・手書き SQL 不変条件と本番初期データの保全・空 DB への
`prisma migrate deploy` 成功・`schema.prisma` との diff が空であることの確認・
squawk 実行・本番 seed の一回限り実行、を証明する。既に migrate 済みの DB に
baseline reset を適用しない。

## seed（prisma/seed.ts）

- 2 モード: 既定 dev（冪等・IAP 用固定スタッフ + デモデータ + 全 feature ON）/
  `--production [email] [name]`（本番テンプレート）。
  **`--reset` は廃止した** — 呼び出し元が 1 つも無く、`clearAllData` の削除順が
  `onDelete: Restrict` の FK（Receipt / Refund → Reservation・EventRegistration、
  BlockedDate → User）と append-only trigger（terms_agreements）に追随できておらず、
  3 系統で壊れていた。同じことは `bun run db:reset`
  （`prisma migrate reset --force` + seed）がより確実に行う。
  フラグは**明示的に拒否**する（黙って dev に落とさない）
- Prisma 7 は `migrate reset` 後に自動 seed しない（`db:reset` script が明示実行する）
- seed は feature module の全 key を explicit に設定する契約、および E2E fixture
  （`e2e/fixtures/test-data.ts`）と slug・ステータスで二重定義結合している。
  seed のデータ変更は対応 fixture/spec の同時更新が必須

### seed の存在判定と一意列（ESLint `local/seed-respects-unique-constraints` が機械強制）

- **存在判定キーは schema が強制する unique と噛み合わせる。** ずれていると
  再実行が P2002 で中断し、seed は `main().catch` で `process.exit(1)` するので
  **以降の phase が丸ごと走らない**。Playwright の webServer chain は
  seed → build → start なので、ローカル E2E スイートごと起動しなくなる。
  実測: `seedNavigation` が `(type, url)` で判定していたが制約は
  `@@unique([type, order])` で、url だけずれた行があると同じ order を create して
  衝突した（`Unique constraint failed on the fields: (type, "order")`）
- **unique に参加する列へリテラルを create しない。** 宣言順や配列 index から
  literal で書くと、管理画面の並び替え・追加で既存行がその値を占有した瞬間に壊れる。
  `max + 1` で採番する（`seedSpaceCategories` が手本）か、その値自体を upsert の
  where キーにする（`seedNavigation`）。どの列が unique かは gate が schema から読む
- **partial unique（`@@unique([...], where: { deletedAt: null })` 等）の存在判定は
  述語を where に含める。** 母集合を制約に揃えないと、削除済み行を「存在する」と
  数えて create をスキップしたり、位置列が衝突したりする
- **リテラルを守れるのは「そのキー空間を空にする削除」だけ。** 直前に
  `deleteMany` があるだけでは足りない — フィルタ付きの削除は母集合の一部しか
  消さない。証明になるのは①条件なしの削除、②削除の `where` が一意グループの列を
  **過不足なく** create と同じ式で固定している場合の 2 つだけ。単一列の unique では
  その列自身を固定する必要がある（「自分以外の列」が空集合になり、判定が無条件
  true に潰れるため）。where が変数・spread なら**解析できない＝安全ではない**
- **この規約は正規表現ではなく AST で強制している。** 前身は seed.ts を grep する
  テストで、位置・スコープ・入れ子を見られないため 5 回広げた末に 1 回のレビューで
  穴が 3 つ出た（変数 where を全削除と同一視・単一列で無条件 true・免除が関数単位で
  漏れる）。`require-trimmed-text` が同じ理由で grep から移ったのと同型。
  **順序・スコープ・入れ子を含む不変条件に正規表現を使わない**
- **本番 seed と共用する関数では、宣言済みの構造列だけを reconcile する。**
  `isActive` / `isPublished` を書き始めると `--production` 再実行が管理画面の編集を
  踏み潰す。`seedNavigation(reconcile)` のように dev/prod で挙動を分ける

### 「あれば skip」が使えるのは自己完結した行だけ

存在確認して skip する冪等化は、その行の内容が**自分の宣言だけで決まる**ときに限り
正しい。次のどちらかに当たる行では、skip は「古い値を保存する」に変わる:

| 行の性質                       | skip すると起きること                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `now` からの相対で時刻を決める | 初回 seed の暦日に貼り付く。実測: `daysOffset: 0` の「本日のご予約」が 2 か月前の日付のまま残り、**未来のデモ予約が 0 件**の DB になっていた                       |
| 他の行から値を導出する         | 導出元だけが動いて drift する。実測: `seedSpaces` の reconcile 後も料金プランが古い `hourlyPrice × 1.3` のまま残り、税込実額を assert する required smoke が落ちる |

対処は**毎 run 引き直す**こと。時刻相対の集合は「消してから作る」
（`seedReservations`）、導出値は `updateMany` で宣言値へ寄せる
（`seedSpaceRatePlans`）。gate は
`__tests__/unit/architecture/seed-demo-reservation-rebuild.test.ts` と
`seed-derived-value-reconcile.test.ts`。

**この壊れ方は CI では絶対に出ない。** CI は毎回まっさらな DB に seed するので
相対時刻も導出値も必ず正しい。壊れるのは開発機と staging の**長生きした DB** だけで、
しかも「seed は冪等」という前提のせいで疑われない。実測（2026-08-02 のローカル
test DB）: marker 付き 20 件の裏に marker 導入前の旧デモ行が併存し、marker 行自体も
2 か月前の日付だった。**marker 方式の導入それ自体が、既存 DB では
「全エントリが無い」判定になって重複を生む**点にも注意する。

削除の順序も正しさの一部。`reservations_no_active_time_overlap_excl` は
DEFERRABLE ではないので、作る前に消しきる。

### 会計証跡が付いた行は seed が消さない

`Receipt` / `Refund` は予約・イベント申込を `onDelete: Restrict` で参照する
（「領収書がある予約/申込は物理削除不可」= 会計証跡保護）。seed の「作り直し」が
そこへ踏み込むと P2003 で中断し、`main().catch` の `process.exit(1)` で以降の
phase が丸ごと走らなくなる。dev / staging で Stripe のテスト決済を 1 度通すだけで
この状態になる。

**「証跡付きだけ残して他を消す」では解けない** — 残した申込が参照する
`slotId` / `ticketId` の FK も `RESTRICT` なので、次はそちらが落ちる。
証跡がある単位（event 単位）で作り直しを見送り、理由を名指しでログに出す。

**予約側は逆に行単位で選り分けられる**。残った予約が参照するのは Space / Customer
（`Cascade`）と Coupon / User / ReservationSeries（`SetNull`）だけで `Restrict` が
1 本も無く、`seedReservations` はそれらを消さないため連鎖が起きない。
「event は単位で見送り、reservation は行で選り分け」の差は FK の onDelete が決めている
——**関数ごとに参照先を確認してから決める**こと。
