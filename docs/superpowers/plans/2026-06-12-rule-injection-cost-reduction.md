# Rule Injection Cost 削減 — 公式 path-scoped ガイドライン全面適用

> **目的**: `.claude/rules/**` の path-scoped rule が file アクセス毎に全文注入され auto-compact を加速する根本問題を解消する。
> **方針**: 公式 (`claude-code-patterns.md` チェックリスト = over-broad glob 禁止 / cross-cutting rule 100 行以内) を全面適用。後方互換 shell（barrel index / re-export stub）は残さない。
> **検証**: 各 PR で `bun .claude/skills/audit-claude-config/scripts/injection-cost.ts` の before/after を記録。狭小化・分割は対象 file の coverage を grep 検証して guidance 喪失を防ぐ。

## 根本原因（実測 2026-06-12, main d94b9584 時点）

path-scoped rule は glob マッチ file を Read/Edit した瞬間に全文が context へ注入され compaction まで居座る（公式 context-window 仕様、毎アクセス再注入ではなく累積）。複数領域横断セッションで各シナリオの rule が和集合累積し auto-compact 早期発火。

| 編集対象 1 file | 注入 rule | tok (main) | tok (07ea3203 後) |
| --------------- | --------- | ---------- | ----------------- |
| 公開ページ .tsx | 47        | ~98K       | ~92K              |
| 管理画面 .tsx   | 43        | ~84K       | ~79K              |
| Lexical .tsx    | 33        | ~70K       | ~64K              |
| Server Action   | 34        | ~62K       | ~58K              |
| domain query    | 29        | ~53K       | ~50K              |

## 主要 cost-driver と対処技法

| rule                            | KB   | 出現 | 技法                                                 |
| ------------------------------- | ---- | ---- | ---------------------------------------------------- |
| public-page-gotchas.md          | 36   | 公開 | **split**（フォーム/レスポンシブ/blog 等 sub-scope） |
| ssot-ui-components.md           | 31   | 3    | **split**（union glob: admin+public+mypage+lexical） |
| ssot-sections-features.md       | 24.5 | 多   | **split**（admin 編集 vs public 消費）               |
| prisma-patterns.md              | 21   | 2    | split / trim                                         |
| ssot-db-domain.md               | 19   | 3    | split / trim                                         |
| auth-patterns.md                | 18   | 4    | **split**（union: admin+public+mypage+login+domain） |
| code-quality/forbidden-patterns | 11   | 7    | **trim**（230 行、cross-cutting 100 行超）           |
| 各 broad glob（下記）           | —    | —    | **narrow**（redundant な broad glob 除去）           |

## PR ロードマップ

