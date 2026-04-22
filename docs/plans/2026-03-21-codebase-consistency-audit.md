# コードベース一貫性・技術スタック監査結果（2026-03-21）

監査計画に沿って自動検証・grep・ドキュメント差分・重複排除を実施した結果と是正内容をまとめる。

## 証跡（コマンド）

| コマンド           | 結果                                              |
| ------------------ | ------------------------------------------------- |
| `bun run validate` | 成功（初回・最終とも）                            |
| `bun run test:all` | 初回: **2 件失敗**（下記）→ テスト修正後 **成功** |
| `bun run build`    | 成功（`SKIP_ENV_VALIDATION=true`）                |

## 実施した是正（コード変更）

1. **Lexical インスペクタのテストドリフト**  
   `INSPECTABLE_NODE_TYPES` に `ruby` / `tooltip` が追加済みだったが、[`__tests__/unit/components/editor/lexical/inspector/inspectable-nodes.test.ts`](../../__tests__/unit/components/editor/lexical/inspector/inspectable-nodes.test.ts) が 34 件前提のままだった。件数を 36 に更新し、期待配列に `ruby` / `tooltip` を挿入。

2. **Instagram バリデーションの二重配置**  
   正本は [`src/shared/lib/validations/instagram.ts`](../../src/shared/lib/validations/instagram.ts)。[`src/app/(admin)/admin/(dashboard)/_shared/lib/validations/instagram.ts`](<../../src/app/(admin)/admin/(dashboard)/_shared/lib/validations/instagram.ts>) は `src` から未参照の複製だったため **削除**。ユニットテストの import を `@/shared/lib/validations/instagram` に統一。

## Findings（優先度）

### High（計画時点で検出、一部解消済み）

- **テストと実装の乖離**: インスペクタ登録ノード追加時にスナップショットテストを更新する運用を維持すること（今回修正済み）。
- **重複モジュール**: `shared` と `admin/_shared/lib/validations` で同名だったのは **`instagram.ts` のみ**（今回解消）。

### Medium

- **二重管理ドキュメントの内容差分**:
  - [`docs/reference/codex-rules/lexical-patterns.md`](../../docs/reference/codex-rules/lexical-patterns.md) と [`.claude/rules/frontend/lexical-patterns.md`](../../.claude/rules/frontend/lexical-patterns.md) は、**`bun run docs:verify-policy-sync`**（[`scripts/verify-policy-docs.mjs`](../../scripts/verify-policy-docs.mjs)）で **バイト一致を強制**する。監査当時に観測した行数差は解消済み／以降は同コマンドで再発を防ぐ。運用は [`docs/reference/codex-rules/instruction-topology.md`](../reference/codex-rules/instruction-topology.md) に追記。
  - [`admin-inline-editor-patterns.md`](../../docs/reference/codex-rules/admin-inline-editor-patterns.md) ペアも上記スクリプトの検証対象（同一バイト列必須）。

### Low / 情報

- **技術スタック表**: [`package.json`](../../package.json) と [`AGENTS.md`](../../AGENTS.md) の記載バージョンは一致。
- **境界（サンプル）**: `src/app/(public)` から `@/shared/db/prisma` / `@generated/prisma` の直 import は検出なし（ユニットの architecture-boundaries テスト群もパス）。
- **Tailwind ハードコード色**: `bg-gray-*` 等の典型的パターンは `src/**/*.tsx` grep で **ヒットなし**（網羅ではない）。
- **危険な型アサーション**: `as any` / `as unknown` / `as never` は **ヒットなし**（サンプル範囲）。
- **Zod `message:` 非推奨パターン**: 調査した `.min(..., message:)` 形式は **ヒットなし**（`error:` 運用と整合）。
- **大きいアクション**: ~~[`settings/schemas/form-schemas.ts`](<../../src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/form-schemas.ts>)（約 520 行）~~ **2026-03-22 分割済み** — `form-schema-helpers.ts` と `form-schemas-*.ts` に按分し、[`schemas/index.ts`](<../../src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/index.ts>) から再エクスポート。
- **eslint-disable**: 約 35 ファイル・コメント付き局所化。`LayoutFields.tsx` の `no-explicit-any` 等、境界理由付き。件数の異常増加は見ていない。

## 推奨バックログ（未実施）

1. ~~**lexical-patterns 二重ファイルの同期**~~ **運用で固定済み（2026-03-22）**: ペアはバイト一致必須。`docs:verify-policy-sync` と `instruction-topology.md` に手順を明記。差分を許容しない。
2. ~~**form-schemas.ts**~~ **完了（2026-03-22）**: `form-schema-helpers.ts` と領域別 `form-schemas-*.ts` に分割。import は引き続き `@/admin/actions/settings/schemas`（barrel）を使用。
3. **本番相当ビルド**: `bun run build:strict` は `ENCRYPTION_KEY` / `CRON_SECRET` 等の本番必須 env がローカルに無いと失敗しうる。充足時に実行し、通常 CI は `bun run build`（`SKIP_ENV_VALIDATION=true`）でよい。

## 作業ツリー注意

`git status` に `.next/` や `.claude/` の未追跡が混ざるとレビューノイズになる。監査・PR 前は生成物と意図したエージェント資産の取り扱いをチームで固定すること。

---

## 追記（2026-03-22）一貫性フォローアップ

- **技術スタック表と lockfile**: `bun.lock` の解決版に合わせ、Lenis **1.3.19**、@gsap/react **2.1.2** を `AGENTS.md`・[`docs/architecture/TECH_STACK.md`](../architecture/TECH_STACK.md)・[`.claude/rules/frontend/gsap-patterns.md`](../reference/codex-rules/gsap-patterns.md)・[`.claude/rules/frontend/gsap-patterns.md`](../../.claude/rules/frontend/gsap-patterns.md) で揃えた（`CLAUDE.md` の技術表は Lenis 行を持たないため対象外）。
- **ページネーション**: 管理（nuqs + `Button`）と公開（`Link`）は実装が分岐している。ソース先頭に相互 `@see` を置き、省略表示は装飾として `aria-hidden` を付与。アルゴリズム変更時は両ファイルをペアレビューすること。
- **証跡（本追記時）**: `bun run validate` / `bun run test:all` / `bun run docs:verify-policy-sync` / `bun run build` の結果を下表に追記する。

| コマンド                          | 結果（2026-03-22 追記時）                                        |
| --------------------------------- | ---------------------------------------------------------------- |
| `bun run validate`                | 成功（type-check + lint）                                        |
| `bun run test:all`                | 成功（unit → integration）                                       |
| `bun run docs:verify-policy-sync` | 成功（`policy docs: codex-rules and .claude/rules are in sync`） |
| `bun run build`                   | 成功（`SKIP_ENV_VALIDATION=true`、`✓ Compiled successfully`）    |
