# Security Policy

## Supported Versions

このプロジェクトは **main / develop** ブランチのみがセキュリティサポート対象です。
リリースタグを使った固定バージョン運用は行っていません。

| Branch                       | Supported |
| ---------------------------- | :-------: |
| main                         |    ✅     |
| develop                      |    ✅     |
| その他 feature / PR branches |    ❌     |

## 脆弱性の報告方法

**公開 issue を開かないでください**。脆弱性情報は GitHub の Security Advisory 機能、
または owner (@y2ikgm89) への private message で報告してください。

### GitHub Security Advisory（推奨）

1. このリポジトリの **Security** タブ → **Advisories** → **Report a vulnerability**
2. 詳細（再現手順・影響範囲・PoC）を記入
3. Coordinated disclosure に沿って修正後に公開

GitHub 公式ガイド: https://docs.github.com/en/code-security/security-advisories

### 報告に含めるべき情報

- 影響を受けるファイル / 機能
- 攻撃シナリオ（認証済み / 未認証、前提条件）
- 再現手順（curl コマンド / HAR ファイル等）
- 想定される影響（情報漏洩 / 権限昇格 / RCE 等）
- 修正提案があれば併記

## 対応 SLA

| Severity                                      | 初回応答 | 修正目標   |
| --------------------------------------------- | -------- | ---------- |
| Critical (RCE / 認証バイパス / 大量 PII 漏洩) | 24 時間  | 7 日       |
| High (権限昇格 / 個別 PII 漏洩 / XSS)         | 72 時間  | 30 日      |
| Medium (情報開示 / DoS)                       | 7 日     | 90 日      |
| Low (best practice 違反 / hygiene)            | 14 日    | 次リリース |

## 自動セキュリティ対策

本プロジェクトでは以下の自動化を運用しています:

- **Renovate**: `.github/renovate.json5` で package grouping + auto-merge patch + 脆弱性即時更新
- **CodeQL**: `.github/workflows/codeql.yml` で PR + 週次 full scan（security-extended）
- **bun audit**: `.github/workflows/ci.yml` の `dependency-audit` job で毎 PR 実行
- **Better Auth**: 認証・セッション管理を外部ライブラリで委譲
- **Turnstile**: 全公開フォームに Cloudflare Turnstile CAPTCHA
- **CSP nonce**: `src/proxy.ts` でリクエストごと nonce 生成
- **HSTS**: `max-age=63072000; includeSubDomains; preload`
- **rate-limit**: `src/proxy.ts` + Server Actions 内 `checkActionRateLimit`
- **監査ログ**: 全管理 write アクションに `executeAdminMutationResult` 経由の audit trail
- **暗号化**: Stripe / Google OAuth tokens は `ENCRYPTION_KEY` で AES-256-GCM

## 禁止事項（公開前の注意）

脆弱性情報は公開 issue / PR / commit message に含めないでください。
既に公開されている脆弱性情報の報告は歓迎します（duplicate 確認のため）。

## Hall of Fame

責任ある開示にご協力いただいた方は、ご許可をいただいた上で本節に記載します。

（現時点でのエントリはありません）