- [x] **PR-1 trim cross-cutting**（#515 MERGED）— assertion-bans 322→62 / auto-memo 151→62 / container-queries 138→70 / index-access に Gotchas 移行 / claude-code-patterns に「100 行以内」ルール。`type-safety.md`(64)・`code-quality.md`(70) は 100 行準拠 + ユニーク内容のため**削除せず維持**（commit の「残作業 削除」却下）
- [x] **PR-2 split ssot-ui-components.md**（#516 MERGED）— lexical-article / public / admin(+calendar) / design-tokens の 4 分割。stale `src/admin|public/**` → `(admin|public)/**`。**公開 98K→87K / Lexical 70K→58K / 管理 84K→76K tok**
- [x] **PR-3 narrow customer-social**（#517、`(public)/**` 除去）— 公開 92K→89K tok（PR-6 の一部を先行）
- [ ] **PR-4 narrow auth-patterns.md broad globs**（split ではなく **narrow** が適切）— auth-patterns は admin/customer 横断の一般 auth grab-bag で sub-scope 分割不可。だが glob に**非 auth の over-broad** が混入: `src/shared/domain/**`（全 domain）/ `src/app/api/**`（全 API）/ `src/shared/lib/validations/**` / `nuqs/**` / `forms/**`。これらを auth 関連 path（`domain/auth/**` `domain/customers/**` `api/{auth,admin,customer-auth}/**` 等）へ narrow。Server Action / domain query / API route の 4 シナリオに効く高 value。**要 coverage 検証**（本文が一般 domain/api/validation を参照していないか grep）
- [ ] **PR-5 split SSoT giants** — ssot-sections-features(24.5KB) / ssot-db-domain(19KB) / prisma-patterns(21KB)。各 H2 を admin-edit vs public-consume / query-vs-command で narrow glob 化（ssot-ui-components と同手法）
- [ ] **PR-6 split public-page-gotchas.md(36KB)** — ⚠️ **grab-bag・難所**。同一 `(public*)/**` 配下に「全公開ページ共通(responsive/spacing/architecture/FAQ/counter、§レスポンシブ標準+§余白+§Page-First core)」「detail 限定(ArticleLayout/EventInfoPanel/Variant E/formatEventDate/Prose、本文 行 90-102 + 136)」「blog 限定(§ブログサイドバー + 行 103-105 BlogLayout/posts/SearchBar)」「form 限定(§公開フォーム UI 統一 + §フィルタ Select SSoT + §autoComplete + 行 141)」が混在。**同一 glob のサブ分割はコスト削減ゼロ**。narrow glob を割り当てられる部分のみ `public-page-gotchas/{forms,article-detail,blog}.md` に抽出 + core(残り)は `(public*)/**` のまま維持し file 名据置（inbound ref: touch-text/responsive/foundations が `public-page-gotchas.md` を参照、file 残せば破損なし）。core ~20KB は marketing/list 編集で残るが detail/form/blog 専用 ~16KB が外れる。bullet 単位の慎重仕分け要（fresh context 推奨）
- [ ] **PR-7 trim forbidden-patterns.md** — 230 行 cross-cutting(`src/**/*.{ts,tsx}`、7 シナリオ)を 100 行ルールへ trim（詳細例を narrow-path sub-file へ）
- [ ] **却下: nuqs / sessions glob narrow** — nuqs は 58 file に散在（page/layout/\_components/\_shared/components/\_shared/hooks/\_hooks/calendar/hooks/domain）、sessions は admin/layout/action/api 横断で**いずれも genuine broad**。naive narrow は coverage 損失。trim で対処するなら別途検討

## 進捗メモ（実装知見）

- **同一 glob のサブ分割はコスト削減ゼロ** — split が効くのは sub-file に元より narrow な glob を割り当てられる時のみ（react/compiler/\* が同一 glob で分割済=効果なしの前例）。public-page-gotchas / auth-patterns はこの理由で「分割」より「narrow glob 抽出 / 非該当 glob 除去」が本質
- **stale `src/admin/**` `src/public/**` glob 群** — 実体は `src/app/(admin|public)/**`。`@/admin`→`(admin)/admin/(dashboard)/_shared`, `@/public`→`(public)/_shared`。他 rule にも残存（ssot-datetime-media / ssot-sections-features の `src/public/...`、deployment-patterns の `src/middleware.ts`=現 `src/proxy.ts`）→ check-stale-paths.ts で DEAD_GLOB として検出可
- split 手順: 各 H2 → narrow sub-scope glob 割当 → concept-grep で coverage 検証 → sub-file 作成 → 元 file 削除(`git rm` OK) → inbound ref 更新（`docs/`+`.claude/`+`AGENTS.md`+`CLAUDE.md` を grep）→ `check-stale-paths.ts` で DEAD_RULE=0 / 新規 DEAD_GLOB=0 → `injection-cost.ts` before/after
- `type-safety.md` への 7 参照（lexical 系 SKILL / nuqs parsers）は「型アサーション禁止 = `type-safety/assertion-bans.md`」へ更新すると正確（type-safety.md 自体は残すので破損ではない、精度向上のみ）
- lefthook pre-commit が staged .md の table を prettier 整形（Edit drift 注意、PostToolUse prettier は .md 除外済）。auto-mode で `.claude/rules/` の Edit/Write/`git rm` 全て通る（user「出来ることを全て」認可済）
- **独立 PR は更新済み main から branch**（前 PR の同 file 衝突回避）。.md docs は build 非依存、CI Build job が auto-merge gate で最終検証
