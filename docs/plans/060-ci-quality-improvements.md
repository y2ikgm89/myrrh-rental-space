# 060 - CI/CD品質改善計画

## 概要

プロジェクト品質をA（95点）からA+（98点以上）に向上させるための包括的改善計画。
Dependabot設定、CSPセキュリティヘッダー、テストカバレッジ有効化、TypeDoc API ドキュメント設定を実施。

## 実装内容

### Phase 1: Dependabot設定 ✅

`.github/dependabot.yml` 作成:

- npm依存関係の週次更新（月曜日）
- GitHub Actionsの週次更新
- メジャーバージョンは手動対応（ignore設定）
- dev/production依存関係のグループ化
- ラベル自動付与（dependencies, automated）

### Phase 2: CSPセキュリティヘッダー実装 ✅

`next.config.ts` 更新:

- Content-Security-Policy ヘッダー追加
- 環境別設定（開発: unsafe-eval許可、本番: 厳格化）
- 対応サービス: Turnstile, Stripe, Supabase, YouTube

CSP設定内容:

- `default-src: 'self'`
- `script-src: 'self' 'unsafe-inline' + 開発時unsafe-eval + 外部サービス`
- `style-src: 'self' 'unsafe-inline'`
- `img-src: 'self' data: blob: + Supabase/YouTube/placehold.co`
- `connect-src: 'self' + Supabase/Stripe API`
- `frame-src: 'self' + Turnstile/Stripe/YouTube`
- `object-src: 'none'`, `frame-ancestors: 'none'`

### Phase 3: テストカバレッジ有効化 ✅

`bunfig.toml` 更新:

- `coverage = true`
- `coverageReporter = ["text", "lcov", "html"]`
- `coverageDir = "coverage"`
- `coverageThreshold = { lines = 80, functions = 80, branches = 70 }`

`.github/workflows/ci.yml` 更新:

- `bun test --coverage` でカバレッジレポート生成（ローカル確認用）

### Phase 4: 型アサーション状況確認 ✅

現状確認の結果:

- 自動生成ファイル（Prisma）: 変更不可
- import renaming（`type X as Y`）: 正当な使用
- 型ガード関数内: 必要な使用
- serialize関数: JSON変換で必要

結論: 既に最適化済み、追加削減は不要。

### Phase 5: TypeDoc API ドキュメント設定 ✅

`typedoc.json` 作成:

- エントリーポイント: shared/lib, admin/actions, public/actions
- 出力先: docs/api
- Markdownプラグイン使用
- 自動生成ファイル除外

`package.json` 更新:

- `docs`: TypeDoc実行
- `docs:watch`: 監視モード

devDependencies追加:

- `typedoc: ^0.28.4`
- `typedoc-plugin-markdown: ^4.7.0`

## 検証結果

- [x] type-check: 成功
- [x] lint: 成功
- [ ] build: DB接続必要（CI環境でテスト）

## 成功基準達成状況

- [x] Dependabot PR自動生成設定完了（GitHub標準機能、無料）
- [x] CSP ヘッダー適用（8種類のセキュリティヘッダー）
- [x] テストカバレッジ設定完了（80%閾値、ローカル/CI確認用）
- [x] 型アサーション確認完了（既に最適化済み）
- [x] APIドキュメント自動生成設定完了（TypeDoc、無料OSS）
- [x] CI でAPIドキュメント生成＋Artifact保存（mainブランチpush時、90日保持）

## 作成/更新ファイル

- `.github/dependabot.yml` (新規)
- `.github/workflows/ci.yml` (更新)
- `bunfig.toml` (更新)
- `next.config.ts` (更新)
- `typedoc.json` (新規)
- `package.json` (更新)
- `.gitignore` (更新) - docs/api/ 追加

## 次のステップ

1. `bun install` でTypeDoc依存関係インストール
2. `bun run docs` でAPIドキュメント生成確認
