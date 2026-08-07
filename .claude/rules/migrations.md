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
  手書き不変条件は schema.prisma で表現できず、SSoT は
  `prisma/baseline/invariants.sql`（baseline migration はそこからの生成物）
- モデル名とテーブル名は `@@map` で乖離している（AuditLog → audit_logs 等）。
  migration SQL を書く・検証する際は schema.prisma と突合する

## migration は原子的ではない（文の順序が正しさの一部）

**Prisma は PostgreSQL の migration をトランザクションで包まない。** 公式は
「PostgreSQL: You can opt-in by adding `BEGIN;` and `COMMIT;` … By default, Migrate
does not wrap migrations in a transaction」と明記している。実測でも、
CREATE TABLE → INSERT → 失敗する CREATE UNIQUE INDEX を 1 ファイルに並べると
index だけ失敗して **CREATE TABLE は残った**。

つまり **途中で失敗した migration は部分適用のまま残る**。帰結:

- **失敗しうる文を、それが置き換える対象を DROP する前に置く。** 「古い制約を DROP →
  新しい制約を CREATE」の順で書くと、CREATE が既存データ違反で落ちたときに
  **どちらの制約も無い状態**で止まる（DROP は通り、CREATE だけ落ちるため）
- 既存データに依存して失敗しうる DDL（UNIQUE / CHECK の追加等）を含む migration は、
  **適用前に `bun scripts/migration-preconditions.ts` のリハーサルで落ちるか確認する**
  （ヘッダに確認 SELECT を手で書かない — 下記）
- **baseline 以外で 2 文以上を持つ migration は `BEGIN;` / `COMMIT;` で包む**
  （Prisma 公式の opt-in。`CREATE INDEX CONCURRENTLY` はトランザクション内で
  使えない点に注意）。「既存データに依存する DDL かどうか」の人力分類は
  分類漏れが必ず出るのでやめ、**文数だけ**で判定する。
  gate は `__tests__/unit/architecture/migration-atomicity.test.ts`。
  **免除は baseline `00000000000000_init` の 1 本だけ**で、日付境界も allowlist も
  意図的に置いていない（baseline は必ず空の DB に対して走るので既存行が無い、
  という理由の免除であって「古いから」ではない）

  包まないと、本番データ次第で前半だけ適用された状態で止まり、`_prisma_migrations` に
  失敗が記録されて**以降のデプロイが全部ブロック**される。復旧は本番 DB の手作業になる。

  **代償**: 包むと失敗時の表示が実際の違反ではなく
  `current transaction is aborted, commands ignored until end of transaction block`
  になる（実測）。原因の特定は `bun scripts/migration-preconditions.ts` で行う。

  ```sh
  bun scripts/migration-preconditions.ts --url postgresql://...
  ```

  **未適用 migration を 1 つのトランザクションで実際に流し、必ず巻き戻す。**
  判定は PostgreSQL の実挙動そのもので、落ちるなら**失敗した文と本当のエラー
  （SQLSTATE 付き）**が出る。

  前身は SQL を分類してプローブを組み立てる実装だった。多角レビュー 2 巡で
  **21 件の取りこぼし**が出た（素通り 9・通る migration を止める誤検知 12）。
  `NOT VALID` / `USING` 句 / `ATTACH PARTITION` / `CREATE TABLE AS SELECT` /
  `varchar` の末尾空白 / 合成既定値の型 …… PostgreSQL の意味論を手で書き写す限り
  収束しない。**写経に戻さないこと。**

  巻き戻しの担保は 3 段: ①トランザクション制御と `CONCURRENTLY` が 1 文でもあれば
  **何も実行せずに**止める（包み用の `BEGIN` / `COMMIT` / `END` のみ読み飛ばす）
  ②実行は interactive transaction 内だけで、最後に必ず例外を投げる
  ③列・制約・index の**定義そのもの**を畳んだ構造ハッシュ（md5）と
  `_prisma_migrations` 行数を前後で照合する（件数だけの比較では CHECK の
  入れ替え drift を見逃す）。

  見ないもの: シーケンスの採番は巻き戻らない。未適用が複数あるとき 1 つの
  トランザクションで流すので、「前の migration が commit 済みであることに依存する文」
  はここでだけ落ちうる。

  本番の Cloud Run Job（`terraform/cloud_run_migrate_job.tf`）は
  `migration-preconditions.ts && prisma migrate deploy` を実行する。**migrate を
  始める前**に落ちるので `_prisma_migrations` に失敗が残らない。

  **ヘッダに確認クエリを手で書かない。** コメントの SELECT は誰も流さない。
  適用前の既存行チェックは上記リハーサルが担う。以前はヘッダが唯一の守りだったが、
  jsonb 形状 CHECK を入れた migration のヘッダは 23 本の制約のうち 3 本しか見ておらず、
  `locations.special_holidays` に JSON null が残った DB で「0 件」と出たうえで
  migration が落ちた。人が書く一覧は覆うべき集合から必ず離れる。
  gate は `__tests__/unit/architecture/migration-header-has-no-manual-precheck.test.ts`
  （既に書かれた分は編集不能なので**件数を固定**する ratchet。増えれば新規、
  減れば baseline へ畳んだ合図で、どちらも落ちる）、
  `__tests__/unit/architecture/migration-preconditions.test.ts`
  （文の切り出し + 巻き戻せない文を実行しない + 接続先解決）と
  `__tests__/integration/prisma/migration-preconditions-rehearsal.test.ts`
  （実 DB で落ちる/通るの終了コードと、DB が変わっていないこと）

