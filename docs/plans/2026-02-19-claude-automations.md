# Claude Code 自動化追加

**日付**: 2026-02-19
**種別**: 開発環境改善
**ステータス**: 完了

---

## 概要

セッション継続性・キャッシュ戦略監査・Server Actionスキャフォールドの3つを追加。
既存のhooks/agents/skillsを補完し、繰り返し作業と見落としを減らす。

---

## 実装ステップ

- [x] 設計ドキュメント作成
- [x] Step 1: SessionStart hook — settings.json に追加
- [x] Step 2: cache-strategy-reviewer — .claude/agents/ に追加
- [x] Step 3: create-server-action — .claude/skills/ に追加

---

## 設計詳細

### 1. SessionStart hook

`settings.json` の `hooks.SessionStart` に追加:

```bash
head -100 docs/plans/README.md
grep -l "実装中\|設計承認済み" docs/plans/*.md 2>/dev/null || echo "進行中の計画なし"
```

表示内容: プロジェクト品質スコア + 直近の完了計画上位 + 進行中計画ファイル名

### 2. cache-strategy-reviewer

`.claude/agents/cache-strategy-reviewer.md`

- model: haiku（速度優先・ルールチェック特化）
- 4つのチェック項目（updateTag誤用・CACHE_TAGS定数・safeFetch・cacheTag設定漏れ）

### 3. create-server-action

`.claude/skills/create-server-action/SKILL.md`

- 引数: リソース名（例: `coupon`, `location`）
- 生成: `actions/<name>.ts` + `validations/<name>.ts`
- フル withPermission CRUD テンプレート
