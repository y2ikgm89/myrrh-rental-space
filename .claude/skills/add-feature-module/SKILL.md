---
name: add-feature-module
description: サイト機能モジュール (Feature Module) を新規追加する手順。src/shared/lib/features/registry.ts の FEATURE_MODULES_LIST tuple・メタデータ・Settings.featureModules JSON (fail-closed)・admin の /admin/settings/features UI・prisma/seed.ts・migration の同時更新契約と、公開ルートの requireFeatureEnabled 404 ガード、SectionRenderer / navigation / sitemap prune、cron 早期 return、requires 依存解決 (spaces OFF → reservation/reviews 自動 OFF) の全連動箇所を扱う。feature module / feature toggle / feature flag の ON/OFF 対象機能を追加・変更するときに使う。
---

# Feature Module の追加

## アーキテクチャ（前提 3 点）

- **registry はメタデータのみ**: `src/shared/lib/features/registry.ts` の `FEATURE_MODULES_LIST`
  (const tuple、現在 11 module — 実数は同 file の tuple length で確認) と `FEATURE_MODULES` Record。
  `defaultEnabled` は持たない。
- **ON/OFF 値の SSoT は DB**: `Settings.featureModules` JSONB column（singleton 行、DB default `'{}'`）。
  読み出しは `src/shared/domain/settings/queries/features.ts` の `getFeatureModulesSettings`
  （`'use cache'` + `CACHE_TAGS.FEATURE_MODULES`）→ `parseFeatureModules`
  (`src/shared/lib/json-validators.ts`) で防御的パース。
- **fail-closed**: key 欠損・不正値・DB fetch 失敗 → その module は **OFF**。
  seed / migration が全 module の key を explicit に埋めることで運用上 ON になる。

解決ロジックは `src/shared/lib/features/check.ts`:
`getEnabledFeatures`（`stored[id] === true` のみ ON → `requires` を fixed-point で伝播 OFF）、
`isFeatureEnabled` / `requireFeatureEnabled`（OFF なら `notFound()`）、
`getFeatureFilterContext`（disabled の routes / pageSlugs / sectionTypes / templates / cronPaths を集約）、
`isUrlDisabled`（exact match または `` `${route}/` `` prefix。`/spacesfoo` は誤 hit しない）。

## 同時更新契約（registry.ts 冒頭 doc comment に明記）

新規 module 追加は以下を**同一 PR で**行う。1–2 と 5 の一部は TypeScript の
`Record<FeatureModule, boolean>` 網羅性で型エラーとして強制されるが、
**schema と migration は型で強制されない**ので checklist で潰す。

- [ ] 1. `FEATURE_MODULES_LIST` tuple に id 追加
- [ ] 2. `FEATURE_MODULES` Record にメタデータ追加
- [ ] 3. `buildInitialFeatureModules`（registry.ts 内）に key 追加 → seed はこれ経由で自動反映
- [ ] 4. 既存 install 向け migration（新 module を ON にしたい場合のみ。下記 Step 3）
- [ ] 5. 管理 UI: `featureModulesSettingsSchema` + `/admin/settings/features` の `initialValues`
- [ ] 6. 連動配線（404 ガード / section / cron。Step 4–6）
- [ ] 7. テスト更新（Step 7）

## 手順

### Step 0: 設計判断

`FeatureModuleDef` の各フィールドに何を書くかを先に決める:

| フィールド                | 実際の consumer（検証済み）                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `requires`                | `getEnabledFeatures` の依存解決（依存先 OFF → 自身も OFF。DB 値は書き換えず read 側で解決）                                                  |
| `publicRoutes`            | navigation prune (`src/shared/domain/navigation/queries.ts`) + sitemap の静的ページ filter (`src/app/sitemap.ts`) + drift gate テスト        |
| `pageSlugs`               | sitemap のカスタムページ filter（`disabledPageSlugs`）。**SYSTEM_PAGE_SLUGS に実在必須**（テスト強制）                                       |
| `sectionTypes`            | `SectionRenderer` の早期 null（`(public)/_shared/components/sections/section-renderer.tsx`）                                                 |
| `templates` / `cronPaths` | 現状 **runtime consumer なし**（metadata。cron gate は各 route が `isFeatureEnabled` 直呼び）。registry との対応が分かるよう正しく列挙はする |

