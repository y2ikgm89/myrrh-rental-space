# よくある落とし穴

> 親 skill: [../SKILL.md](../SKILL.md)

## ビルド・デプロイ

- **`NEXT_PUBLIC_*` をランタイム env で渡しても効かない** — ビルド時インライン必須（`cloudbuild.yaml` の `--build-arg` に追加）
- **Secret Manager の version を `:latest` にしない** — 再デプロイせずに挙動が変わるとデバッグ不能。`cloudbuild.yaml` で `:1` / `:2` のように番号固定
- **`bun.lock` と `package.json` のドリフト** — Cloud Build で `bun install` が失敗する。ローカルで `bun install --frozen-lockfile` が成功するか確認
- **Prisma generate の順序** — `db:generate` より前に `next build` を走らせると `@generated/prisma/client` が見つからずビルドエラー

## 起動・ランタイム

- **`min-instances=0` でコールドスタートが遅い** — 初回リクエストが 5〜10 秒かかる。アクセス頻度が高いなら `min-instances=1` に変更
- **`max-instances=1` で同時実行制限** — 負荷テスト時にボトルネック。本番調整時は増やす
- **`timeout=300`（5分）を超えるリクエスト** — Server Action の長時間処理は背景ジョブに分離
- **probe endpoint が rate-limit バケットに合算される** — `/api/live` / `/api/health` は `proxy.ts` の rate-limit 除外リストに必須。`x-forwarded-for` 未設定で `getClientIp()` が `"unknown"` を返し、同一バケットに合算されて 429 → コンテナ kill 連鎖

## 環境変数・Secret

- **ENCRYPTION_KEY の長さ不一致** — 32 bytes 厳格。Secret Manager に保存した値の改行・空白に注意
- **BETTER_AUTH_URL と実際のベース URL の不一致** — クッキードメイン不一致で認証が通らない
- **`BETTER_AUTH_SECRET` の変更後は既存セッション無効化** — 変更時はログアウト周知が必要

## キャッシュ

- **Artifact Registry の `:cache` tag 汚染** — 依存更新後もキャッシュヒットして古いレイヤーを使い続けることがある。`gcloud artifacts docker images delete .../myrrh-rental-space:cache --quiet` で削除してフルリビルドを強制
- **Next.js 静的アセットのキャッシュ** — `/_next/static/` は immutable キャッシュ。HTML は `Cache-Control: private, no-cache` なので即時反映されるはず。反映されない場合はブラウザ hard reload（`Ctrl+Shift+R`）
