# Lexical リンクカード（内部 / 外部）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lexical 本文に「内部リンクカード（サイト内 posts/news/spaces/events 参照）」と「外部リンクカード（OGP）」を統一ダイアログから挿入し、内部カードは公開描画時に最新データへ解決する。

**Architecture:** 内部=参照 `{ contentType, contentId }` を `InternalLinkCardNode`（DecoratorNode）に保存し、`exportDOM` はプレースホルダー `<a data-internal-link-card>` を出力。公開ページの Server Component で `resolveInternalLinkCards(html)` を実行し DB から最新カードへ差し替え（削除/非公開は除去）。外部=既存 `BookmarkNode`（OGP スナップショット）を流用し、両者を 1 つの `LinkCardDialog`（2タブ）から挿入。

**Tech Stack:** Lexical 0.43 NodeState API / Next.js 16 RSC + `'use cache'` / Prisma 7 / Zod 4 / bun:test / conform は不使用（ダイアログは独自 UI）

設計 spec: `docs/superpowers/specs/2026-05-30-lexical-link-cards-design.md`

---

## ファイル構成

### Phase 1（PR 1）: InternalLinkCardNode + 登録 + 型ガード

- Create: `.../editor/lexical/nodes/InternalLinkCardNode.tsx` — ノード本体
- Create: `.../editor/lexical/config/link-card-types.ts` — `LinkCardContentType` 型 + 型ガード + ラベル + URL prefix
- Modify: `.../editor/lexical/config/nodes.ts` — `EDITOR_NODES` に追加
- Modify: `.../editor/lexical/nodes/index.ts` — barrel export
- Test: `__tests__/unit/components/editor/lexical/internal-link-card-node.test.ts`

### Phase 2（PR 2）: LinkCardDialog（2タブ）+ 検索 API + insert-items 統合

- Create: `.../editor/lexical/plugins/LinkCardPlugin.tsx` — 2タブダイアログ（内部ピッカー + 外部 URL）
- Create: `src/app/(admin)/admin/api/link-cards/search/route.ts` — 内部候補検索 API
- Create: `src/shared/domain/link-cards/search-queries.ts` — 横断検索クエリ（4種別）
- Modify: `.../editor/lexical/config/dialog-registry.ts` — `linkCard` 登録 + `bookmark` 削除
- Modify: `.../editor/lexical/plugins/index.ts` — `LinkCardPlugin` export（`BookmarkPlugin` は内部利用のみに）
- Modify: `.../editor/lexical/config/insert-items/embed.ts` — `bookmark` → `linkCard` に置換
- Test: `__tests__/integration/api/link-cards-search.test.ts`

### Phase 3（PR 3）: 公開描画時の参照解決 + 配線 + CSS

- Create: `src/shared/lib/lexical/resolve-internal-link-cards.ts` — HTML 後処理 SSoT
- Create: `src/shared/domain/link-cards/resolve-queries.ts` — id バッチ解決（4種別、公開フィルタ）
- Modify: 公開詳細 4 箇所で `resolveInternalLinkCards` を配線
- Modify: `src/shared/styles/lexical-content.css` — `[data-internal-link-card]` セレクタ
- Test: `__tests__/unit/lib/lexical/resolve-internal-link-cards.test.ts`
- Test: `__tests__/unit/domain/link-cards/resolve-queries.test.ts`

---

## Phase 1: InternalLinkCardNode

### Task 1: コンテンツ種別の型・ラベル・URL prefix

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/link-card-types.ts`

- [ ] **Step 1: 型・型ガード・ラベルを定義**

```ts
/**
 * Link Card — 内部リンクカードのコンテンツ種別 SSoT
 *
 * Prisma enum ではないため（複数モデル横断の論理種別）、ノード config 配下に定義する。
 */
import { createEnumGuard } from "./type-guards";

export type LinkCardContentType = "post" | "news" | "space" | "event";

export const LINK_CARD_CONTENT_TYPES: readonly LinkCardContentType[] = [
  "post",
  "news",
  "space",
  "event",
] as const;

export const isLinkCardContentType = createEnumGuard<LinkCardContentType>(
  LINK_CARD_CONTENT_TYPES,
);

export const LINK_CARD_TYPE_LABELS: Record<LinkCardContentType, string> = {
  post: "記事",
  news: "お知らせ",
  space: "スペース",
  event: "イベント",
};
```

- [ ] **Step 2: type-check**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep link-card-types || echo OK`
Expected: `OK`（このファイル起因のエラーなし）

