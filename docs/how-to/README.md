# How-to — 手順

> 問題解決指向のドキュメント。「特定のタスクを達成するには」に答える。

[Diátaxis](https://diataxis.fr/how-to-guides/) の **how-to** に相当する。読み終えた後に「目的を達成できる」状態を目指す。背景や設計判断は [`../explanation/`](../explanation/) を、ライブラリ API 仕様は公式 docs を直接参照。

## インフラ・デプロイ

| ファイル                                       | やりたいこと                                       |
| ---------------------------------------------- | -------------------------------------------------- |
| [deploy.md](./deploy.md)                       | Google Cloud Run へのデプロイ（IAM / Secret 含む） |
| [docker.md](./docker.md)                       | Docker イメージのビルド・実行                      |
| [cloudflare.md](./cloudflare.md)               | Cloudflare DNS / CDN / SSL 設定                    |
| [cron-schedule.md](./cron-schedule.md)         | Cloud Scheduler / cron job の設定                  |
| [harden-protection.md](./harden-protection.md) | DDoS / レート制限 / Turnstile / Cloud Run の固め方 |

## 外部連携セットアップ

| ファイル                                                               | やりたいこと                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [google-business-profile-setup.md](./google-business-profile-setup.md) | Google Business Profile 連携（OAuth scope / API 申請 / Stub mode） |

データベース migration / Better Auth 設定 / Lexical 旧データ修正の手順は `.claude/rules/{prisma-patterns,auth-patterns,prisma-patterns/lexical-storage}.md`（Claude Code）と `.agents/skills/{prisma-data-change,auth-rbac-change,lexical-editor}/SKILL.md`（Codex）が SSoT。
