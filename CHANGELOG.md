# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

エントリは [Conventional Commits](https://www.conventionalcommits.org/) を参考に手動補完します（自動生成ツールは未導入）：

- `feat:` → Added
- `fix:` → Fixed
- `refactor:` / `perf:` → Changed
- `docs:` / `test:` / `chore:` / `ci:` / `style:` → （通常は記載しない、大きな変更のみ）
- `BREAKING CHANGE` / `!:` → **Changed (BREAKING)**

詳細な実装履歴は `git log` を SSoT とします。本ファイルは public-facing な変更点（互換性影響・新機能・セキュリティ修正）のみを集約します。

## [Unreleased]

現在 `main` への continuous deployment 運用中。タグリリースは行っていません。public-facing な変更点が発生したらここに追記してください。

## リリース運用

このプロジェクトは **trunk-based development + continuous deployment** を採用しており、現時点では semantic versioning によるタグリリースを行っていません。`main` ブランチへのマージが Cloud Run 本番環境への反映トリガーです（`Dockerfile` + `cloudbuild.yaml`）。

`[Unreleased]` セクションに変更を集約し、運用方針が変わった場合にのみバージョンタグ（`v1.0.0` 等）を切ります。

## リンク

- [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)
- [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)
- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
- [`docs/`](./docs/) — Diátaxis 構成のドキュメント
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — コミット規約詳細
