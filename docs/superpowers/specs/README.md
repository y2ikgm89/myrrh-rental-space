# Specs

設計仕様・設計ドラフト。

## 運用（anti-drift）

- アクティブ一覧は README で保守しない。直下の Markdown をソース・オブ・トゥルースとする。
- 命名は対応する plan と同日プレフィックスを揃えると追跡しやすい（例: `2026-05-02-*-design.md`）。
- **対応する plan が完了したタイミング**で、関連 spec ファイルも削除する。履歴は `git log --all --diff-filter=D -- docs/superpowers/specs/<file>` で辿れる（archive ディレクトリは廃止済）。
