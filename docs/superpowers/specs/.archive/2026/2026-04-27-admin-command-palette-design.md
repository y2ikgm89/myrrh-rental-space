> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.

# Admin Command Palette — Design Spec

> 2026-04-27 / P16 / 想定 ADR 番号: 0024

## 1. 目的

管理画面全域に Cmd+K / Ctrl+K で起動するグローバル Command Palette を導入する。
業界標準（GitHub / Linear / Notion / Vercel Dashboard）の Cmd+K UX を採用し、以下を 1 つのダイアログから解決する:

- 全 admin ルート（23 件）への即時ナビゲーション
- 横断リソース検索（11 resource: spaces / customers / reservations / posts / news / pages / events / inquiries / faq / coupons / locations）
- クイックアクション（新規作成系: 新規スペース / 新規予約 / 新規お知らせ等）
- 直近編集リソース（Recents）の即時呼び出し

スコープ外（後続 phase 検討）:

- 商品・在庫等の数量検索
- フリーテキスト → AI クエリ理解
- ホットキー設定の UI

## 2. ハードルール

- 既存 cmdk primitive（`@/admin/components/ui/command.tsx`）を流用、新規 Dialog primitive を作らない
- 既存の pages エディタ "/" コマンド（`SlashCommandPlugin`）と独立、相互依存しない
- すべての検索結果に **role-based filtering** を適用（VIEWER は read のみ、EDITOR は assigned page のみ）
- Server Action は `executeAdminMutationResult` ではなく **薄い `searchAdminResources` 単一 Server Action** + 内部 `checkAdminAuth` + 各 domain query で構成（mutation ではないため）
- 配置: TopBar に searchTrigger 第 4 slot を追加。branding / userBadge を移動しない
- a11y: WCAG 2.5.5 Enhanced（44px hit area）/ Radix Dialog focus trap / cmdk のキーボードナビゲーション準拠

## 3. アーキテクチャ — Option C (Hybrid)

### 3.1 採用根拠

3 案を検討:

| Option | 概要                                                                                                | 採否                                                        |
| ------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| A      | All-Server: 入力毎に全 resource を Server Action 横断 query                                         | × — typing 中の RTT 200-400ms × 11 resource で UX 低下      |
| B      | Indexed-Client: 全 list を layout fetch + cmdk filter                                               | × — bundle 肥大、機微情報全 client 露出（顧客名・予約詳細） |
| **C**  | **Hybrid**: Recents/Nav/QuickActions = Server fetch → Client cmdk、free-text = Server Action search | **採用**                                                    |

### 3.2 Section 構成（cmdk 内）

```
[Search Input "..."]
─────────────────────────────────────
Suggested （input 空のとき）
  Recents (max 8)            ← layout fetch
  Quick Actions (max 6)      ← static
  Navigation (filtered)      ← static + role filter
─────────────────────────────────────
Search Results （input 1 文字以上）
  Spaces (max 5)             ← Server Action
  Reservations (max 5)
  Customers (max 5)
  Posts (max 5)
  News (max 5)
  Pages (max 5)
  Events (max 5)
  Inquiries (max 5)
  FAQ Items (max 5)
  Coupons (max 5)
  Locations (max 5)
```

各 resource max 5 件は Linear 公式値準拠（横断時の認知負荷 60+ 件抑制）。
全件閲覧したい場合は resource group footer から `/admin/<resource>?q=<query>` に遷移するリンクを表示。

### 3.3 データフロー

**Recents (Server-fetched)**:

- layout で `getRecentAuditedResources(limit: 8)` を fetch
- `AdminAuditLog` テーブルから直近 8 件の admin 自身の操作（actor = current user）を `resource:resourceId` でユニーク化
- 各エントリに resource type ごとの label (e.g. "Space: 渋谷スペース") + href を付与
- Client へ `Serialized<RecentItem[]>` で渡す

**Static Nav / Quick Actions**:

- `@/admin/lib/admin-resources` の `RESOURCE_LABELS` から派生
- 23 nav items を `_shared/lib/command-palette/nav-items.ts` に SSoT 化
- `getInvitableRoles()` 同等の role filter で VIEWER に show only read paths

**Search Results (Server Action)**:

- 単一 Server Action `searchAdminResources(query: string)` が 11 resource を `Promise.allSettled` で並列 query
- 内部で `checkAdminAuth()` + 各 query 関数（`searchSpaces` / `searchCustomers` 等）を呼ぶ
- 結果は `Serialized<SearchResults>` で Client へ
- debounced 200ms で連打抑制（Linear 公式値）

### 3.4 既存 cmdk 関数の再利用

| Resource                                                                                      | 既存 query                                               | 必要な拡張                                                                                                      |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Customers                                                                                     | `searchCustomers` (`shared/domain/customers/queries.ts`) | 既存利用                                                                                                        |
| Spaces / Reservations / Posts / News / Pages / Events / Inquiries / FAQ / Coupons / Locations | 各 `list*` query                                         | `q` filter を持つ既存 query を流用、なければ wrapper 関数を `_shared/lib/command-palette/queries.ts` に薄く実装 |

