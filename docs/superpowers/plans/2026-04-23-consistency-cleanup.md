# 一貫性監査 + Clean Break Cleanup

**Date**: 2026-04-23
**Scope**: プロジェクト全体の一貫性監査結果に基づくクリーン実装（後方互換なし）

## 監査結果サマリ

| 監査                    | 結果      | 詳細                                       |
| ----------------------- | --------- | ------------------------------------------ |
| ssot-audit              | CLEAN     | 違反ゼロ（過去 9 件の実例は全て解消済み）  |
| adr-drift-audit         | CLEAN     | ADR 0001-0018 全て設定ファイルと整合       |
| integration-audit       | CLEAN     | 境界違反ゼロ、Customer 紐づけ網羅          |
| memory-staleness-audit  | 1 件 FIX  | `.serena/memories/admin-page-editing-*.md` |
| cache-audit             | 3 件 FIX  | CRITICAL 1 + HIGH 2                        |
| seed-audit              | 10 件 FIX | CRITICAL 3 + HIGH 7                        |
| context7 official drift | 6 件 FIX  | CRITICAL 1 + HIGH 2 + LOW 3                |

**実装が必要な総件数: 20 件（4 Phase に分割）**

---

## Phase A — Cache invalidation fix（CRITICAL）

### A.1 `updateReservationNotes` に calendar() タグ追加

**ファイル**: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations.ts:230-233`

```diff
afterSuccess: () => {
  updateTag(CACHE_TAGS.RESERVATIONS);
  updateTag(getCacheTag.reservations.detail(id));
+  updateTag(getCacheTag.reservations.calendar());
},
```

**理由**: notes 変更はカレンダー表示に影響。gotchas.md の「3点セット必須」ルールに従う。

### A.2 `createCheckoutSession` / `refundReservationPayment` のタグ補完

**ファイル**: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/payment.ts`

`createCheckoutSession` (L20-23):

```diff
afterSuccess: () => {
  updateTag(CACHE_TAGS.RESERVATIONS);
  updateTag(getCacheTag.reservations.detail(reservationId));
+  updateTag(getCacheTag.reservations.calendar());
},
```

`refundReservationPayment` (L38-43):

```diff
afterSuccess: () => {
  updateTag(CACHE_TAGS.RESERVATIONS);
  updateTag(getCacheTag.reservations.detail(reservationId));
+  updateTag(getCacheTag.reservations.calendar());
  updateTag(CACHE_TAGS.CUSTOMERS);
+  // customerId is required for customers.detail(customerId) invalidation
+  // → execute 戻り値から customerId を取得する refactor が必要
},
```

**検討**: `invalidateReservationCaches` helper（`@/shared/lib/cache/reservation-cache.ts`）を使えば 3 点セット + CUSTOMERS が自動適用される。`payment.ts` の 2 アクションもこれに統一する。

### A.3 完了条件

- `grep -n "updateTag" src/app/(admin)/**/reservation/**/*.ts` で全アクションが `invalidateReservationCaches` helper 経由または 3 点セット完備
- `bun run validate` exit 0

---

## Phase B — Seed Lexical JSON + enum 網羅（CRITICAL + HIGH）

### B.1 Lexical JSON 同時保存を Post/News/Section seed に追加

**ファイル**: `prisma/seed.ts`

**対象**:

1. `seedBlog()` L2411-2515（Post 5 件）
2. `seedNews()` L1751-1978（News 15 件）
3. `seedSystemPageSections()` L2786, 2829（Section）

**パターン**（参照実装: `seedTerms()` L2115-2152）:

```typescript
import {
  buildParagraphEditorStateJson,
  buildParagraphHtml,
} from "@/shared/lib/lexical/description-defaults";

// Post/News seed
await tx.post.create({
  data: {
    // ...
    contentHtml: buildParagraphHtml(plainText),
    contentJson: JSON.parse(buildParagraphEditorStateJson(plainText)),
  },
});
```

### B.2 Prisma enum 欠落値を seed に追加

| Enum          | 欠落値                                     | 対象 seed 関数       |
| ------------- | ------------------------------------------ | -------------------- |
| CustomerType  | `PERSONAL`                                 | `seedCustomers()`    |
| PostStatus    | `ARCHIVED`                                 | `seedBlog()`         |
| PaymentStatus | `PENDING` / `PAID` / `REFUNDED` / `FAILED` | `seedReservations()` |
| MediaUsage    | `EVENT`                                    | `seedMedia()`        |

### B.3 欠落モデル seed 関数を追加

6 モデル分の seed 関数を新規作成 + `seedAll` / `seedDemo` 登録:

1. `seedAuditLog()` — AuditAction 全 12 値をカバー
2. `seedEditorComments()` — EditorCommentStatus 3 値
3. `seedInstagramPosts()` — Instagram フィード空状態回避
4. `seedLoginAttempts()` — レート制限テスト用
5. `seedTermsAgreements()` — 予約時利用規約同意
6. `seedPostVersions()` / `seedNewsVersions()` — 記事バージョン管理 UI 検証

### B.4 完了条件

- `bun prisma/seed.ts --demo && bun prisma/seed.ts --demo` 2 回連続実行で件数不変（idempotency）
- 全 Prisma enum 値が seed データに存在（enums/helpers.ts の label と seed レコード対応を手動確認）

---

## Phase C — Official docs drift correction（HIGH + LOW）

### C.1 `.claude/rules/server-actions.md` に `CACHE_LIFE.MAX` 追記 + `revalidateTag` 第2引数オブジェクト形式

**ファイル**: `.claude/rules/server-actions.md` §revalidateTag

