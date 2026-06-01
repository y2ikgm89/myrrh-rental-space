# エディタコメントパネル UI/UX 刷新 設計

> 対象: Lexical エディタのインラインコメント機能（`_shared/components/editor/comment-panel/**`）。
> 方針: **破壊的変更可・後方互換なし・公式最新推奨のクリーン実装**。Post / News で利用。

## 背景・課題

Lexical エディタの本文選択範囲に紐づくコメントスレッド機能（Google Docs 型）。現行 `CommentPanel` の UX 課題:

1. **一覧と詳細が排他**（最大課題）— `ThreadList` は「一覧」か「単一スレッド詳細」のどちらか一方しか描画しない（`if (expandedThread) return <単一>`）。スレッドを開くと他の未解決コメントが画面から消え、「未解決を見ながら作業」という用途と矛盾。
2. **カード情報が薄い** — 一覧は引用テキスト + 件数のみ。投稿者・最新コメント・時刻が見えずスキャンしづらい（`ThreadListItem` は `latestComment` / `createdByName` / `createdAt` を**既に返している**のに未使用）。
3. **本文マークとパネルが片方向連携** — 本文マーククリック → スレッドは開くが、逆（カード→本文）がない。スクロール/ハイライト協調も弱い。
4. **ローディングが素テキスト**（「読み込み中...」）— プロジェクト標準 `Skeleton` SSoT 未使用。
5. **作成トリガーのフォーカス未制御** — pending コメント composer が出ても自動フォーカスされない。

## 調査結論（業界主流 2026）

Google Docs / Notion / Figma / Linear / Sanity Studio / GitHub PR の横断調査より:

- **一覧=詳細同居の縦並びアコーディオン**が圧倒的主流（二画面切替はほぼ不採用）。
- **双方向クリック同期**（本文ハイライト→カードへスクロール+ハイライト / カード→本文 range 選択+スクロール）は必須標準。**Google Docs 式の位置追従スクロールは over-engineering で少数派 → 不採用**。
- カード情報の必須コア: **アバター + 名前 + 相対時刻 + 本文 + ステータス**。本文ハイライトが残るなら引用再掲は任意（本設計では位置特定補助として短い引用スニペットを残す）。
- ステータス: 「未解決を既定 + 解決済みは別表示」が主流。本プロジェクトは既存の 2 タブ（未解決 / 解決済み）を踏襲（GitHub もタブ式、churn 最小）。
- 作成: テキスト選択 → フローティングボタン → **即入力欄フォーカス**。
- 解決: カードヘッダのワンクリック → 未解決リストから除外 + 本文マーク淡色化。
- A11y: コメント間 次/前キーボード巡回、resolve への Tab→Enter 到達、挿入時フォーカス移動、全 interactive 44×44px。

## 設計（クリーン実装）

### コンポーネント構成（破壊的再編）