**新規 query は実装しない**。既存 admin-queries の `q` パラメータを流用する。
存在しない resource（要検証時）は Bundle B で個別調査し、不足分のみ thin wrapper を追加。

## 4. UI / 配置

### 4.1 TopBar Trigger

`TopBar.tsx` の slot props に `searchTrigger` を追加（第 4 slot）。配置は **branding 右隣**:

```tsx
// 左: ハンバーガー + ブランディング + Search Trigger
<div className="flex items-center gap-3">
  {showMobileMenu && <HamburgerButton />}
  <Link href="/admin">{branding}</Link>
  {searchTrigger} {/* ← 新規 */}
</div>
```

`SearchTriggerButton` の見た目（Vercel / Linear 同等）:

- desktop (`sm:` 以上): `<Button variant="outline" className="h-9 w-64">` 内に IconSearch + "検索..." + `<kbd>⌘K</kbd>` （`⌘` は macOS 検出時、それ以外は `Ctrl`）
- mobile: `<Button variant="ghost" size="icon" className="h-11 w-11">` の icon-only（44px hit area）

### 4.2 Dialog Layout

- `CommandDialog` (Radix Dialog 経由 = focus trap / Escape / scroll lock 自動)
- `DialogTitle` `sr-only`「コマンドパレット」
- `CommandInput` placeholder「コマンドや検索キーワードを入力...」
- `CommandList` max-height `var(--lightbox-max-height)` （既存 token 流用、`@theme` に存在）
- 結果アイテム高さ 44px（WCAG 2.5.5）

### 4.3 グローバルキーボード

- `(dashboard)/layout.tsx` 配下に Client `<CommandPaletteProvider>` 配置
- `useEffect` で `keydown` listener: `(meta || ctrl) + k` → `setOpen(true)` + `event.preventDefault()`
- input focus 中も発火（GitHub / Linear 仕様）

## 5. 認証・権限

### 5.1 Server Action

```ts
// src/app/(admin)/admin/(dashboard)/_shared/actions/command-palette/search.ts
"use server";

export async function searchAdminResources(
  query: string,
): Promise<MutationResult<SearchResults>> {
  const auth = await checkAdminAuth();
  if (!auth.success) return auth.error;

  const trimmed = query.trim();
  if (trimmed.length === 0) return createSuccess({ groups: [] });

  // role に応じて検索対象を絞る
  const allowedResources = getSearchableResources(auth.user.role);

  const results = await Promise.allSettled(
    allowedResources.map((resource) => searchByResource(resource, trimmed)),
  );

  return createSuccess({ groups: collectFulfilled(results) });
}
```

`searchAdminResources` は read-only のため `executeAdminMutationResult` ではなく `MutationResult<T>` 直接返却。レート制限は `formSubmitRateLimiter` で 1 分間 30 query / IP（debounce 200ms 換算で連打しても余裕）。

### 5.2 EDITOR の userPageAssignment

- `getSearchablePages(user)` で EDITOR の場合は `userPageAssignment` JOIN フィルタを適用
- 他 resource は EDITOR にもフル read 権限あり（既存 ROLE_PERMISSIONS に整合）

### 5.3 VIEWER の create アクション非表示

- Quick Actions Section は `canCreate(role, resource)` でフィルタ
- VIEWER は Quick Actions Section 自体を非表示

## 6. キャッシュ戦略

- Recents は `'use cache'` + `cacheTag(getCacheTag.auditLogs.recent(userId))` （既存 audit cache 流用、なければ追加）
- Search results は **キャッシュしない**（DB 直接 query、Linear / Vercel 同様）— typing 中の即時性優先
- Nav / Quick Actions は static 定数のため非対象

## 7. a11y

- `<CommandDialog>` 内 `<DialogTitle className="sr-only">コマンドパレット</DialogTitle>` 必須（WCAG 4.1.2 / `admin-ui/dialogs.md`）
- 結果アイテム `aria-label` は意味的識別子（"スペース: 渋谷店" / "予約: 2026-05-01 山田太郎" 等）
- `kbd` 要素で shortcut 表示（CSS は既存 `@theme` token）
- `prefers-reduced-motion` は cmdk Dialog 既定で対応
- screen reader: 結果件数を `aria-live="polite"` で通知（cmdk `<Command.Empty>` + `<Command.List>` 既定）

## 8. 既存 cmdk 実装との関係

