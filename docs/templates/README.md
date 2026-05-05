# Templates

> ドキュメント / 計画作成時のひな形。

## ファイル

| テンプレート                                   | 用途                                                |
| ---------------------------------------------- | --------------------------------------------------- |
| [architecture.md](./architecture.md)           | `docs/explanation/<topic>.md` の雛形                |
| [requirements.md](./requirements.md)           | 要件定義の雛形                                      |
| [plan.md](./plan.md)                           | `docs/superpowers/plans/<date>-<topic>.md` の雛形   |
| [plan-readme-entry.md](./plan-readme-entry.md) | `docs/superpowers/plans/README.md` への追記行の雛形 |

## 使い方

1. 該当テンプレートをコピーして対象ディレクトリに配置（kebab-case で命名）
2. plan / spec の場合は `docs/superpowers/{plans,specs}/README.md` の Active セクションに 1 行追加
3. 完了後は `.archive/<year>/` に移動