`.squawk.toml` の `assume_in_transaction` はこの実態に合わせて `false`。

## squawk（migration lint）

- 免除は 2 形。文単位は SQL 文の**直前 1 行**に `-- squawk-ignore <rule名>`、
  ファイル単位はファイル冒頭に `-- squawk-ignore-file <rule名>[, <rule名>]`
  （どちらも rule 名必須）。複数列の DROP を文単位で通すなら ALTER TABLE 文を
  列ごとに分割する
- **免除したら、その SQL は必ず破壊的 DDL 判定に引っかかること。** squawk が見て
  いるのは「ローリング切替窓で旧 revision が壊れたスキーマを叩く」危険で、黙らせて
  よいのは**その窓が別の仕組みで塞がれているとき**だけ。この repo でその仕組みは
  deploy-production.yml の計画ダウンタイムなので、免除と発火が食い違うと窓が開いた
  ままになる。散文ではなく
  `__tests__/unit/architecture/migration-squawk-ignore-is-breaking.test.ts` が強制する
  （実際、`ALTER TYPE ... RENAME VALUE` だけの migration が当時の grep に
  引っかからず、ダウンタイム無しでデプロイされる状態で 1 本すり抜けていた）
- npm ラッパー squawk-cli は spawn 失敗時 exit 0 の偽陰性があるため使わない
  （`SQUAWK_BIN` で公式バイナリを指定可能）

## デプロイとの連動（重要）

migration に下記のいずれかが含まれると、deploy workflow が自動的に breaking migration
mode に入り、public/admin 両サービスを scaling=0 停止 + 310 秒 drain する
（**計画ダウンタイム発生**）。Cloud Run のローリング窓を保つには expand/contract 分割を優先する。

<!-- breaking-triggers:start -->

ALTER TABLE ... DROP COLUMN / ALTER TABLE ... DROP CONSTRAINT / ALTER TABLE ... RENAME COLUMN / ALTER TABLE ... RENAME TO / ALTER TABLE ... ALTER COLUMN ... SET NOT NULL / ALTER TABLE ... ALTER COLUMN ... DROP DEFAULT / ALTER TABLE ... ALTER COLUMN ... TYPE / ALTER TYPE ... RENAME VALUE / ALTER TYPE ... RENAME TO / DROP TABLE / DROP TYPE

<!-- breaking-triggers:end -->

**この一覧の SSoT は `.github/workflows/deploy-production.yml` の grep 正規表現**で、
`__tests__/unit/architecture/breaking-migration-detection.test.ts` が発火/非発火の両方を
fixture で固定している。判定に迷ったらそのテストの fixture を見る（散文の列挙は
過去に 2 度 drift した — `DROP CONSTRAINT` と `ALTER COLUMN ... TYPE` が長期間欠けていた）。

`ALTER COLUMN ... TYPE` / `SET NOT NULL` はテーブル全体書換 + 排他ロックのため、
`DROP DEFAULT` は「旧 revision の Prisma Client がその列を INSERT に含めない」ため
destructive 扱い（migrate は新 revision のデプロイより先に走る）。

## migration-history baseline reset（clean-break 例外）

通常の migration 作業ではない。ユーザーが既存データの全損を明示承認し、本番を新しい
空の Neon database/branch へ切替する場合のみ有効。適用前に: 現行 schema からの
baseline 生成・手書き SQL 不変条件と本番初期データの保全・空 DB への
`prisma migrate deploy` 成功・`schema.prisma` との diff が空であることの確認・
squawk 実行・本番 seed の一回限り実行、を証明する。

**既に migrate 済みの DB に baseline reset を適用しない。Prisma は止めてくれない。**
実測（2026-08-04、99 本を畳んだ直後の test DB）: `_prisma_migrations` に 99 行あり、
`00000000000000_init` の checksum が記録値 `9265c27f…` と実ファイル `f2b99ab4…` で
食い違っているのに、`prisma migrate status` は **`Database schema is up to date!`**、
`prisma migrate deploy` は **`No pending migrations to apply.`** を返して exit 0 する。
つまり**適用は無言の no-op になり、DB は畳む前のスキーマのまま残る**。畳んだ後の
ローカル test DB も同じ理由で作り直しが要る（`test:db:migrate` だけでは古い
スキーマが残る）。

### 道具

- `scripts/build-baseline-migration.ts` — `extensions.sql` + `migrate diff` +
  `invariants.sql` を連結して 1 本の baseline を作る。空出力・`CREATE TABLE` /
  `CREATE TYPE` の件数不一致・**データ投入文の消失**を拒否する
- `scripts/db-census.ts` — pg_catalog を突き合わせて等価性を証明する。
  `--expect prisma/baseline/accepted-drift.json` で承認済み差分のみを許し、
  承認していない差分が 1 本でもあれば失敗する

### Prisma DSL で表現できない不変条件

CHECK / EXCLUDE / plpgsql 関数 / trigger / extension は `migrate diff` の出力に
**一切含まれない**。SSoT は `prisma/baseline/{extensions,invariants}.sql` で、
テストからは `__tests__/support/prisma-sources.ts` の `readDatabaseInvariants()` で読む。
**テストが migration を名前で指してはいけない**（畳めば消える）。
`gates-do-not-pin-migrations.test.ts` が 0 件を強制する。

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
