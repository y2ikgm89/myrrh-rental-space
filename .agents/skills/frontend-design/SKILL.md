---
name: frontend-design
description: 公開ページの新規 UI や大幅なリデザイン前に使う。ブランド、anti-AI、再利用方針を短い design brief に落としてから実装する。
---

# frontend-design

`src/app/(public*)/**` の新規セクション、新規ページ、大幅なリデザインで使う。
微調整だけの修正では使わなくてよい。

## 先に読む

1. `docs/reference/codex-rules/project-design-config.md`
2. `docs/reference/codex-rules/anti-ai-design.md`
3. `docs/reference/codex-rules/design-system-memory.md`
4. 必要に応じて `docs/reference/codex-rules/ui-ux-patterns.md`
5. モーションが主役なら `docs/reference/codex-rules/gsap-patterns.md`
6. パターン例が必要なら `reference/anti-ai-patterns.md`

## 入力

- 何を伝える UI か
- 誰向けか
- どの route / component に置くか
- モーションが必須か、装飾か

## ワークフロー

1. 既存の近いセクションやページを読む
2. 目的を 1 文で定義する
3. `project-design-config.md` からムードを選び、逸脱するなら明示する
4. コンポジション制約を 2-3 個決める
5. 既存パターンだけでは不足する場合のみ `ui-ux-pro-max` を狭いキーワードで検索する
6. 実装前に短い Design Brief を出す

```markdown
## Design Brief: {Name}

- Purpose: ...
- Mood: ...
- Composition: ...
- Reuse: ...
- Motion: ...
- Anti-AI checks: ...
```

7. 実装では既存トークン、既存 UI、既存 animation primitive を優先して使う
8. 新しい project-wide 規約が必要になったら、承認後に `project-design-config.md` か関連 `codex-rules` を更新する

## 検索コマンド例

```bash
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "luxury hospitality editorial" --domain style
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "warm elegant serif" --domain typography
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "scroll accessibility" --domain ux
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "layout responsive" --stack nextjs
```

## ガードレール

- ハードコードカラーや場当たりのフォントスタックを足さない
- Generic hero、均一カードグリッド、過剰な gradient をデフォルトにしない
- モーションの定数は共有実装を使い、マジックナンバーを増やさない
- `prefers-reduced-motion` を無視しない
- 永続化が必要な判断を hidden state に置かず、ドキュメントに残す

## Done

- Design Brief を出した
- `anti-ai-design.md` のセルフレビューを通した
- theme token / semantic token / shared animation を使った
- 必要な設計判断を `codex-rules` 側へ反映した
- `bun run validate` を実行した
