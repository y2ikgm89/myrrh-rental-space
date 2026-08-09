# myrrh-rental-space

レンタルスペースの予約サイト。単一リポジトリを環境変数 `APP_SURFACE` で
2 つの Cloud Run サービス（`public` = 公開サイト / `admin` = 管理画面）に
分けて配信する。スタック概要は `README.md`、人間向け手順は
`.github/CONTRIBUTING.md`。

## 絶対規約

破ると本番事故か silent regression になるもの。ほぼ全てに機械ゲートがある。

1. **Prisma に触れてよいのは `src/shared/db/**` と `src/shared/domain/**` だけ。**
   `src/app/**`（route handler・Server Action・page を含む）は必ず
   `shared/domain` 経由。barrel `@/shared/db` は db 層の外から import 禁止で、
   利用側は `@/shared/db/prisma` を直接使う。
2. **依存の向きは `app → shared/domain → shared/lib`。**
   `src/shared/**` から `@/admin` / `@/public` を import しない。
   `shared/lib → shared/domain` は凍結 allowlist（新規追加は落ちる）。
3. **`prisma.$transaction([...])` の配列形式は禁止。**
   原子性が要らなければ `Promise.all`、要るなら
   `prisma.$transaction(async (tx) => …)`（interactive 形式）。
4. **キャッシュタグの文字列直書き禁止。** `CACHE_TAGS` / `getCacheTag`
   （`src/shared/lib/constants/cache.ts`）を使う。CDN にマップされたタグは
   raw `updateTag` / `revalidateTag` ではなく `invalidateSiteWideCache`
   系を通す（Cloudflare が stale のまま残る）。
5. **`as` 型アサーションと非 null assertion (`!`) は使わない。**
   SDK / Prisma JSON / unknown 境界は SSoT helper 経由
   （`isRecord` / `asPrismaInputJsonValue` / `z.custom` helper / `toAppRoute`）。
6. **React Compiler 前提。** `useMemo` / `useCallback` / `forwardRef` は
   import 自体が lint エラー。`console.log` も禁止（`warn`/`error`/`info` は可）。
7. **既存の migration SQL を編集しない。** 常に新しい migration を追加する
   （pre-commit がブロック）。`.env*` のコミットも同様にブロックされる。
8. **予約の重複は advisory lock と DB 制約の 2 段で防ぐ。**
   可用性に影響する全書込経路が `lockSpaceForTransaction` を通り、
   最終防衛線として EXCLUDE 制約 `reservations_no_active_time_overlap_excl`
   がある。新しい書込経路も必ず同じ順序にする。
9. **証跡テーブルは追記専用。** 監査ログ・規約同意・返金・問い合わせ履歴は
   DB trigger が UPDATE / DELETE を拒否する。更新経路を足さない。
10. **日時は JST 固定。** `src/shared/lib/date-format.ts` が SSoT。
    `Intl.DateTimeFormat` / `toLocale*String` は `timeZone` 必須、
    `toISOString().slice(0, 10)` 系の UTC 前提の日付切り出しは禁止。
11. **管理画面の mutation は `executeAdminMutationResult` の実行順序を崩さない。**
    認証 → resourceId 解決 → RBAC → resource access → 実行 →
    `await afterSuccess`（cache 無効化）→ 監査ログ（非ブロッキング）。
    順序変更は未認証 DB lookup か公開ページの stale を生む。
12. **公開フォームの Server Action は 4 段 guard をこの順で通す。**
    `checkActionRateLimit` → `checkEmailRateLimit` → `checkBotHeuristics`
    → `validateTurnstile`。安い検査を先に置く不変契約。
13. **フォームは conform + Zod。** 素の `useState` + `toast.error` は不可。
    React 19 の form auto-reset を `dispatchWithoutFormReset` で止める
    （止めないとサーバー側エラーメッセージが消える）。
14. **mutation の戻り値は `MutationResult` / `MutationError`。**
    `{ success: boolean }` 形式の legacy wrapper は再導入しない。

## 検証コマンド

「動いた」は必ずコマンド出力で示す。狭い証明 → 広い証明の順で回す。

| 目的                             | コマンド                                                           |
| -------------------------------- | ------------------------------------------------------------------ |
| 単体テスト 1 ファイル            | `bun scripts/run-tests.ts <path/to/file.test.ts>`                  |
| 変更ファイルだけ lint            | `bun run lint:files -- <paths>`                                    |
| コミット前                       | `bun run validate`（**type-check + lint のみ。テストは走らない**） |
| push 前                          | `bun run validate && bun run build`                                |
| 単体 + 統合                      | `bun run test:all`（統合は `test-db` に migrate 済みが前提）       |
| E2E smoke（CI 必須ゲートと同一） | `bunx playwright test --project=chromium-smoke`                    |