reviews のように公開 route を持たない module は `publicRoutes: []` とし、
domain 層で gate する（`src/shared/domain/reviews/public-queries.ts` /
`src/shared/domain/reviews/commands.ts` の `isFeatureEnabled("reviews")` パターン）。

### Step 1: registry を更新（型エラー駆動）

`src/shared/lib/features/registry.ts` で:

1. `FEATURE_MODULES_LIST` に id を追加（小文字英数字 + hyphen。テストが正規表現で強制）
2. `FEATURE_MODULES` に `FeatureModuleDef` を追加（label / description は管理 UI にそのまま表示される）
3. `buildInitialFeatureModules` に新 key の行を追加
   （`Record<FeatureModule, boolean>` の網羅性で型エラーになるので漏れない）

### Step 2: 管理 UI を更新

- `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/basic.ts` の
  `featureModulesSettingsSchema` に `<id>: switchBoolean()` を追加。
  **この schema は registry と型連動しない手動更新**（忘れると新 module の Switch 値が
  parse されず常に false 保存 = fail-closed で silent OFF）。
- `src/app/(admin)/admin/(dashboard)/settings/features/page.tsx` の `initialValues`
  リテラルに `<id>: false` を追加（`Record<FeatureModule, boolean>` で型エラーになる）。
- `FeatureModulesForm.tsx` は `moduleDefs`（registry 由来）を map するだけなので変更不要。
  行 UI・requires の注記・影響ルート表示は自動。

保存経路: `updateFeatureModulesSettings`
(`(admin)/(dashboard)/_shared/actions/settings/other.ts`) →
`updateFeatureModulesCommand` (`src/shared/domain/settings/commands.ts`) →
afterSuccess で `invalidateSiteWideCache([FEATURE_MODULES, NAVIGATION, PAGE_SECTIONS,
SECTIONS, PAGES, REVIEWS])`。**新 module の公開面が別の `'use cache'` タグに依存するなら
この afterSuccess のタグ配列に追加**（例: reviews は `CACHE_TAGS.REVIEWS` を含めている）。

### Step 3: seed と migration

- seed は `prisma/seed.ts` の `resolveSeedFeatureModules` →
  `buildInitialFeatureModules(parseDisabledFeatureModulesEnv(SEED_FEATURE_MODULES_DISABLED))`
  で registry から自動生成される。Step 1-3 を済ませれば **seed 本体の編集は不要**。
  初期 OFF にしたい環境は env `SEED_FEATURE_MODULES_DISABLED=events,faq` 形式で指定。
- `featureModules` は upsert の **create 経路のみ**（既存 install の管理画面編集を保持）。
  dev seed (`seedDev`) だけが `seedSettings({ resetFeatureModules: true })` で全 ON に強制。
- **既存 install で新 module を ON にしたい場合は migration が必要**（key 欠損 = fail-closed
  OFF のため）。新規 migration の SQL で JSONB merge する:
  `UPDATE "settings" SET "featureModules" = "featureModules" || '{"<id>": true}'::jsonb;`
  migration の作成・lint 手順は rules の migrations を参照
  （`bun run db:migrate --name <name>` → `bun scripts/lint-migrations.ts`）。
  管理画面から手動 ON で足りるなら migration は省略可（製品判断）。

### Step 4: 公開 route の 404 ガード

module が `publicRoutes` を持つなら、その配下の **全 page.tsx**（一覧と `[slug]` 詳細の両方。
posts は /blog /category/[slug] /tag/[slug] の 3 系統）の async component 冒頭に:

```ts
await requireFeatureEnabled("<id>");
```

`@/shared/lib/features/check` から import。OFF 時は `notFound()` で 404。
既存 14 箇所の例: `src/app/(public)/contact/page.tsx`、`src/app/(public)/spaces/[slug]/page.tsx`。
ガードは page 単位（route handler や proxy ではない）。

### Step 5: セクション・cron の連動

- **セクション**: module が section type を所有するなら `sectionTypes` に列挙するだけで、
  `SectionRenderer` が `featureCtx.disabledSectionTypes.has(section.type)` で早期 null にする
  （他ページに埋め込まれた section も OFF 時に非表示）。section type 自体の新規追加は
  rules の sections を参照。
