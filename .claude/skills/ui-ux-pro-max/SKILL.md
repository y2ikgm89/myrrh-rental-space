---
name: ui-ux-pro-max
description: 付属データベースを検索して UI 方針を素早く集める。`frontend-design` の前段や UI レビュー時の補助として使う。
---

# ui-ux-pro-max

この skill は local CSV を検索して UI の方向付けを集めるためのもの。
ブランドの正本は `project-design-config.md` であり、この skill が上書きしてはいけない。

## 使う場面

- 新規 UI の方向性を決める前
- public / admin UI のレビュー観点を増やしたいとき
- typography / palette / layout / UX の候補を短時間で集めたいとき

## 使わない場面

- プロジェクト固有トークンを決め打ちしたいとき
- 単なる実装作業で、すでに方向性が決まっているとき

## コマンド

ドキュメント例の `python3` は **Windows では `py -3` に読み替える**（Python Launcher。`python3` が無い・OS がアプリ選択を出す場合がある）。macOS / Linux / Git Bash（Unix 系）は `python3` のまま。

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain>
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack nextjs
```

Windows（PowerShell / cmd）の例:

```powershell
py -3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain>
py -3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack nextjs
```

既定の stack はこのプロジェクトでは `nextjs`。

## ドメイン

| ドメイン     | 使いどころ                         |
| ------------ | ---------------------------------- |
| `product`    | 画面種別や業種の方向性             |
| `style`      | 見た目のトーン、レイアウト傾向     |
| `typography` | フォントペアリング                 |
| `color`      | カラーパレット候補                 |
| `landing`    | ページ構成や CTA 配置              |
| `chart`      | ダッシュボードの可視化             |
| `ux`         | アクセシビリティ、操作性、落とし穴 |

## 推奨フロー

1. まず `product` か `style` で方向を絞る
2. 必要なら `typography` と `color` を追加する
3. UI レビューでは `ux` を最後に引く
4. 実装前に結果を 3-5 行へ圧縮し、`frontend-design` の Design Brief に渡す

## 出力のまとめ方

検索結果をそのまま貼らず、次の形に要約する。

- Direction: 何を目指すか
- Typography: どの対比を使うか
- Color: どの比率で使うか
- Layout/Motion: 何を強調し、何を抑えるか
- Risks: AIっぽさ、コントラスト不足、動き過多など

## ガードレール

- `project-design-config.md` と矛盾する提案をそのまま採用しない
- 管理画面の固定テーマを勝手に再設計しない
- raw search result を大量に貼らない
- `frontend-design` や `ui-ux-patterns.md` を飛ばして、この skill だけで実装判断を完了しない

## Done

- 必要最小限の domain だけ検索した
- 結果を短い判断材料へ圧縮した
- プロジェクト固有ルールとの整合性を確認した
