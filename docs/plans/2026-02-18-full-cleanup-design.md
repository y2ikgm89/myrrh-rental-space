# 全領域クリーンアップ設計

**日付**: 2026-02-18
**方針**: 破壊的変更を許容。公式最新ベストプラクティス準拠。後方互換性ハックなし。

---

## 目的

プロジェクト全体を以下4領域でクリーンアップし、公式推奨の最新実装に統一する。

1. テストコード — Bun ネイティブパターンに統一
2. 未追跡ファイル統合 — 新規 Lexical 機能・公開ルートを正式統合
3. 依存パッケージ更新 — メジャーバージョンアップ含む
4. コードパターン — 残存する古いパターン・後方互換ハックを排除

---

## フェーズ構成

### Phase 1 — 並行調査

各調査を並行エージェントで実施。context7・WebSearch・MCP フル活用。

| 調査項目                       | 方法                                            |
| ------------------------------ | ----------------------------------------------- |
| 最新パッケージバージョン確認   | context7 + WebSearch で各ライブラリ公式確認     |
| テスト内 Vitest API 残存       | grep で `vi\.` パターン検索                     |
| 未追跡ファイルの依存マッピング | codebase-explorer で import 追跡                |
| コードパターン監査             | grep で `as `, `@ts-ignore`, magic strings 検索 |

### Phase 2 — テストコード修正

対象: `__tests__/` 全ファイル

**修正内容**:

- `vi.restoreAllMocks()` → `mock.mockReset()`（Bun ネイティブ API）
- `vi.fn()`, `vi.mock()` → `mock()`, `mock.module()`
- `mockSession()` 等のカスタムヘルパーを Bun パターンに置換
- `import { mock } from 'bun:test'` を追加

**検証**: `bun run test` で全テストパス

### Phase 3 — 未追跡ファイル統合

**Lexical inspector パネル（10種）**:

- `CollapsibleInspectorPanel`, `EmbedInspectorPanel`, `InstagramInspectorPanel`,
  `LayoutInspectorPanel`, `PageBreakInspectorPanel`, `PullQuoteInspectorPanel`,
  `StepsInspectorPanel`, `TabsInspectorPanel`, `XInspectorPanel`, `YouTubeInspectorPanel`
- → `inspector/panels/index.ts` + `InspectorSidebar.tsx` に登録

**新規プラグイン（8種）**:

- `AutoSavePlugin`, `BlockTemplatePlugin`, `CodeBlockPlugin`, `FindReplacePlugin`,
  `ImageDropPlugin`, `KeyboardShortcutsPlugin`, `MarkdownExportPlugin`, `WordCountPlugin`
- → `plugins/index.ts` に追加

**新規ノード（2種）**:

- `CollapsibleItemNode`, `TableOfContentsNode`
- → `nodes/index.ts` に追加

**公開ページコンポーネント**:

- `ArticleDetailHero.tsx` — posts/news 詳細ページでの使用確認
- `Pagination.tsx` — 一覧ページでの使用確認

**CTA button editor**:

- `shared/` から `admin/` への移動完了確認・参照更新

### Phase 4 — 依存パッケージ更新

context7・WebSearch で各パッケージの最新バージョンと移行ガイドを確認後、更新。

| パッケージ   | 現在       | 確認内容                         |
| ------------ | ---------- | -------------------------------- |
| Next.js      | 16.1.6     | 最新版 + 移行ガイド              |
| React        | 19.2.4     | 最新版 + 変更点                  |
| Prisma       | 7.4.0      | 最新版 + スキーマ変更            |
| Better Auth  | 1.4.18     | 最新版 + API 変更                |
| Lexical      | 0.40.0     | 最新版 + Node/Plugin API 変更    |
| TypeScript   | 6.0.0-beta | stable リリース確認              |
| ESLint       | 9.39.2     | ESLint 10 プラグイン対応状況確認 |
| その他全依存 | —          | `bun outdated` で一括確認        |

### Phase 5 — コードパターン最終クリーンアップ

Phase 1 監査結果に基づいて修正:

- 残存型アサーション（`as`）の排除
- マジックストリングの定数化
- 後方互換ハック（`_unused`, `// removed:` 等）の完全削除
- デッドコードの削除

### Phase 6 — 最終検証

```bash
bun run test          # 全テストパス
bun run validate      # type-check + lint パス
bun run build         # ビルド成功
```

---

## 制約・方針

- **後方互換性ハック禁止**: 不要コードは完全削除
- **型アサーション禁止**: enums.ts の型ガード・satisfies・Zod を使用
- **マジックストリング禁止**: 定数・Prisma enum を使用
- **検証なし完了報告禁止**: 各フェーズ終了時に validate を実行
