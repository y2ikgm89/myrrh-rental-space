# コメントパネル刷新 Phase 1（表示刷新）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans でタスク順に実装。ステップは `- [ ]` で追跡。

**Goal:** エディタコメントパネルを「一覧⇄詳細 swap」から「一覧=詳細同居の縦並びアコーディオン」へ刷新する（フロントのみ、バックエンド変更なし）。

**Architecture:** `CommentThread.tsx` を廃し、スレッド 1 件 = 1 枚の `CommentCard`（折りたたみ→その場展開）に統合。`CommentPanel` は単一スクロールの縦並びカードリストを描画し、複数カード同時展開を `Set<string>` で管理。展開時に detail を lazy fetch して `detailMap` にキャッシュ。active mark 追従で該当カードを自動展開 + スクロール。

**Tech Stack:** React 19 / React Compiler（手動メモ化禁止）/ Tailwind semantic token / date-fns / Skeleton SSoT / bun:test。

設計 SSoT: `docs/superpowers/specs/2026-06-01-comment-panel-redesign-design.md`

---

## File Structure

| ファイル                                                                             | 責務                                                                                                                                    |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `…/comment-panel/comment-panel-state.ts`（新規）                                     | パネル view-state の純関数（`toggleExpanded` / `withActiveExpanded`）。TDD 対象。                                                       |
| `…/comment-panel/CommentCard.tsx`（新規）                                            | スレッド 1 件カード。折りたたみヘッダー（引用/アバター/名前/時刻/件数/status/解決✓・削除）+ 展開時 `CommentItem` 一覧 + `CommentForm`。 |
| `…/comment-panel/CommentPanel.tsx`（書き換え）                                       | aside シェル + ヘッダー + 2 タブ + 縦並び `CommentCard`。複数展開・active 追従・Skeleton。                                              |
| `…/comment-panel/CommentItem.tsx`（微修正）                                          | アバターを image/イニシャル対応に。                                                                                                     |
| `…/comment-panel/CommentForm.tsx`（微修正）                                          | `autoFocus` prop 追加。                                                                                                                 |
| `…/comment-panel/CommentThread.tsx`（削除）                                          | 役割を CommentCard に統合。                                                                                                             |
| `…/comment-panel/index.ts`（更新）                                                   | `CommentThread` export 削除、`CommentCard` 追加。                                                                                       |
| `__tests__/unit/components/editor/comment-panel/comment-panel-state.test.ts`（新規） | 純関数のテスト。                                                                                                                        |

`…` = `src/app/(admin)/admin/(dashboard)/_shared/components`

---

## Task 1: パネル view-state の純関数（TDD）

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/comment-panel/comment-panel-state.ts`
- Test: `__tests__/unit/components/editor/comment-panel/comment-panel-state.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// __tests__/unit/components/editor/comment-panel/comment-panel-state.test.ts
import { describe, expect, test } from "bun:test";
import {
  toggleExpanded,
  withActiveExpanded,
} from "@/admin/components/editor/comment-panel/comment-panel-state";
import type { ThreadListItem } from "@/admin/types/editor-comment";

const thread = (id: string, markId: string): ThreadListItem => ({
  id,
  markId,
  quotedText: "quote",
  status: "ACTIVE",
  commentCount: 1,
  createdAt: "2026-06-01T00:00:00.000Z",
  createdByName: "田中",
});

describe("toggleExpanded", () => {
  test("未展開 id を追加する", () => {
    expect([...toggleExpanded(new Set(), "a")]).toEqual(["a"]);
  });
  test("展開済み id を除去する", () => {
    expect([...toggleExpanded(new Set(["a", "b"]), "a")]).toEqual(["b"]);
  });
  test("入力 Set を破壊しない", () => {
    const src = new Set(["a"]);
    toggleExpanded(src, "b");
    expect([...src]).toEqual(["a"]);
  });
});

