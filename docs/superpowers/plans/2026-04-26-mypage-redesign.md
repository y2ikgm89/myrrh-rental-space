# P4: Mypage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** マイページ予約一覧の「アクティブ予約と過去予約が混在する」 dead UX を Tabs 分離で解消し、cancel 操作の「完了が静かすぎる」 dead UX を `?cancelled=ok` + alert で解消する。後方互換なしの clean-break。

**Architecture:** ① `mypage/page.tsx` で `ACTIVE_RESERVATION_STATUSES` を使い予約を `active` / `past` の 2 リストに分割し、Radix Tabs で切替（events の `events-view-switcher.tsx` パターン踏襲）② `cancel-button.tsx` の `router.push("/mypage")` に `?cancelled=ok` 付与し、`mypage/page.tsx` で受信して `role="status"` の完了 alert を表示（自動消失なし、ユーザーが認識するまで残す）。

**Out of scope:** mypage-nav バッジ化（未読数等の新規データソース実装が必要）、カード直接 CTA（reservation-card と detail page の密結合変更が必要、別 plan）、forgot-password ルート移動。

---

## Task 1: 予約 Tabs 分離（mypage/page.tsx）

**Files:**

- Modify: `src/app/(public)/mypage/page.tsx`

**Changes:**

- `reservationListItems` を `activeItems` / `pastItems` に分割（`ACTIVE_RESERVATION_STATUSES.includes(item.reservation.status)`）
- Radix Tabs primitive で 2 タブ表示:
  - 「これから（{N}）」 — active items
  - 「過去（{N}）」 — past items
- 各タブに件数 badge 付き
- 各タブが空でも他方は表示される（dead end 解消）
- 全 0 件の場合は従来の Empty state（または新規メッセージ）

**Implementation:**

- `@radix-ui/react-tabs` を使用（events ですでに採用パターン）
- TabsContent は `forceMount` + `data-[state=inactive]:hidden` で SC children 保持

---

## Task 2: cancel 完了アナウンス（cancel-button + mypage page）

**Files:**

- Modify: `src/app/(public)/mypage/reservations/[id]/_components/cancel-button.tsx`
- Modify: `src/app/(public)/mypage/page.tsx`

**Changes:**

- cancel-button: `router.push("/mypage")` → `router.push("/mypage?cancelled=ok")`
- mypage/page.tsx: `searchParams: Promise<SearchParams>` 追加、`cancelled === "ok"` 時に `role="status"` alert 表示（`bg-success/5 border-success/30`、文言「予約をキャンセルしました」）
- alert は dismiss 可能だが、URL クエリ消去は client 側で実装するか、または server で render once で OK（リロード後消える）

---

## Task 3: 最終検証

```bash
bun run validate; bun run build
git log --oneline | head -5
```