- **cron**: module が cron を持つなら、route handler（`src/app/api/cron/*`）で
  `authorizeCronRequest` の直後に早期 return を入れる（スニペットは rules の
  `app-structure` 参照。既存 4 route と同型）。例:
  `src/app/api/cron/event-import/route.ts`。registry の `cronPaths` にも path を列挙する
  （現状 metadata だが registry ↔ 実 route の対応表として維持する）。

### Step 6: nav / sitemap は自動（確認のみ）

- navigation: `getPublicNavigation` が `isUrlDisabled(url, ctx.disabledRoutes)` で内部リンクを
  prune（外部リンクは対象外）。`publicRoutes` を正しく書けば自動。
- sitemap: `src/app/sitemap.ts` が静的ページを `isUrlDisabled`、カスタムページを
  `disabledPageSlugs` で filter。新 module のページを `STATIC_PAGES` に足す場合は
  drift gate（下記）が publicRoutes との整合を強制する。

### Step 7: テスト更新

- `__tests__/unit/lib/features/registry.test.ts` — `FEATURE_MODULES_LIST` の
  `toHaveLength(<N>)` を実数に更新 (registry.ts の tuple length で確認、N+1 に増える)。
  `pageSlugs` ⊆ `SYSTEM_PAGE_SLUGS`
  (`src/shared/lib/validations/page.ts` の `SYSTEM_PAGES`) の不変条件があるため、
  Page-backed なシステムページを持つ module は `SYSTEM_PAGES` への追加が先。
- `__tests__/unit/lib/features/check.test.ts` — 全 module を列挙する fixture
  (全 ON で size が registry と一致) を更新。requires を持たせたなら依存解決ケースを追加。
- `__tests__/unit/app/sitemap-static-pages.test.ts` — `STATIC_PAGES` に entry を足した場合、
  feature gate 対象 path は「exactly 1 module の publicRoutes に出現」が強制される。
- `__tests__/unit/forms/settings-form-empty-optional.test.ts` — featureModules の
  全 key "on" リストに新 id を追加（schema 実測の drift 防止）。

### Step 8: 検証

```
bun scripts/run-tests.ts __tests__/unit/lib/features
bun scripts/run-tests.ts __tests__/unit/app/sitemap-static-pages.test.ts __tests__/unit/app/sitemap.test.ts
bun run type-check
bun run validate
```

手動確認: `/admin/settings/features` で新 module の行が表示され、OFF 保存 →
公開ページ 404・nav から消えることを確認（toggle 保存で cache invalidate 済み）。

## 落とし穴

- **`featureModulesSettingsSchema` の追加漏れは型エラーにならない** — 保存時に新 module の
  値が落ちて常に false（fail-closed で気づきにくい）。Step 2 を必ず checklist で確認。
- **`disabledTemplates` / `disabledCronPaths` に runtime consumer はまだ無い**
  （`getFeatureFilterContext` が組み立てるが、PAGE_TEMPLATES selector / AddSectionDialog の
  除外は未配線。cron は各 route の `isFeatureEnabled` 直呼びが実配線）。
  これらの metadata だけ書いて配線した気にならない。
- registry の `publicRoutes` doc comment「次フェーズで `requireFeatureEnabled` を配線」は
  stale — 配線済み。新 module では Step 4 を必ず自分で行う。
- **re-seed では既存 install の featureModules は変わらない**（create-only）。
  「seed を直したのに本番で OFF のまま」は仕様 — Step 3 の migration か管理画面で ON にする。
- `requires` の依存解決は read 側のみで、DB 値は書き換えない（spaces を再 ON すると
  reservation/reviews は保存済みの値で復帰する）。UI も依存元 OFF 時に強制書き換えしない。
- `getFeatureModulesSettings` は `'use cache'` — module の ON/OFF に依存する新しい消費面を
  作ったら、その cache タグを `updateFeatureModulesSettings` の afterSuccess に足さないと
  toggle が反映されない。キャッシュ全般は rules の caching を参照。
- テスト実行は必ず `bun scripts/run-tests.ts` 経由（rules の testing-unit を参照）。