describe("withActiveExpanded", () => {
  test("activeMarkId に一致する thread を展開集合に追加する", () => {
    const threads = [thread("t1", "m1"), thread("t2", "m2")];
    expect([...withActiveExpanded(new Set(), "m2", threads)]).toEqual(["t2"]);
  });
  test("activeMarkId が null なら変更しない", () => {
    const threads = [thread("t1", "m1")];
    expect([...withActiveExpanded(new Set(["t1"]), null, threads)]).toEqual([
      "t1",
    ]);
  });
  test("一致 thread が無ければ変更しない", () => {
    const threads = [thread("t1", "m1")];
    expect([...withActiveExpanded(new Set(), "zzz", threads)]).toEqual([]);
  });
  test("既存の展開を保持しつつ active を追加する", () => {
    const threads = [thread("t1", "m1"), thread("t2", "m2")];
    const result = withActiveExpanded(new Set(["t1"]), "m2", threads);
    expect([...result].sort()).toEqual(["t1", "t2"]);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `bun test __tests__/unit/components/editor/comment-panel/comment-panel-state.test.ts`
Expected: FAIL（モジュール未作成）

- [ ] **Step 3: 純関数を実装**

```typescript
// comment-panel-state.ts
import type { ThreadListItem } from "@/admin/types/editor-comment";

/** 展開状態の Set をトグル（非破壊）。 */
export function toggleExpanded(
  expanded: ReadonlySet<string>,
  threadId: string,
): Set<string> {
  const next = new Set(expanded);
  if (next.has(threadId)) {
    next.delete(threadId);
  } else {
    next.add(threadId);
  }
  return next;
}

/** activeMarkId に一致する thread を展開集合へ追加（非破壊・冪等）。 */
export function withActiveExpanded(
  expanded: ReadonlySet<string>,
  activeMarkId: string | null | undefined,
  threads: readonly ThreadListItem[],
): Set<string> {
  if (!activeMarkId) return new Set(expanded);
  const match = threads.find((t) => t.markId === activeMarkId);
  if (!match) return new Set(expanded);
  const next = new Set(expanded);
  next.add(match.id);
  return next;
}
```

- [ ] **Step 4: テスト pass を確認**

Run: `bun test __tests__/unit/components/editor/comment-panel/comment-panel-state.test.ts`
Expected: PASS（7 件）

- [ ] **Step 5: コミット**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/components/editor/comment-panel/comment-panel-state.ts" "__tests__/unit/components/editor/comment-panel/comment-panel-state.test.ts"
git commit -m "feat(admin): コメントパネル view-state 純関数 + テスト"
```

---

## Task 2: CommentItem アバター強化 + CommentForm autoFocus

**Files:**

- Modify: `…/comment-panel/CommentItem.tsx`
- Modify: `…/comment-panel/CommentForm.tsx`

- [ ] **Step 1: CommentItem のアバターを image/イニシャル対応にする**

`createdByUser.image` があれば `<img>`、なければ名前イニシャル円。現行の `IconUser` 固定を置換。アバター部分を次に差し替え:

```tsx
{
  /* アバター: image > 名前イニシャル > フォールバック */
}
{
  (() => {
    const user = comment.createdByUser;
    const initial = user?.name?.trim().charAt(0) ?? "";
    if (user?.image) {
      return (
        <img
          src={user.image}
          alt=""
          className="h-8 w-8 shrink-0 rounded-full object-cover"
        />
      );
    }
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
        {initial || <IconUser className="h-4 w-4" aria-hidden="true" />}
      </div>
    );
  })();
}
```

> 注: JSX 内 IIFE は `@eslint-react/unsupported-syntax` 違反。**JSX 外で変数抽出**してから return 内で参照すること（`const avatar = ...; return (... {avatar} ...)`）。実装時は関数本体冒頭で `avatarNode` を組み立てる。

- [ ] **Step 2: CommentForm に `autoFocus` prop を追加**

```tsx
type CommentFormProps = {
  onSubmit: (content: string) => Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
};
```

`<Textarea ... autoFocus={autoFocus} />` を渡す（Textarea は `autoFocus` を透過）。

- [ ] **Step 3: 検証**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミットは Task 4 でまとめて（CommentCard 完成後）**

---

## Task 3: CommentCard 新規作成

**Files:**

- Create: `…/comment-panel/CommentCard.tsx`

- [ ] **Step 1: CommentCard を実装**

責務: スレッド 1 件のカード。`isExpanded` で折りたたみ/展開、`isActive` でリング強調。展開時に detail（`EditorCommentThread`）を表示。detail 未取得時はヘッダーのみ + 件数。

Props:

```tsx
type CommentCardProps = {
  thread: ThreadListItem;
  detail: EditorCommentThread | undefined;
  isExpanded: boolean;
  isActive: boolean;
  onToggle: (threadId: string) => void;
  onResolve?: (threadId: string) => void;
  onReopen?: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onAddReply?: (threadId: string, content: string) => Promise<void>;
  onDeleteComment?: (commentId: string, threadId: string) => void;
};
```

UI 規律:

- 外枠: `rounded-lg border transition-colors`。active 時 `border-primary ring-2 ring-ring/40 bg-primary/5`、それ以外 `border-border bg-card`。
- ヘッダーは `<button type="button" aria-expanded={isExpanded} onClick={() => onToggle(thread.id)}>`、`min-h-11`（WCAG 2.5.5）。
- 引用スニペット: `text-sm text-muted-foreground line-clamp-2`、`"…"` で囲む。
- メタ行: イニシャル円アバター（`thread.createdByName` 先頭文字）+ 名前 + 相対時刻（`formatDistanceToNow(new Date(thread.createdAt), { addSuffix: true, locale: ja })`）+ 件数（`IconMessage` + `commentCount`）。
- status バッジ: `ACTIVE`/`RESOLVED` を `Badge`（`EDITOR_COMMENT_STATUS_LABELS` 使用、ハードコード禁止）。
- 解決✓ / 再オープン: ヘッダー右に `Button`。ACTIVE→`variant="ghost"` の `IconCheck`（`aria-label="解決"`）、RESOLVED→`IconRotate`（`aria-label="再オープン"`）。`h-11 w-11` か wrapper で 44px。
- 削除: `variant="destructive-ghost" size="icon"`（高密度 UI、`button-variants.md` 準拠）、`aria-label="削除"`。group-hover 表示。
- 展開部（`isExpanded && detail`）: `border-t` 区切り + `CommentItem` を `divide-y` で列挙 + ACTIVE なら `CommentForm`（`autoFocus` は active カードのみ）。
- detail 取得中（`isExpanded && !detail`）: `Skeleton variant="text"` を 2 行。
- カラーは semantic token のみ。`cn()` 使用。

参照実装の挙動は旧 `CommentThread.tsx`（解決/再オープン/削除/返信のボタン構成）を踏襲。

- [ ] **Step 2: 検証**

Run: `bun run type-check`
Expected: PASS

---

## Task 4: CommentPanel 書き換え + CommentThread 削除 + index 更新

**Files:**

- Modify（全面書き換え）: `…/comment-panel/CommentPanel.tsx`
- Delete: `…/comment-panel/CommentThread.tsx`
- Modify: `…/comment-panel/index.ts`

- [ ] **Step 1: CommentThread.tsx を削除**

```bash
git rm "src/app/(admin)/admin/(dashboard)/_shared/components/editor/comment-panel/CommentThread.tsx"
```

- [ ] **Step 2: index.ts を更新**

```typescript
export { CommentPanel } from "./CommentPanel";
export { CommentCard } from "./CommentCard";
export { CommentItem } from "./CommentItem";
export { CommentForm } from "./CommentForm";
```

- [ ] **Step 3: CommentPanel を書き換え**

状態: `tab` / `threads` / `expandedIds: Set<string>` / `detailMap: Record<string, EditorCommentThread>` / `isLoading` / `pendingCommentText`。

主要ロジック:

- タブ変更・初回・mutation 後に `fetchCommentThreads` で一覧再取得 → `setThreads`。
- `activeMarkId` 変化時: `setExpandedIds((prev) => withActiveExpanded(prev, activeMarkId, threads))` + 該当 detail を未取得なら fetch + 該当カードを `scrollIntoView`（`ref` Map か `document.getElementById` で要素取得、`block: "nearest"`）。
- カードトグル: `setExpandedIds((prev) => toggleExpanded(prev, id))` + 展開時 detail 未取得なら fetch。
- resolve/reopen/delete/addReply/deleteComment: 既存 action（`resolveThread` 等）流用。成功後 `loadThreads()` + detailMap 更新。解決/再オープン/削除後は当該 id を `expandedIds` と `detailMap` から除去。
- 描画: ローディング → `Skeleton`（カード型 3 枚）。空 → 中央メッセージ。それ以外 → `threads.map((t) => <CommentCard ... isExpanded={expandedIds.has(t.id)} isActive={t.markId === activeMarkId} detail={detailMap[t.id]} />)`。
- ヘッダー/タブ/pending composer/モバイルオーバーレイ/`<aside>` の translate-x アニメは現行 `CommentPanel` の外形を踏襲（semantic token / WCAG 44px 維持）。タブ件数バッジは両タブ表示。
- React Compiler 前提で手動メモ化禁止。`startTransition` は React 19 パターン踏襲。

- [ ] **Step 4: 検証**

Run: `bun run validate`
Expected: PASS（type-check + lint）

- [ ] **Step 5: PostEditor / NewsEditor の import が壊れていないか確認**

`CommentPanel` の props（`isOpen` / `contentType` / `contentId` / `activeMarkId` / `onClose` / `pendingComment` / `onPendingCommentSubmit`）は不変に保つ（consumer 改修不要）。

Run: `grep -n "CommentPanel" "src/app/(admin)/admin/(dashboard)/posts/_components/PostEditor.tsx" "src/app/(admin)/admin/(dashboard)/news/_components/NewsEditor.tsx"`
Expected: props 変更なしで型エラーなし

- [ ] **Step 6: build + test**

Run: `bun run build`
Expected: exit 0

Run: `bun test __tests__/unit/components/editor/comment-panel/`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/components/editor/comment-panel/"
git commit -m "feat(admin): コメントパネルを一覧=詳細同居のカード型に刷新（Phase 1）"
```

---

## Self-Review チェック

- Spec の Phase 1 要件（同居縦並び / リッチカード / Skeleton / ワンクリック解決 / autoFocus / CommentThread 削除）を Task 1-4 が網羅。
- 型整合: `toggleExpanded` / `withActiveExpanded`（Task1）= CommentPanel（Task4）で同名使用。`CommentCardProps`（Task3）= CommentPanel の `<CommentCard>`（Task4）で一致。
- placeholder なし（各 Step に具体コード or 具体規律）。
- バックエンド変更なし（API / domain / schema 不変）。consumer（Post/News）props 不変。

## 検証（完遂）

`bun run validate && bun run build` exit 0 + `bun run test:unit` / `test:integration` 両走。