| ファイル            | 変更             | 役割                                                                                                                                                                                                                                                                                                |
| ------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CommentPanel.tsx`  | **全面書き換え** | `<aside>` シェル + ヘッダー（件数）+ 2 タブ + **単一スクロールの `CommentCard` 縦並び**。一覧⇄詳細 swap を撤廃。pending composer を先頭に。                                                                                                                                                         |
| `CommentCard.tsx`   | **新規**         | スレッド 1 件 = 1 カード。既定折りたたみ（引用スニペット / アバター+名前+相対時刻 / 最新コメントプレビュー / 件数 / ステータス / 解決✓・削除アクション）。クリックでその場展開 → `CommentItem` 一覧 + `CommentForm` 返信。active（`markId === activeMarkId`）でリング強調 + 自動展開 + スクロール。 |
| `CommentItem.tsx`   | リフレッシュ     | アバター + 名前 + 相対時刻 + 本文 + 削除。                                                                                                                                                                                                                                                          |
| `CommentForm.tsx`   | リフレッシュ     | 返信 / 新規 composer。展開時オートフォーカス。                                                                                                                                                                                                                                                      |
| `CommentThread.tsx` | **削除**         | 役割を `CommentCard` に統合（後方互換シムを残さない）。                                                                                                                                                                                                                                             |
| `index.ts`          | 更新             | `CommentThread` export 削除、`CommentCard` 追加。                                                                                                                                                                                                                                                   |

### 状態モデル（CommentPanel）

`expandedThread: 単一` を撤廃し、同居展開に対応:

- `tab: "active" | "resolved"`
- `threads: ThreadListItem[]`（タブ status で API フィルタ）
- `expandedIds: Set<string>`（複数カード同時展開可）
- `detailMap: Record<threadId, EditorCommentThread>`（展開時に lazy fetch、再取得時更新）
- `isLoading`（→ Skeleton）/ `pendingCommentText`

active mark 追従: `activeMarkId` 変化時、該当カードを `expandedIds` に追加 + detail を fetch + `scrollIntoView`。

### Phase 分割

#### Phase 1 — 表示刷新（フロントのみ / バックエンド変更なし）

- `CommentCard` 新規 + `CommentPanel` 書き換え（同居縦並び・複数展開）。
- リッチカード（`ThreadListItem.latestComment` / `createdByName` / `createdAt` / `commentCount` / `status` を表示、アバターは detail fetch 後の `createdByUser.image` または名前イニシャルのフォールバック）。
- `Skeleton`（admin SSoT `@/admin/components/ui`）でローディング。
- 解決✓ をカードヘッダにワンクリック配置（既存 `resolveThread` / `reopenThread` 流用）。
- pending composer 表示時に `CommentForm` を **オートフォーカス**。
- `CommentThread.tsx` 削除。

#### Phase 2 — 双方向同期 + 解決マーク淡色化

- **カード → 本文**: `CommentPlugin` に `SELECT_MARK_COMMAND(markId)` を追加。markId から `MarkNode` を解決し、range 選択 + `scrollIntoView` + フラッシュハイライト。`CommentPanel` は `trailingPanel` として `LexicalComposer` 配下に描画されるため `useLexicalComposerContext()` で直接 dispatch 可能（新 prop 不要）。
- **本文 → カード**: 既存 `CLICK_MARK_COMMAND` → `onMarkClick` → `activeMarkId` 経路を維持し、Phase 1 の active 追従（展開+スクロール）で受ける。
- **解決マーク淡色化**: スレッド status を markId→status マップで `CommentPlugin` に渡し、mark 要素へ `data-comment-status="resolved"` を付与。`lexical-content.css`（または admin エディタ CSS）で淡色スタイル。

#### Phase 3 — A11y 仕上げ

- コメント間 次/前キーボード巡回（パネル内 `↑/↓` or `J/K`、もしくは Tab 順序整備）。
- 全 interactive 要素 44×44px 監査（解決✓ / 削除 / カードトグル / 返信送信）。
- フォーカス管理（パネル open 時・カード展開時・pending 挿入時）。
- `aria-*`（カードトグルの `aria-expanded`/`aria-controls`、ステータスの SR テキスト）。

### 意図的に不採用（over-engineering 回避）

Google Docs 式の位置追従スクロール / @メンション通知基盤 / 複数レビュアー色分け / リアルタイム協調編集。単一〜小規模運用の CMS には不要（調査結論と一致）。

### 制約・準拠

- **カラー**: ハードコード禁止、semantic token（`bg-card` / `text-muted-foreground` / `border-border` / `text-destructive` 等）。
- **削除ボタン**: `button-variants.md` 準拠。カード内の高密度削除アイコンは `destructive-ghost`、確定的削除は `destructive`。
- **React 19 / React Compiler**: 手動メモ化禁止。`use(Context)`。
- **日付**: 相対時刻は既存 `date-fns formatDistanceToNow` + `ja` を踏襲（`CommentThread` で実績）。
- **アバター**: admin に Avatar primitive があれば流用、なければ名前イニシャルの円形フォールバック（`createdByUser.image` nullable 対応）。
- **バックエンド**: Phase 1 は API / domain / schema 変更なし。Phase 2 の `SELECT_MARK_COMMAND` は Lexical plugin 内のみ。

## テスト方針

- Phase 1: `CommentPanel` / `CommentCard` の表示ロジック（複数展開、active 追従、空/ローディング状態）の単体テスト（bun:test、既存 `comment-panel` テスト方針に従う）。状態 reducer 的ロジックは純関数抽出してテスト。
- Phase 2: `SELECT_MARK_COMMAND` の mark 解決ロジック。E2E（`e2e/` Playwright）でコメント作成→解決→双方向同期の主要シナリオ（opt-in label）。
- 既存 `__tests__/integration/actions/admin/editor-comment.test.ts` / `__tests__/unit/domain/editor-comments/commands.test.ts` は domain 層のため影響なし（UI 刷新のみ）。

## 検証

各 Phase 完了時に `bun run validate && bun run build`。完遂判定は `test:unit` + `test:integration` 両走。
