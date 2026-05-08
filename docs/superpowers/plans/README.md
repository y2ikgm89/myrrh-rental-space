# Plans

実装計画 Markdown。ワーク完了後のみ `.archive/<年>/` へ移す。

## 運用（Diátaxis / anti-drift）

- **アクティブ一覧は README に書かない** — ディレクトリ直下の `YYYY-MM-DD-*.md` がそのままカタログになる。一覧を README に複製すると未更新のまま残りやすい。
- **新規**: [`templates/plan.md`](../templates/plan.md) をコピーし、kebab-case で命名する。
- **README の追記行の雛形**: [`templates/plan-readme-entry.md`](../templates/plan-readme-entry.md)。チーム運用で「今週のアクティブだけ共有」したい場合に限り、この 1 行を手で維持する。
- **完了後**: `.archive/<年>/` へ移動し、対応する spec も specs 側でアーカイブする。

アーカイブ: [.archive/](.archive/)
