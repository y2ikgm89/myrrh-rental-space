---
name: parallax-section
description: 公開ページのスクロール演出セクションを追加するときに使う。GSAP、effect level、reduced motion、モバイル縮退を前提に実装する。
when_to_use: 公開ページに GSAP ベースの parallax / scroll-driven animation セクションを追加するとき。
paths:
  - src/app/(public)/**/*.tsx
---

# parallax-section

`src/app/(public*)/**` にスクロール連動セクションを追加するときに使う。
単なる静的セクションには使わない。

## 入力

- `SectionName`
- セクションの目的
- タイプ: `hero`, `content`, `cta`, `stacking`, `gallery`, `zoom`, `sequence`, `split`
- 期待するムード

## 先に読む

1. `.claude/rules/frontend/project-design-config.md`
2. `.claude/rules/frontend/gsap/matchmedia.md` + `.claude/rules/frontend/gsap/scroll-trigger.md`
3. `reference/mood-variants.md`
4. `reference/section-templates.md`

## タイプの目安

| タイプ     | 向いている用途                       |
| ---------- | ------------------------------------ |
| `hero`     | 最初の印象を作る導入                 |
| `content`  | テキスト主体の説明と写真の組み合わせ |
| `cta`      | 終端の行動喚起                       |
| `stacking` | ストーリー進行、段階開示             |
| `gallery`  | 写真や実例の見せ場                   |
| `zoom`     | 没入感のある単一メッセージ           |
| `sequence` | 画像シーケンスや疑似動画             |
| `split`    | 左右で情報密度を分ける構成           |

## ワークフロー

1. 近い既存セクションを読み、再利用できる実装を決める
2. タイプとムードを決め、レイヤー構成を 2-5 層に絞る
3. `ui-ux-pro-max` が必要なら `style`, `ux`, `nextjs` だけ検索する
4. `gsap.matchMedia()` 前提で desktop / mobile / reduced-motion の 3 条件を先に決める
5. 実装は `useGSAP` + `scope`、`@/public/.../gsap-config` 経由 import、共有 animation 定数の使用を守る
6. index export や呼び出し側統合を更新する
7. reduced motion、モバイル、パフォーマンスを確認する

## 検索コマンド例

Windows では `python3` を **`py -3`** に読み替える（理由と例はリポジトリ直下 `AGENTS.md` の Setup を参照）。

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "scroll storytelling hospitality" --domain style
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "motion accessibility" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "scroll animation performance" --stack nextjs
```

## ガードレール

- reduced motion 時は GSAP 不介入か軽量化のどちらかを明示する
- モバイルではパララックス量を縮小し、`pin: true` を安易に使わない
- `Math.random()` を使わず決定的な値でレイアウトや粒子を生成する
- Three.js / PixiJS / WebGL は未使用（削除済み）。再導入しない
- **nuqs 以外**の URL 同期用 Context / Provider を public root に足さない。既存の **`NuqsAdapter`** は維持前提（二重ラップも禁止）。詳細は `.claude/rules/nuqs-patterns.md`
- z-index、effect level、WebGL context 管理を local rule から逸脱させない
- 完了済み plan（`git log --all --diff-filter=D -- docs/superpowers/plans/<file>` で辿れる削除済 file）を実装ルールとして扱わない

## Done

- `gsap.matchMedia()` で reduced motion と breakpoint を分けた
- `gsap-config.ts` と共有 animation 定数を使った
- モバイル縮退と L1-L4 フォールバックを用意した
- 必要な export / integration を更新した
- `bun run validate` を実行した
