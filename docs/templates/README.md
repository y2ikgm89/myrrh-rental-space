# Templates

> plan / plan-readme-entry の雛形。`docs/superpowers/{plans,specs}/` ワークフローと連動する。

## ファイル

| テンプレート                                   | 用途                                                |
| ---------------------------------------------- | --------------------------------------------------- |
| [plan.md](./plan.md)                           | `docs/superpowers/plans/<date>-<topic>.md` の雛形   |
| [plan-readme-entry.md](./plan-readme-entry.md) | `docs/superpowers/plans/README.md` への追記行の雛形 |

## 使い方

1. [plan.md](./plan.md) をコピーして `docs/superpowers/plans/` に配置（`YYYY-MM-DD-<topic>.md` 形式 kebab-case）
2. plan / spec の正本はディレクトリ直下のファイル一覧。README への追記は任意で [plan-readme-entry.md](./plan-readme-entry.md) を利用
3. 完了後は plan / spec ファイルを削除する（履歴は `git log --all --diff-filter=D -- docs/superpowers/plans/<file>` で辿る）

`docs/explanation/<topic>.md` や要件定義のフォーマットはトピック毎に内容差が大きいため、雛形より既存ファイル（`architecture.md` / `caching.md` 等）の写経を推奨する。
