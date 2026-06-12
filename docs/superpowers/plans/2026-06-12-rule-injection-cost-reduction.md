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

- [x] **PR-1 trim cross-cutting**（branch `refactor/reduce-rule-injection-cost`, commit 07ea3203）
  - assertion-bans 322→62 / auto-memo 151→62 / container-queries 138→70 / index-access に Gotchas 移行 / claude-code-patterns に「100 行以内」ルール追加
  - **決定**: `type-safety.md`(64 行)・`code-quality.md`(70 行) は**削除しない** — 両方 100 行準拠 + ユニーク内容（tsconfig 表 / utilities 表 / 最小変更原則）。commit の「残作業 削除」は却下
- [ ] **PR-2 split ssot-ui-components.md** — sub-scope: lexical / 公開UI / mypage / admin予約カレンダー / admin共通 / @theme トークン / home-hero
- [ ] **PR-3 split public-page-gotchas.md** — フォーム / レスポンシブ・余白 / Page-First / blog サイドバー / 料金・リンク
- [ ] **PR-4 split auth-patterns.md** — admin / public-customer / sessions の union glob 分解
- [ ] **PR-5 split SSoT giants** — ssot-sections-features / ssot-db-domain / prisma-patterns の admin-edit vs public-consume 分離
- [ ] **PR-6 narrow redundant broad globs**
  - `auth-patterns/customer-social.md`: `src/app/(public)/**` 除去（login/mypage/customer-auth で十分）
  - `auth-patterns/sessions.md`: `src/app/**/page.tsx` `**/layout.tsx` を admin/mypage/login へ
  - `nuqs-patterns.md` / `nuqs-patterns/usage-patterns.md`: `src/app/**` を nuqs 実利用 path へ
  - `react/forms-ssr.md`: `src/**/*.tsx` を form 系 path へ
  - `forbidden-patterns.md`: trim（PR-1 で扱わなければここ）

## 進捗メモ

- 各 split は「元 rule の各 H2 セクション → 最も narrow な sub-scope glob を割り当て → concept-grep で対象 file を全網羅できるか検証 → sub-file 作成 → 元 file 削除 → CLAUDE.md / cross-ref 更新」。
- `type-safety.md` への 7 参照（lexical 系 SKILL / nuqs parsers）は「型アサーション禁止 = `type-safety/assertion-bans.md`」へ更新すると正確（type-safety.md 自体は残すので破損ではない、精度向上のみ）。
- auto-mode で `.claude/rules/` の Edit/Write は通る。`git rm`（削除）は過去 block 実績あり → user 認可済（「出来ることを全て」）。