- `CACHE_LIFE.MAX = 'max' as const` を `constants/cache.ts` に追加
- cron / webhook 等の stale-while-revalidate ユースケースで `revalidateTag(tag, CACHE_LIFE.MAX)` を推奨
- `{ expire: 0 }` オブジェクト形式（即時失効）の記述を追加

### C.2 `.claude/rules/react/gotchas.md` の `<Activity>` 記述を stable 化に合わせて書き換え

**ファイル**: `.claude/rules/react/gotchas.md:13-25`

- 「EXPERIMENTAL / unstable_Activity」→ 「React 19.2 で stable 化」に更新
- 採用条件付きで書き換え:
  - stable API だが `display: none` のため CSS transform / GSAP tween と非互換
  - navigation preload (BFCache 代替) ユースケース以外では visibility/opacity 継続推奨

### C.3 `.claude/rules/server-actions.md` §revalidatePath の優先順位表更新

`updateTag (SA) > revalidateTag(tag, 'max') (SA/RH, SWR) > revalidatePath (最終)` の 3 段に書き換え。

### C.4 `.claude/rules/zod-patterns.md` §Prisma Enum の `z.nativeEnum()` 記述修正

「Zod 4 では非推奨」→「プロジェクト規範として `z.enum()` に統一（nativeEnum 使用禁止）」に書き換え（公式 deprecation は未明記のため過剰主張を修正）。

### C.5 `.claude/rules/prisma-patterns.md` に §Prisma 7 CLI 節追加

削除フラグ 5 つ（`--to-schema-datamodel` / `--from-url` / `--to-url` / `--from-schema-datasource` / `--to-schema-datasource` / `--shadow-database-url`）と置換ルートを表形式で明記。

### C.6 `.claude/rules/zod-patterns.md` に §メタデータと registry 節追加

- `.meta()` shorthand と `z.registry<T>()` カスタム registry の 2 パターン
- `GlobalMeta` augmentation
- ADR 0018 と交互参照

### C.7 `.claude/rules/react/compiler.md` の `compilationMode` 記述修正

「`compilationMode: 'annotation'` による段階的採用時のみ使用」→「Next.js 16 react-compiler 統合は `compilationMode: 'infer'` 既定」に正確化。

---

## Phase D — Memory staleness fix（LOW）

### D.1 `.serena/memories/admin-page-editing-system.md` を Snapshot 化

ADR 0018 以降の field-registry 移行を反映していない 2026-04-10 時点の Serena memory に Snapshot ヘッダーを追加:

**ファイル**: `.serena/memories/admin-page-editing-system.md:1-5`

```diff
+> **Snapshot: 2026-04-10**
+> This memory describes the pre-ADR-0018 state (field-helpers.ts API). Since superseded by field-registry.ts migration. Preserved for historical reference.
+
 # Admin Page/Section Editing System — Complete Architecture

 **Date**: 2026-04-10
```

これで `memory-staleness-audit` skill の dated snapshot 判定で自動 skip され、次セッションでの stale 情報注入を防ぐ。

### D.2 Claude memory の 4 件は修正不要

`project_admin-pages-beginner-ux-complete.md` / `project_config-overhaul.md` / `project_overhaul-next-session-spec.md` / `project_section-arch-phase-b-handoff.md` の stale path 参照は全て「削除済み」の履歴記述で、skill の除外基準「Before/旧/削除済み コンテキスト」に該当 → 修正不要。

---

## 実行順序と commit 分割

各 Phase を 1 commit にまとめる（clean-break 原則、ADR 0015）:

1. **Commit 1 (Phase A)**: `fix(reservations): complete cache invalidation 3-set + CUSTOMERS.detail`
2. **Commit 2 (Phase B)**: `feat(seed): add missing enum values, Lexical JSON, and 6 model seeders`
3. **Commit 3 (Phase C)**: `docs(rules): sync with official framework docs (Next.js 16 / React 19.2 / Zod 4 / Prisma 7)`
4. **Commit 4 (Phase D)**: `docs(memory): snapshot-mark pre-ADR-0018 admin-page-editing-system memory`

各 commit 後に `bun run validate && bun run build` で検証。

---

## 検証

### Phase A 検証

```bash
grep -rnE "updateTag|revalidateTag" src/app/(admin)/**/reservation/**/*.ts | \
  grep -v "import"
```

全 reservation mutation が 3 点セット完備していることを手動確認。

### Phase B 検証

```bash
bun prisma/seed.ts --demo
bun prisma/seed.ts --demo  # 2 回目で件数不変（idempotency）
bun -e "...count each enum's records..."
```

### Phase C 検証

`.claude/rules/**/*.md` の変更が `mcp__context7__query-docs` で再取得した公式 docs と整合することを確認。

### Phase D 検証

```bash
bash -c '
scan_dir() { local root=$1 maxdepth=$2; ... }  # memory-staleness-audit skill のスクリプト
scan_dir "$HOME/.claude/projects/.../memory" 2
scan_dir ".serena/memories" 3
' | grep -v "Snapshot:"  # stale 参照が 0 件になることを確認
```

---

## 次セッション引継ぎ情報

- **Worktree**: 不要（main で直接実行可能、小規模変更）
- **並列化**: Phase A と Phase C は独立（A = 実装、C = docs）。parallel implementer でも可
- **Phase B は単独 implementer**: seed.ts の行数が多く context cost 高
- **Phase D は手動**: 1 ファイル 5 行追加のみ

## 関連

- ADR 0015 — Clean Break Refactor Discipline
- ADR 0017 — Section Style Cascade
- ADR 0018 — Field Registry and Group Hierarchy
- [CLAUDE.md §調査・監査](../../CLAUDE.md)
