# Commands

## Development
- `bun dev` - 開発サーバー起動
- `bun run test` - テスト実行

## Verification (必須)
- `bun run type-check` - TypeScript型チェック
- `bun run lint` - ESLint
- `bun run validate` - type-check + lint 並列（推奨）
- `bun run build` - プロダクションビルド
- `bun run validate && bun run build` - 完了前の全検証

## Database
- `bunx --bun prisma migrate dev --name <name>` - マイグレーション
- `bun run db:generate` - Prismaスキーマ再生成

## System (Windows)
- `ls` (or `dir`) - ファイル一覧
- `mkdir -p` - ディレクトリ作成
- `git` - バージョン管理