- **素の `bun test` は使わない。** `mock.module()` のプロセスグローバル汚染と
  Lexical 循環 import の TDZ を、`scripts/run-tests.ts` の per-file 隔離と
  `--conditions production` が回避している。
- 親ディレクトリ指定も同じ理由で不可。単一ファイルか
  `bun run test:unit` / `bun run test:integration` を使う。
- `git push` は lefthook pre-push（type-check + アーキテクチャゲート）で
  80〜110 秒かかる。**tool timeout は 300 秒以上**を指定する。
- dev サーバーは人間が管理する。指示が無い限り起動・停止しない。

## デプロイ

`main` へのマージでは本番反映しない。本番デプロイは GitHub Actions の
`.github/workflows/deploy-production.yml` を手動 dispatch する運用。
破壊的 migration を含む場合は両サービスを scale 0 にして 310 秒 drain する
計画ダウンタイムモードに入る。発動条件の SSoT はこの workflow の正規表現で、
その列挙は `.claude/rules/migrations.md` にある。

## 変更の進め方

- ブランチは `main` 起点で `feature/*` / `fix/*` / `chore/*`。`main` への直 push は不可。
- コミットは Conventional Commits（commit-msg hook が形式を検査）。
- 1 PR = 1 論理変更。fix-of-fix は同じブランチに commit を積む。
- ゲートの allowlist / 免除を触る PR は**同時 OPEN 1 本まで**
  （`.claude/rules/architecture-allowlist.md`）。
- 免除を足すときは「なぜここでは規約が成り立たないか」を書く。
  「まだ直していない」は理由にならない。

### 自動完遂

依頼が明確なときは承認を待たずに **実装 → 検証 → commit → push → PR 作成 →
`gh pr merge --auto --squash --delete-branch` で auto-merge 予約** まで進める。
確認を挟むのは、破壊的操作・本番への反映・仕様の解釈が割れるときだけ。
auto-merge は非同期のレビュー bot の投稿を待たないので、マージ後に届いた指摘は
cherry-pick して別 PR にする。

## 話題別ルール

`.claude/rules/` に置いてある。該当ファイルを読むと自動で読み込まれる。

| ファイル                    | 対象                                                |
| --------------------------- | --------------------------------------------------- |
| `app-structure.md`          | App Router 構成 / PPR / `use cache` / CSP           |
| `architecture-allowlist.md` | ゲートの allowlist・免除の扱い                      |
| `business-domain.md`        | 予約・イベント・決済の業務不変条件                  |
| `caching.md`                | Next.js Data Cache と Cloudflare CDN の 2 層        |
| `db-domain.md`              | Prisma gateway・トランザクション・soft delete       |
| `deploy-infra.md`           | Cloud Run / Terraform / Cloud Build                 |
| `forms-mutations.md`        | conform + Server Action の定型                      |
| `frontend-ui.md`            | Tailwind v4 トークン・a11y・React 19                |
| `integrations.md`           | Stripe / Google Calendar / Cloudflare / R2 / Resend |
| `migrations.md`             | Prisma migration と squawk ゲート                   |
| `sections.md`               | CMS のページ・セクション構成                        |
| `security-auth.md`          | IAP / Better Auth / トークン / レート制限           |
| `testing-e2e.md`            | Playwright                                          |
| `testing-unit.md`           | `bun test` ランナーとゲートの書き方                 |
| `type-safety.md`            | 型アサーション規律                                  |

多段の手順（migration 追加・セクション追加・E2E 追加・デプロイ障害調査）は
`.claude/skills/` にスキルとして置いてある。

## 落とし穴

- `bun run validate` は**テストを含まない**。テストは別途走らせる。
- `.next/dev/types` が壊れると dev 停止後も type-check が失敗する。
  `bun scripts/clean-next-dev-types.ts`（`build` に同梱）で消える。
- 実 DB を使う統合テストは `scripts/serial-db-test-detection.ts` が
  `TEST_DATABASE_URL` 参照マーカーで直列バケットに振り分ける。マーカーが無いと
  並列実行されて競合する。
- 走査して「違反 0 件」を assert するゲートは、走査対象が 0 件でも緑になる。
  新しいゲートには必ず「通ってはいけない書き方」の fixture を添える。
- ライブラリの API・設定は記憶で断定せず Context7 MCP か公式 docs で裏を取る。
