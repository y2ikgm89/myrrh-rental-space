---
description: Cloud Build シークレット管理（必須/任意）と .dockerignore / .gcloudignore パターン
paths:
  - cloudbuild.yaml
  - .dockerignore
  - .gcloudignore
---

# シークレット管理 + ignore ファイル

> 必須シークレット (cloudbuild.yaml で管理) と任意シークレット (手動追加) の使い分け + Docker / Cloud Build 用 ignore ファイル。

## .dockerignore

Docker ビルドコンテキストから除外。**`generated` を含める**（deps ステージで再生成するため）:

```
node_modules
.next
generated    # deps ステージで再生成
.git
.env
.env.*
docs/
*.md
__tests__
e2e/
.claude/
.serena/
```

## .gcloudignore

Cloud Build ソースアップロードから除外。`#!include:.gitignore` で .gitignore を継承:

```
#!include:.gitignore
docs/
__tests__/
e2e/
.claude/
.serena/
*.md
*.log
```

## 必須シークレット（cloudbuild.yaml で管理）

| シークレット         | 用途                          |
| -------------------- | ----------------------------- |
| `DATABASE_URL`       | PostgreSQL 接続               |
| `BETTER_AUTH_SECRET` | Better Auth 署名キー          |
| `ENCRYPTION_KEY`     | API キー暗号化 (64 hex chars) |
| `CRON_SECRET`        | CRON エンドポイント認証       |
| `ADMIN_LOGIN_TOKEN`  | 管理画面アクセス制限          |

## 任意シークレット（手動追加）

`gcloud run services update --update-secrets` で手動追加。デプロイで上書きされない:

```bash
gcloud run services update myrrh-rental-space \
  --region asia-northeast1 \
  --update-secrets=RESEND_API_KEY=RESEND_API_KEY:1
```

| シークレット                                | 用途          |
| ------------------------------------------- | ------------- |
| `RESEND_API_KEY`                            | メール送信    |
| `TURNSTILE_SECRET_KEY`                      | CAPTCHA       |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth  |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | Instagram API |
