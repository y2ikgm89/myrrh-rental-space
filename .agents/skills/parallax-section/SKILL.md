---
name: parallax-section
description: 公開ページのスクロール演出セクションを追加するときに使う。GSAP、effect level、reduced motion、モバイル縮退を前提に実装する。
---

# parallax-section

`src/app/(public*)/**` にスクロール連動セクションを追加するときに使う。
単なる静的セクションには使わない。

## 入力

- `SectionName`
- セクションの目的
- タイプ: `hero`, `content`, `cta`, `stacking`, `gallery`, `zoom`, `sequence`, `split`
- 期待するムード
- Three.js / PixiJS 拡張の要否

## 先に読む

1. `docs/reference/codex-rules/project-design-config.md`
2. `docs/reference/codex-rules/gsap-patterns.md`
3. `docs/reference/codex-rules/visual-effects-patterns.md`
4. WebGL を使うなら `docs/reference/codex-rules/threejs-patterns.md` または `docs/reference/codex-rules/pixijs-patterns.md`
5. `reference/mood-variants.md`
6. `reference/section-templates.md`

## タイプの目安

| タイプ | 向いている用途 |
|------|----------------|
| `hero` | 最初の印象を作る導入 |
| `content` | テキスト主体の説明と写真の組み合わせ |
| `cta` | 終端の行動喚起 |
| `stacking` | ストーリー進行、段階開示 |
| `gallery` | 写真や実例の見せ場 |
| `zoom` | 没入感のある単一メッセージ |
| `sequence` | 画像シーケンスや疑似動画 |
| `split` | 左右で情報密度を分ける構成 |

## ワークフロー

1. 近い既存セクションを読み、再利用できる実装を決める
2. タイプとムードを決め、レイヤー構成を 2-5 層に絞る
3. `ui-ux-pro-max` が必要なら `style`, `ux`, `nextjs` だけ検索する
4. `gsap.matchMedia()` 前提で desktop / mobile / reduced-motion の 3 条件を先に決める
5. 実装は `useGSAP` + `scope`、`@/public/.../gsap-config` 経由 import、共有 animation 定数の使用を守る
6. ページ全体の演出基盤が必要な場合だけ `ExperienceShell` に opt-in し、public root layout は触らない
7. WebGL を使う場合は `ExperienceShell` 配下で `VisualEffectsProvider` と effect level gate を前提にする
8. index export や呼び出し側統合を更新する
9. reduced motion、モバイル、パフォーマンスを確認する

## 検索コマンド例

```bash
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "scroll storytelling hospitality" --domain style
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "motion accessibility" --domain ux
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "scroll animation performance" --stack nextjs
```

## ガードレール

- reduced motion 時は GSAP 不介入か軽量化のどちらかを明示する
- モバイルではパララックス量を縮小し、`pin: true` を安易に使わない
- `Math.random()` を使わず決定的な値でレイアウトや粒子を生成する
- Three.js / PixiJS はフォールバックなしで入れない
- `SmoothScrollProvider` / `ScrollOrchestratorProvider` / `VisualEffectsProvider` を global layout に戻さない
- `NuqsAdapter` や URL state provider を public root layout に戻さない
- z-index、effect level、WebGL context 管理を local rule から逸脱させない
- 履歴資料の `docs/plans/*` を実装ルールとして扱わない

## Done

- `gsap.matchMedia()` で reduced motion と breakpoint を分けた
- `gsap-config.ts` と共有 animation 定数を使った
- モバイル縮退と L1-L4 フォールバックを用意した
- 必要な export / integration を更新した
- `bun run validate` を実行した
