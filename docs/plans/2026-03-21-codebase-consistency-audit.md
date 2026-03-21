# コードベース一貫性・技術スタック監査結果（2026-03-21）

監査計画に沿って自動検証・grep・ドキュメント差分・重複排除を実施した結果と是正内容をまとめる。

## 証跡（コマンド）

| コマンド | 結果 |
|----------|------|
| `bun run validate` | 成功（初回・最終とも） |
| `bun run test:all` | 初回: **2 件失敗**（下記）→ テスト修正後 **成功** |
| `bun run build` | 成功（`SKIP_ENV_VALIDATION=true`） |

## 実施した是正（コード変更）

1. **Lexical インスペクタのテストドリフト**  
   `INSPECTABLE_NODE_TYPES` に `ruby` / `tooltip` が追加済みだったが、[`__tests__/unit/components/editor/lexical/inspector/inspectable-nodes.test.ts`](../../__tests__/unit/components/editor/lexical/inspector/inspectable-nodes.test.ts) が 34 件前提のままだった。件数を 36 に更新し、期待配列に `ruby` / `tooltip` を挿入。

2. **Instagram バリデーションの二重配置**  
   正本は [`src/shared/lib/validations/instagram.ts`](../../src/shared/lib/validations/instagram.ts)。[`src/app/(admin)/admin/(dashboard)/_shared/lib/validations/instagram.ts`](../../src/app/(admin)/admin/(dashboard)/_shared/lib/validations/instagram.ts) は `src` から未参照の複製だったため **削除**。ユニットテストの import を `@/shared/lib/validations/instagram` に統一。

## Findings（優先度）

### High（計画時点で検出、一部解消済み）

- **テストと実装の乖離**: インスペクタ登録ノード追加時にスナップショットテストを更新する運用を維持すること（今回修正済み）。
- **重複モジュール**: `shared` と `admin/_shared/lib/validations` で同名だったのは **`instagram.ts` のみ**（今回解消）。

### Medium

- **二重管理ドキュメントの内容差分**:  
  - [`docs/reference/codex-rules/lexical-patterns.md`](../../docs/reference/codex-rules/lexical-patterns.md) と [`.claude/rules/frontend/lexical-patterns.md`](../../.claude/rules/frontend/lexical-patterns.md) は **非一致**（行数 714 vs 854）。`.claude` 側に AccentColor システム等の追記があり、AGENTS.md が求める「方針・公式リンク・事実の一致」から **乖離**。Codex 利用者と Claude Code 利用者で読む内容が分岐するリスク。  
  - [`admin-inline-editor-patterns.md`](../../docs/reference/codex-rules/admin-inline-editor-patterns.md) ペアは diff 上 **主にフロントマター／導入文の差**で、本文はほぼ同一。

### Low / 情報

- **技術スタック表**: [`package.json`](../../package.json) と [`AGENTS.md`](../../AGENTS.md) の記載バージョンは一致。
- **境界（サンプル）**: `src/app/(public)` から `@/shared/db/prisma` / `@generated/prisma` の直 import は検出なし（ユニットの architecture-boundaries テスト群もパス）。
- **Tailwind ハードコード色**: `bg-gray-*` 等の典型的パターンは `src/**/*.tsx` grep で **ヒットなし**（網羅ではない）。
- **危険な型アサーション**: `as any` / `as unknown` / `as never` は **ヒットなし**（サンプル範囲）。
- **Zod `message:` 非推奨パターン**: 調査した `.min(..., message:)` 形式は **ヒットなし**（`error:` 運用と整合）。
- **大きいアクション**: `_shared/actions` 直下で 500 行超は [`settings/schemas/form-schemas.ts`](../../src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/form-schemas.ts)（約 520 行）。分割候補として記録。
- **eslint-disable**: 約 35 ファイル・コメント付き局所化。`LayoutFields.tsx` の `no-explicit-any` 等、境界理由付き。件数の異常増加は見ていない。

## 推奨バックログ（未実施）

1. **lexical-patterns 二重ファイルの同期**: `.claude` 側の追記を `docs/reference/codex-rules/lexical-patterns.md` に反映するか、意図的に Codex 向けを短く保つ方針なら両ファイル先頭に「差分の理由」を明記。
2. **form-schemas.ts**: 500 行超の維持負荷が高い場合は [`split-action-file`](../../.agents/skills/split-action-file/SKILL.md) 相当の方針でスキーマ分割を検討。
3. **本番相当ビルド**: 必要に応じて `bun run build:strict` で環境変数充足を確認（今回は CI 相当として `build` のみ）。

## 作業ツリー注意

`git status` に `.next/` や `.claude/` の未追跡が混ざるとレビューノイズになる。監査・PR 前は生成物と意図したエージェント資産の取り扱いをチームで固定すること。