| 項目           | 既存（pages エディタ）           | 新規（Command Palette）                    |
| -------------- | -------------------------------- | ------------------------------------------ |
| 用途           | Lexical エディタ内のブロック挿入 | 管理画面全域ナビ + 検索                    |
| 起動           | エディタ内で "/" 入力            | Cmd+K / Ctrl+K                             |
| Component      | `SlashCommandPlugin`             | `CommandPalette` (新規)                    |
| 共有 primitive | `command.tsx`                    | `command.tsx`                              |
| state          | Lexical editor state             | React useState in `CommandPaletteProvider` |
| 検索範囲       | エディタ blocks のみ             | 全 admin resource                          |

責務完全分離。primitive のみ共通。

## 9. ADR Draft (0024)

```markdown
# 0024 — Admin Command Palette with Hybrid Server-Action Search

Status: Accepted (2026-04-27)
Supersedes: なし

## Context

管理画面の resource 数が 11、admin route 数が 23 を超え、サイドバー走査での到達コストが上昇。
Linear / GitHub / Notion 等で標準化された Cmd+K UX に揃えることで、admin の作業効率を改善する必要が生じた。

## Decision

Hybrid 構成で実装する:

1. **Recents / Nav / Quick Actions** はサーバ side で計算（layout で fetch）し、static state として cmdk で fuzzy filter
2. **Free-text search** は単一 Server Action `searchAdminResources(query)` が 11 resource を `Promise.allSettled` で並列検索
3. UI primitive は既存 `_shared/components/ui/command.tsx` を流用、新規作成しない
4. 既存 Lexical エディタの "/" コマンド（`SlashCommandPlugin`）とは責務分離し、相互依存させない

## Alternatives Considered

- **All-Server Search**: typing 中の RTT が UX を悪化させるため不採用
- **Indexed-Client Search**: bundle サイズと機微情報露出の問題で不採用

## Consequences

### Positive

- typing 開始から first paint まで Linear / GitHub と同等の体感速度（1-2 frame）
- role-based filtering を server で完結、client bundle に admin 全データを含めない
- 既存 cmdk primitive 流用で新規 dependency ゼロ

### Negative

- 11 resource 並列 query は DB 負荷が増える（後続: index 追加、Cloud SQL 監視）
- Server Action のレート制限を別 limiter にする必要あり（read-only だが頻繁）

### Operational

- 新規 ADR、既存 ADR の supersede なし
- 監査ログには影響なし（read-only）
```

## 10. 実装ステップ（Bundle 概略）

> Plan 詳細は `docs/superpowers/plans/2026-04-27-admin-command-palette.md` で展開。

### Bundle A — UI scaffold（3-4 commit）

1. `_shared/components/command-palette/CommandPalette.tsx` （Client、cmdk primitive 利用）
2. `_shared/components/command-palette/SearchTriggerButton.tsx` （TopBar 用 trigger）
3. `_shared/components/command-palette/CommandPaletteProvider.tsx` （keyboard listener + open state）
4. `TopBar.tsx` props 拡張 + `(dashboard)/layout.tsx` で provider と searchTrigger 配線

### Bundle B — Search Server Action + Domain queries 拡張（4-5 commit）

1. `_shared/lib/command-palette/nav-items.ts` （23 nav items + role filter SSoT）
2. `_shared/lib/command-palette/quick-actions.ts` （6-8 quick actions SSoT）
3. `_shared/actions/command-palette/search.ts` Server Action （Promise.allSettled / 11 resource）
4. `_shared/lib/command-palette/queries.ts` （domain query thin wrapper、不足分のみ）
5. `getRecentAuditedResources` query を `shared/domain/audit/queries.ts` に追加

### Bundle C — Recents wiring + ADR + テスト（3-4 commit）

1. layout で Recents fetch + provider に props 渡し
2. ADR 0024 を `docs/architecture/decisions/` に commit + index 追加
3. unit test: `searchByResource` per-resource branch（11 resource）
4. integration test: `searchAdminResources` Server Action（auth + role filter + Promise.allSettled）

### 検証ゲート（CI / pre-merge）

- `bun run validate && bun run build`
- `bun test __tests__/unit/lib/command-palette` + `bun test __tests__/integration/actions/admin/command-palette.test.ts`
- 手動: 主要 4 resource で日本語 / 英語 / 数値 query で結果確認、Cmd+K / Ctrl+K の OS 別表示確認

## 11. リスク / Out of scope

- **DB 負荷**: 11 resource 並列 query は production で初期 100ms+ になる可能性。Bundle C で Cloud SQL slow query log 監視ガイドを ADR appendix に追記
- **モバイル UX**: Cmd+K 発火不可だが trigger button が常に visible なので影響なし
- **検索ハイライト**: Phase 2（後続）— 現 phase は plain text 表示のみ

## 12. 参考

- [Linear Command Menu](https://linear.app/changelog/2024-01-cmd-k)
- [Vercel Dashboard cmdk](https://vercel.com)
- [GitHub Command Palette docs](https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts)
- `@/admin/components/ui/command.tsx`（既存 primitive）
- ADR 0019（executeAdminMutationResult ordering）/ 0022（CheckboxCell 44px）