- [ ] **Step 3: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/link-card-types.ts"
git commit -m "feat(lexical): リンクカードのコンテンツ種別型・型ガード・ラベルを追加"
```

注: `createEnumGuard` は `config/type-guards.ts` に既存（`nodes.md` 記載）。シグネチャは
`createEnumGuard<T>(values: readonly T[]): (value: string) => value is T`。

### Task 2: InternalLinkCardNode の失敗テスト（exportDOM ↔ importDOM round-trip）

**Files:**

- Test: `__tests__/unit/components/editor/lexical/internal-link-card-node.test.ts`

- [ ] **Step 1: 失敗テストを書く**

```ts
import { describe, expect, test } from "bun:test";
import { createEditor } from "lexical";
import {
  $createInternalLinkCardNode,
  $isInternalLinkCardNode,
  InternalLinkCardNode,
  internalLinkCardContentIdState,
  internalLinkCardContentTypeState,
} from "@/admin/components/editor/lexical/nodes/InternalLinkCardNode";
import { $getState } from "lexical";

function withEditor(fn: () => void): void {
  const editor = createEditor({
    nodes: [InternalLinkCardNode],
    onError: (e) => {
      throw e;
    },
  });
  editor.update(fn, { discrete: true });
}

describe("InternalLinkCardNode", () => {
  test("factory が state を設定する", () => {
    withEditor(() => {
      const node = $createInternalLinkCardNode({
        contentType: "post",
        contentId: "abc-123",
      });
      expect($isInternalLinkCardNode(node)).toBe(true);
      expect($getState(node, internalLinkCardContentTypeState)).toBe("post");
      expect($getState(node, internalLinkCardContentIdState)).toBe("abc-123");
    });
  });

  test("exportDOM がプレースホルダー a[data-internal-link-card] を出力する", () => {
    withEditor(() => {
      const node = $createInternalLinkCardNode({
        contentType: "event",
        contentId: "evt-9",
      });
      const { element } = node.exportDOM();
      expect(element).toBeInstanceOf(HTMLElement);
      if (!(element instanceof HTMLElement)) return;
      expect(element.getAttribute("data-internal-link-card")).toBe("true");
      expect(element.getAttribute("data-content-type")).toBe("event");
      expect(element.getAttribute("data-content-id")).toBe("evt-9");
    });
  });

  test("不正な contentType は post に fallback する", () => {
    withEditor(() => {
      const node = $createInternalLinkCardNode({
        // @ts-expect-error 異常系: 不正値の parse fallback を検証
        contentType: "garbage",
        contentId: "x",
      });
      expect($getState(node, internalLinkCardContentTypeState)).toBe("post");
    });
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `bun test __tests__/unit/components/editor/lexical/internal-link-card-node.test.ts`
Expected: FAIL（`InternalLinkCardNode` が存在しない / import エラー）

### Task 3: InternalLinkCardNode を実装

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/InternalLinkCardNode.tsx`

参照テンプレート: `nodes/BookmarkNode.tsx`（同じ DecoratorNode + NodeState 構成）。
相違点: state は `contentType` / `contentId` の 2 つのみ。`exportDOM` は **空の `<a>` プレースホルダー**
（カード本体は公開描画時に `resolveInternalLinkCards` が生成）。`decorate()` はエディタ内プレビュー用に
種別ラベル + contentId を表示する軽量カード（v1 はデータ fetch せずプレースホルダー的表示で可）。

- [ ] **Step 1: ノードを実装**

```tsx
"use client";

import type { ReactElement } from "react";
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
} from "lexical";
import {
  $create,
  $getState,
  $setState,
  createState,
  DecoratorNode,
} from "lexical";
import { IconLink } from "@tabler/icons-react";
import { parseString } from "../config/type-guards";
import {
  type LinkCardContentType,
  LINK_CARD_TYPE_LABELS,
  isLinkCardContentType,
} from "../config/link-card-types";

// =============================================================================
// State
// =============================================================================

export const internalLinkCardContentTypeState = createState("contentType", {
  parse: (v: unknown): LinkCardContentType =>
    typeof v === "string" && isLinkCardContentType(v) ? v : "post",
});

export const internalLinkCardContentIdState = createState("contentId", {
  parse: parseString,
});

// =============================================================================
// Editor preview component
// =============================================================================

function InternalLinkCardComponent({
  contentType,
  contentId,
}: {
  contentType: LinkCardContentType;
  contentId: string;
}): ReactElement {
  return (
    <div
      data-internal-link-card
      className="my-6 flex items-center gap-3 rounded-lg border bg-muted/40 p-4"
    >
      <IconLink className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {LINK_CARD_TYPE_LABELS[contentType]}
          （公開ページで最新情報に展開されます）
        </p>
        <p className="truncate text-sm font-medium">{contentId}</p>
      </div>
    </div>
  );
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertInternalLinkCardElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const contentTypeAttr = element.getAttribute("data-content-type") ?? "";
  const contentType = isLinkCardContentType(contentTypeAttr)
    ? contentTypeAttr
    : "post";
  const contentId = element.getAttribute("data-content-id") ?? "";
  return { node: $createInternalLinkCardNode({ contentType, contentId }) };
}

// =============================================================================
// Node Class
// =============================================================================

export class InternalLinkCardNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config("internal-link-card", {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: internalLinkCardContentTypeState },
        { flat: true, stateConfig: internalLinkCardContentIdState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      a: (element: HTMLElement) => {
        if (element.hasAttribute("data-internal-link-card")) {
          return { conversion: $convertInternalLinkCardElement, priority: 2 };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const contentType = $getState(this, internalLinkCardContentTypeState);
    const contentId = $getState(this, internalLinkCardContentIdState);
    const link = document.createElement("a");
    link.setAttribute("data-internal-link-card", "true");
    link.setAttribute("data-content-type", contentType);
    link.setAttribute("data-content-id", contentId);
    link.setAttribute("href", "#");
    return { element: link };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-internal-link-card", "true");
    return div;
  }

  override updateDOM(): false {
    return false;
  }

  override decorate(): ReactElement {
    return (
      <InternalLinkCardComponent
        contentType={$getState(this, internalLinkCardContentTypeState)}
        contentId={$getState(this, internalLinkCardContentIdState)}
      />
    );
  }
}

// =============================================================================
// Factory / Guard
// =============================================================================

export function $createInternalLinkCardNode({
  contentType,
  contentId,
}: {
  contentType: LinkCardContentType;
  contentId: string;
}): InternalLinkCardNode {
  const node = $create(InternalLinkCardNode);
  $setState(node, internalLinkCardContentTypeState, contentType);
  $setState(node, internalLinkCardContentIdState, contentId);
  return node;
}

export function $isInternalLinkCardNode(
  node: LexicalNode | null | undefined,
): node is InternalLinkCardNode {
  return node instanceof InternalLinkCardNode;
}
```

- [ ] **Step 2: テストが通ることを確認**

Run: `bun test __tests__/unit/components/editor/lexical/internal-link-card-node.test.ts`
Expected: PASS（3 テスト）

- [ ] **Step 3: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/InternalLinkCardNode.tsx" \
  "__tests__/unit/components/editor/lexical/internal-link-card-node.test.ts"
git commit -m "feat(lexical): InternalLinkCardNode を追加（参照ベース、exportDOM プレースホルダー）"
```

### Task 4: ノードを editor に登録

**Files:**

- Modify: `.../editor/lexical/config/nodes.ts`（`EDITOR_NODES` 配列に追加）
- Modify: `.../editor/lexical/nodes/index.ts`（barrel export 追加）

- [ ] **Step 1: barrel export を追加**

`nodes/index.ts` に既存 `BookmarkNode` export の近くへ追加:

```ts
export {
  InternalLinkCardNode,
  $createInternalLinkCardNode,
  $isInternalLinkCardNode,
  internalLinkCardContentTypeState,
  internalLinkCardContentIdState,
} from "./InternalLinkCardNode";
```

- [ ] **Step 2: EDITOR_NODES に登録**

`config/nodes.ts` の `EDITOR_NODES` 配列に `InternalLinkCardNode` を import + 追加
（`BookmarkNode` の隣）。import 元は `../nodes/InternalLinkCardNode` または barrel に合わせる。

- [ ] **Step 3: validate**

Run: `bun run type-check`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/nodes.ts" \
  "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/index.ts"
git commit -m "feat(lexical): InternalLinkCardNode を EDITOR_NODES に登録"
```

### Task 5: Phase 1 検証 + PR

- [ ] **Step 1: validate + 関連 unit**

Run: `bun run validate && bun test __tests__/unit/components/editor/lexical/`
Expected: exit 0 / 全 PASS

- [ ] **Step 2: build**

Run: `bun run build`
Expected: exit 0

- [ ] **Step 3: push + PR + auto-merge**

```bash
git push -u origin feat/lexical-link-cards
gh pr create --base main --title "feat(lexical): 内部リンクカードノード基盤を追加" --body "<spec + plan へのリンク>"
gh pr merge --auto --squash --delete-branch
```

---

## Phase 2: LinkCardDialog + 検索 API + insert-items 統合

> 注: Phase 1 PR が merge されたら `git checkout main && git pull --ff-only && git checkout -b feat/lexical-link-card-dialog` で新ブランチ。

### Task 6: 横断検索クエリの失敗テスト

**Files:**

- Test: `__tests__/integration/api/link-cards-search.test.ts`

検索結果の正規化型を定義（実装と共有）:

```ts
// search-queries.ts が export する型
export type LinkCardSearchItem = {
  contentType: LinkCardContentType;
  contentId: string;
  title: string;
  thumbnailUrl: string | null;
};
```

- [ ] **Step 1: 失敗テストを書く**（種別フィルタ + クエリで公開コンテンツのみ返すことを検証）

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { prisma } from "@/shared/db/prisma";
import { searchLinkCardCandidates } from "@/shared/domain/link-cards/search-queries";

describe("searchLinkCardCandidates", () => {
  test("post 種別で公開記事のみを返す", async () => {
    const results = await searchLinkCardCandidates({
      contentType: "post",
      query: "",
      limit: 10,
    });
    expect(Array.isArray(results)).toBe(true);
    for (const r of results) {
      expect(r.contentType).toBe("post");
      expect(typeof r.contentId).toBe("string");
      expect(typeof r.title).toBe("string");
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `bun test __tests__/integration/api/link-cards-search.test.ts`
Expected: FAIL（`searchLinkCardCandidates` 未定義）

### Task 7: 横断検索クエリを実装

**Files:**

- Create: `src/shared/domain/link-cards/search-queries.ts`

各種別の既存 public-queries の published フィルタ・フィールド名を踏襲する。
posts は `PostStatus.PUBLISHED` + `{ id, title, thumbnailUrl }`。news/spaces/events は各
`*/public-queries.ts` または `*/queries.ts` の select を確認し、同等の id/title/thumbnail を取得。
thumbnail が無い種別は `null`。

- [ ] **Step 1: 実装**（種別ごとに分岐し、`title` 部分一致 + 公開フィルタ + `take: limit`）

```ts
import "server-only";

import { prisma } from "@/shared/db/prisma";
import { PostStatus } from "@generated/prisma/enums";
import { toPlainArray } from "@/shared/lib/serialize";
import {
  type LinkCardContentType,
  isLinkCardContentType,
} from "@/admin/components/editor/lexical/config/link-card-types";

export type LinkCardSearchItem = {
  contentType: LinkCardContentType;
  contentId: string;
  title: string;
  thumbnailUrl: string | null;
};

const SEARCH_LIMIT_DEFAULT = 10;
const SEARCH_LIMIT_MAX = 30;

export async function searchLinkCardCandidates(params: {
  contentType: LinkCardContentType;
  query: string;
  limit?: number;
}): Promise<LinkCardSearchItem[]> {
  const limit = Math.min(
    params.limit ?? SEARCH_LIMIT_DEFAULT,
    SEARCH_LIMIT_MAX,
  );
  const q = params.query.trim();
  const contains =
    q.length > 0 ? { contains: q, mode: "insensitive" as const } : undefined;

  switch (params.contentType) {
    case "post": {
      const rows = await prisma.post.findMany({
        where: {
          status: PostStatus.PUBLISHED,
          ...(contains && { title: contains }),
        },
        select: { id: true, title: true, thumbnailUrl: true },
        orderBy: { publishedAt: "desc" },
        take: limit,
      });
      return toPlainArray(
        rows.map((r) => ({
          contentType: "post" as const,
          contentId: r.id,
          title: r.title,
          thumbnailUrl: r.thumbnailUrl ?? null,
        })),
      );
    }
    // news / space / event は各 public-queries の published フィルタ + select に合わせて
    // 同形 ({ contentId, title, thumbnailUrl }) で実装する。
    // - news:  prisma.news（公開フィルタは news/queries.ts を参照）
    // - space: prisma.space（imageUrls[0] 等を thumbnail に。公開フィルタは spaces/public-queries.ts）
    // - event: prisma.event（cover 系フィールド。公開フィルタは events/public-queries.ts）
    default:
      if (!isLinkCardContentType(params.contentType)) return [];
      return [];
  }
}
```

> 実装者は news/space/event ブランチを **必ず**埋める。各ドメインの公開フィルタ条件と
> サムネイルフィールド名は対応する `*/queries.ts` / `*/public-queries.ts` の `select` を grep して確認。
> 型を最小化して欠落させない（plan の `LinkCardSearchItem` shape を維持）。

- [ ] **Step 2: テストが通ることを確認**

Run: `bun test __tests__/integration/api/link-cards-search.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/shared/domain/link-cards/search-queries.ts \
  __tests__/integration/api/link-cards-search.test.ts
git commit -m "feat(link-cards): 内部リンクカード候補の横断検索クエリを追加"
```

### Task 8: 検索 Route Handler

**Files:**

- Create: `src/app/(admin)/admin/api/link-cards/search/route.ts`

参照: `src/app/(admin)/admin/api/ogp/route.ts`（`checkAdminAuth` + `NextResponse.json` + zod safeParse）。

- [ ] **Step 1: 実装**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminAuth } from "@/admin/lib/action-auth";
import { searchLinkCardCandidates } from "@/shared/domain/link-cards/search-queries";
import { LINK_CARD_CONTENT_TYPES } from "@/admin/components/editor/lexical/config/link-card-types";

const querySchema = z.object({
  contentType: z.enum(LINK_CARD_CONTENT_TYPES),
  query: z.string().max(100).default(""),
});

export async function GET(request: Request) {
  const auth = await checkAdminAuth(request.headers);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error.error }, { status: 401 });
  }
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    contentType: url.searchParams.get("contentType"),
    query: url.searchParams.get("query") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "リクエストが不正です" },
      { status: 400 },
    );
  }
  const items = await searchLinkCardCandidates(parsed.data);
  return NextResponse.json({ items });
}
```

- [ ] **Step 2: type-check + Commit**

Run: `bun run type-check`
Expected: exit 0

```bash
git add "src/app/(admin)/admin/api/link-cards/search/route.ts"
git commit -m "feat(link-cards): 内部リンクカード候補検索 API を追加（checkAdminAuth）"
```

### Task 9: LinkCardPlugin（2タブダイアログ）

**Files:**

- Create: `.../editor/lexical/plugins/LinkCardPlugin.tsx`

参照: `BookmarkPlugin.tsx`（外部 URL/OGP フロー）+ `IconPickerDialog`（検索 + グリッド選択 UX）。
props は `DialogPluginProps`（`{ isOpen, onClose }`）。タブは `@/admin/components/ui` の Tabs。

挙動:

- タブ「サイト内」: 種別 Select + 検索入力 → `fetchAdminJson("/admin/api/link-cards/search?...")` →
  候補リスト → 選択で `editor.update(() => $insertNodeToNearestRoot($createInternalLinkCardNode({ contentType, contentId })))` → `onClose()`
- タブ「外部URL」: 既存 `BookmarkPlugin` の OGP 取得 + `$createBookmarkNode` 挿入ロジックを移植
  （`BookmarkPlugin` の内部関数 `fetchOgpPreview` を再利用 or 同等実装）

- [ ] **Step 1: ダイアログを実装**（コードは BookmarkPlugin + IconPickerDialog のパターンに準拠。
      検索は `useTransition` + `fetchAdminJson`、`React Compiler` 前提で `useCallback` 不要）
- [ ] **Step 2: type-check**
      Run: `bun run type-check`
      Expected: exit 0
- [ ] **Step 3: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/LinkCardPlugin.tsx"
git commit -m "feat(lexical): LinkCardPlugin（内部ピッカー + 外部URL の2タブ）を追加"
```

### Task 10: dialog-registry / insert-items 統合（bookmark → linkCard）

**Files:**

- Modify: `.../editor/lexical/plugins/index.ts`（`LinkCardPlugin` export 追加）
- Modify: `.../editor/lexical/config/dialog-registry.ts`（`linkCard` 追加 / `bookmark` を削除）
- Modify: `.../editor/lexical/config/insert-items/embed.ts`（`bookmark` item を `linkCard` に置換）

- [ ] **Step 1: dialog-registry を更新**
  - `REGISTRY_DIALOG_IDS` の `"bookmark"` を `"linkCard"` に置換
  - `DIALOG_REGISTRY` の `{ dialogId: "bookmark", component: BookmarkPlugin }` を
    `{ dialogId: "linkCard", component: LinkCardPlugin }` に置換
  - import を `LinkCardPlugin` に変更（`BookmarkPlugin` は registry から外すが、`LinkCardPlugin` が内部 import するため plugins barrel には残す）

- [ ] **Step 2: insert-items/embed.ts を更新**
      `bookmark` エントリを以下に置換:

```ts
{
  id: "linkCard",
  type: "dialog",
  label: "リンクカード",
  icon: IconLink,
  keywords: ["link", "card", "bookmark", "リンク", "カード", "internal", "external", "ogp", "記事", "関連"],
  category: "widget",
  showInToolbar: true,
  showInPicker: true,
  dialogId: "linkCard",
},
```

（`IconLink` を `@tabler/icons-react` から import。旧 `IconExternalLink` import が未使用化したら削除）

- [ ] **Step 3: validate**
      Run: `bun run validate`
      Expected: exit 0（`DialogId` 型は dialog-registry から自動導出されるため `linkCard` が型安全に伝播）

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/index.ts" \
  "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/dialog-registry.ts" \
  "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/insert-items/embed.ts"
git commit -m "feat(lexical): 挿入メニューを統一リンクカードに統合（bookmark 項目を置換）"
```

### Task 11: Phase 2 検証 + PR

- [ ] **Step 1:** `bun run validate && bun run build`（exit 0）
- [ ] **Step 2:** `bun test __tests__/integration/api/link-cards-search.test.ts`（PASS）
- [ ] **Step 3:** push + `gh pr create --base main` + `gh pr merge --auto --squash --delete-branch`

---

## Phase 3: 公開描画時の参照解決

> Phase 2 merge 後に `git checkout main && git pull --ff-only && git checkout -b feat/lexical-link-card-resolve`。

### Task 12: id バッチ解決クエリの失敗テスト

**Files:**

- Test: `__tests__/unit/domain/link-cards/resolve-queries.test.ts`

解決結果の正規化型（実装と共有）:

```ts
export type ResolvedLinkCard = {
  contentType: LinkCardContentType;
  contentId: string;
  title: string;
  excerpt: string | null;
  thumbnailUrl: string | null;
  href: string;
};
```

- [ ] **Step 1: 失敗テスト**（非公開 id は結果から除外されることを検証。fixture は seed 済データ or mock）

```ts
import { describe, expect, test } from "bun:test";
import { resolveLinkCardsByType } from "@/shared/domain/link-cards/resolve-queries";

describe("resolveLinkCardsByType", () => {
  test("存在しない id は結果に含まれない", async () => {
    const map = await resolveLinkCardsByType("post", ["__nonexistent__"]);
    expect(map.has("__nonexistent__")).toBe(false);
  });

  test("空 id 配列で空 Map を返す", async () => {
    const map = await resolveLinkCardsByType("post", []);
    expect(map.size).toBe(0);
  });
});
```

- [ ] **Step 2: 失敗を確認**
      Run: `bun test __tests__/unit/domain/link-cards/resolve-queries.test.ts`
      Expected: FAIL（未定義）

### Task 13: id バッチ解決クエリを実装

**Files:**

- Create: `src/shared/domain/link-cards/resolve-queries.ts`

各種別の公開 URL helper を使う（posts は `buildPostCanonicalPath`、news/space/event は
各 routing helper。無ければ `/news/<slug>` 等のリテラル）。公開フィルタは search-queries と同条件。

- [ ] **Step 1: 実装**（`'use cache'` + cacheTag、id バッチ → `Map<contentId, ResolvedLinkCard>`）

```ts
import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { PostStatus } from "@generated/prisma/enums";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import { buildPostCanonicalPath } from "@/shared/domain/posts/routing";
import type { LinkCardContentType } from "@/admin/components/editor/lexical/config/link-card-types";

export type ResolvedLinkCard = {
  contentType: LinkCardContentType;
  contentId: string;
  title: string;
  excerpt: string | null;
  thumbnailUrl: string | null;
  href: string;
};

export async function resolveLinkCardsByType(
  contentType: LinkCardContentType,
  ids: readonly string[],
): Promise<Map<string, ResolvedLinkCard>> {
  if (ids.length === 0) return new Map();
  const uniqueIds = Array.from(new Set(ids));

  switch (contentType) {
    case "post":
      return resolvePostCards(uniqueIds);
    // news / space / event は同形で実装
    default:
      return new Map();
  }
}

async function resolvePostCards(
  ids: string[],
): Promise<Map<string, ResolvedLinkCard>> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.POSTS);

  const rows = await prisma.post.findMany({
    where: { id: { in: ids }, status: PostStatus.PUBLISHED },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      thumbnailUrl: true,
    },
  });
  const map = new Map<string, ResolvedLinkCard>();
  for (const r of rows) {
    map.set(r.id, {
      contentType: "post",
      contentId: r.id,
      title: r.title,
      excerpt: r.excerpt ?? null,
      thumbnailUrl: r.thumbnailUrl ?? null,
      href: buildPostCanonicalPath(r.slug),
    });
  }
  return map;
}
```

> 実装者は news/space/event の `resolve*Cards` を埋める（公開フィルタ + 正しい URL helper + サムネ）。
> `buildPostCanonicalPath` は permalink 設定依存のため `'use cache'` 内で settings 取得が必要なら
> `posts/routing.ts` の実シグネチャを確認（引数が slug のみか settings 同梱かで分岐）。

- [ ] **Step 2: テスト PASS 確認**
      Run: `bun test __tests__/unit/domain/link-cards/resolve-queries.test.ts`
      Expected: PASS
- [ ] **Step 3: Commit**

```bash
git add src/shared/domain/link-cards/resolve-queries.ts \
  __tests__/unit/domain/link-cards/resolve-queries.test.ts
git commit -m "feat(link-cards): 内部リンクカードの id バッチ解決クエリを追加"
```

### Task 14: resolveInternalLinkCards（HTML 後処理）の失敗テスト

**Files:**

- Test: `__tests__/unit/lib/lexical/resolve-internal-link-cards.test.ts`

- [ ] **Step 1: 失敗テスト**

```ts
import { describe, expect, test } from "bun:test";
import { resolveInternalLinkCards } from "@/shared/lib/lexical/resolve-internal-link-cards";

describe("resolveInternalLinkCards", () => {
  test("プレースホルダーが無い HTML はそのまま返す", async () => {
    const html = "<p>hello</p>";
    expect(await resolveInternalLinkCards(html)).toBe(html);
  });

  test("解決できないプレースホルダーは除去される", async () => {
    const html =
      '<p>a</p><a data-internal-link-card="true" data-content-type="post" data-content-id="__nope__" href="#"></a><p>b</p>';
    const out = await resolveInternalLinkCards(html);
    expect(out).not.toContain("data-internal-link-card");
    expect(out).toContain("<p>a</p>");
    expect(out).toContain("<p>b</p>");
  });
});
```

- [ ] **Step 2: 失敗を確認**
      Run: `bun test __tests__/unit/lib/lexical/resolve-internal-link-cards.test.ts`
      Expected: FAIL

### Task 15: resolveInternalLinkCards を実装

**Files:**

- Create: `src/shared/lib/lexical/resolve-internal-link-cards.ts`

HTML パースは `@/shared/lib/html/extract-headings`（`extractHeadingsFromHtml`）と同じパーサー方式に揃える
（実装者は extract-headings の内部実装を確認し、同じ HTML パース手段で `a[data-internal-link-card]` を抽出）。

- [ ] **Step 1: 実装**（① 抽出 → ② 種別ごとに集約 → ③ `resolveLinkCardsByType` でバッチ解決 →
      ④ プレースホルダーを `renderLinkCardHtml(resolved)` で差し替え、未解決は除去。
      `renderLinkCardHtml` は a/img/div/span/p のみで構築し DOMPurify 通過、内部 href のため `rel` なし）

```ts
import "server-only";

import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import {
  isLinkCardContentType,
  type LinkCardContentType,
} from "@/admin/components/editor/lexical/config/link-card-types";
import {
  resolveLinkCardsByType,
  type ResolvedLinkCard,
} from "@/shared/domain/link-cards/resolve-queries";

// 抽出: extract-headings と同じパーサー方式で a[data-internal-link-card] を列挙
// （実装者が extract-headings の手段に合わせる）

export async function resolveInternalLinkCards(html: string): Promise<string> {
  if (!html.includes("data-internal-link-card")) return html;
  try {
    // 1. 抽出 → { rawMatch, contentType, contentId }[]
    // 2. byType: Map<LinkCardContentType, string[]>
    // 3. resolved: Map<type, Map<id, ResolvedLinkCard>>（各 resolveLinkCardsByType を Promise.all）
    // 4. rawMatch を差し替え（resolved 有→カード HTML / 無→空文字で除去）
    return transformedHtml;
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: "resolveInternalLinkCards" },
    });
    // 解決失敗時はプレースホルダーを除去して本文描画は継続
    return html.replace(/<a[^>]*data-internal-link-card[^>]*>\s*<\/a>/g, "");
  }
}

function renderLinkCardHtml(card: ResolvedLinkCard): string {
  // a/img/div/span/p のみ。内部リンクのため rel なし。XSS 安全のため title/excerpt は escape。
  // ...
}
```

> 実装者は抽出と差し替えを `extractHeadingsFromHtml` と同じ HTML パース手段で実装する
> （正規表現直書きは catch fallback のみ許容、本処理はパーサー経由）。`renderLinkCardHtml` の
> title / excerpt は HTML escape 必須。スタイルは data-attribute セレクタに委譲（class は付けない）。

- [ ] **Step 2: テスト PASS 確認**
      Run: `bun test __tests__/unit/lib/lexical/resolve-internal-link-cards.test.ts`
      Expected: PASS
- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/lexical/resolve-internal-link-cards.ts \
  __tests__/unit/lib/lexical/resolve-internal-link-cards.test.ts
git commit -m "feat(lexical): 公開描画用 resolveInternalLinkCards HTML 後処理を追加"
```

### Task 16: 公開詳細ページへ配線

**Files:**

- Modify: `src/app/(public)/posts/_components/post-detail-page-content.tsx`
- Modify: `src/app/(public)/news/_components/news-detail-page-content.tsx`
- Modify: `src/app/(public)/events/[slug]/page.tsx`
- Modify: `src/app/(public)/spaces/[slug]/_components/space-info.tsx`

各箇所で `<SanitizedHtml html={X.contentHtml} />` の直前で解決:

```tsx
const resolvedHtml = await resolveInternalLinkCards(post.contentHtml);
// ...
<SanitizedHtml html={resolvedHtml} />;
```

注: `extractHeadingsFromHtml(post.contentHtml)` は raw のまま維持（プレースホルダーは heading 非該当）。
呼び出しコンポーネントが async Server Component であることを確認（posts/news は既に async）。

- [ ] **Step 1: 4 箇所を配線**
- [ ] **Step 2: validate**
      Run: `bun run type-check`
      Expected: exit 0
- [ ] **Step 3: Commit**

```bash
git add src/app/\(public\)/posts/_components/post-detail-page-content.tsx \
  src/app/\(public\)/news/_components/news-detail-page-content.tsx \
  "src/app/(public)/events/[slug]/page.tsx" \
  "src/app/(public)/spaces/[slug]/_components/space-info.tsx"
git commit -m "feat(public): 公開詳細で内部リンクカードを描画時解決する"
```

### Task 17: 公開カード CSS

**Files:**

- Modify: `src/shared/styles/lexical-content.css`

- [ ] **Step 1: `[data-internal-link-card]` セレクタを追加**（横型カード: border / radius / hover、
      内部 `[data-card-thumb]` / `[data-card-title]` / `[data-card-excerpt]` のレイアウト。
      `renderLinkCardHtml` が出力する data-attribute 構造と一致させる）
- [ ] **Step 2: Commit**

```bash
git add src/shared/styles/lexical-content.css
git commit -m "style(lexical): 内部リンクカードの公開スタイルを追加"
```

### Task 18: Phase 3 検証 + PR

- [ ] **Step 1:** `bun run validate && bun run build`（exit 0）
- [ ] **Step 2:** `bun run test:unit`（関連 PASS）
- [ ] **Step 3:** push + `gh pr create --base main` + `gh pr merge --auto --squash --delete-branch`

---

## Self-Review 結果

- **Spec coverage:** 内部参照ノード（Task 1-4）/ 統一ダイアログ 2 タブ（Task 9-10）/ 検索 API（Task 7-8）/
  公開描画解決（Task 12-16）/ CSS（Task 17）/ bookmark 統合（Task 10）— spec の全ゴールに対応 task あり。
  非ゴール（pages/faq/terms 参照・縦横スタイル・inline mention）は未着手で正しい。
- **型整合:** `LinkCardContentType` / `LinkCardSearchItem` / `ResolvedLinkCard` を各 Task で一貫使用。
  `$createInternalLinkCardNode({ contentType, contentId })` のシグネチャは Task 3/9/resolve で一致。
- **既知の埋め込み箇所（実装者が必ず埋める）:** search-queries / resolve-queries の news/space/event ブランチ、
  `LinkCardPlugin` の UI、`renderLinkCardHtml`、CSS の data-attribute 構造、`resolveInternalLinkCards` の抽出本体。
  各々に参照実装パスを明記済み（plan の型 contract は削減禁止）。
- **terms 配線:** spec §3.3 で「許可するなら」と保留。v1 は posts/news/events/spaces の 4 箇所のみ配線（terms 除外）。
