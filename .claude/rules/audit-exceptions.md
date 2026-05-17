---
description: 監査・レビュー agent が誤検出しないための「ルール違反に見えるが正当な例外」 SSoT
paths:
  - ".claude/agents/**"
  - ".claude/skills/audit-*/**"
---

# 監査例外 SSoT

レビュー / 監査 agent が誤検出しないための「ルール違反に見えるが正当な例外」リスト。

## 例外項目

- `LayoutFields.tsx` / `auto-section-form.tsx` / `AutoArrayField.tsx` / `Auto{Boolean,Select,Group}Field.tsx` の `as unknown as FieldMetadata<...>` 境界 cast — `type-safety/assertion-bans.md` §6 conform `FieldMetadata<T>` generic invariance で明示許可 (Pure Component に渡すための境界変換、conform 公式仕様の invariant type parameter 制約)
- `to-app-route.ts` 内部の `z.custom<Route<string>>` cast — `type-safety/assertion-bans.md` §5 SDK 境界 Zod typed schema で明示許可 (Next.js typedRoutes の generated 型を SSoT helper 1 箇所に集約)
- `email/schemas.ts` 内部の `z.custom<CreateEmailOptions>` cast / `google-business-profile/schemas.ts` 内部の `z.custom<Schema$Location>` cast — 同 §5 で明示許可 (Resend / googleapis SDK 境界の SSoT helper)
- `global-error.tsx` のハードコードカラー — `tailwind-patterns/theme-tokens.md` で client-side fallback として除外
- `select.tsx` の `required` — `frontend/project-design-config.md` で Radix 制約として除外
- `revalidateTag` の第 2 引数 — `server-actions/use-cache.md` で Next.js 16 API として記載

## 「legacy / 互換」コメント sanctioned 例外

grep `(legacy|Legacy|//.*旧|//.*互換|@deprecated)` で hit するが**違反として報告しない**パターン:

- `reEncryptLegacyOAuthToken` / `legacy plaintext token` (`shared/domain/auth/`) — Better Auth at-rest encryption migration helper（`auth-patterns.md` §OAuth token encryption）
- `legacy データ` / `legacy object format` — defensive parser の historical data 自己修復 transform
- `S3 互換 API` (`env/server.ts`) — Cloudflare R2 機能説明
- `React Compiler 互換` / `FieldValues と互換` / `直接互換` — 設計説明
- `互換 API` / `互換 re-export` (`section-metadata.ts` / `section.ts`) — 後方互換 re-export shell
- `adornment が無ければ 直接 return` (`input.tsx`) / `Settings にフォールバック` (`access-map.tsx`) — graceful fallback 設計
- `glass-shimmer` (announcement-bar) — animation 機能名

**真の history-only 注記の削除判定**: コメント単体で隣接コードへの参照が失われ「過去の cleanup の事実だけを記述」するもの（例: 削除済 helper への言及 / Phase X で削除した旧 component への言及）は削除対象。設計説明 / defensive parser comment は維持。

## 使い方

該当パターンが上記に記載されていれば **Critical / High 扱いで報告しない**。

疑わしい場合は現物を `Read` で確認し、必要なら個別 rule docs を Grep で確認:

```bash
Grep -n "例外\|EXCEPTION\|sanctioned\|許可\|除外" <rule-file>
```

新しい例外を追加する場合は、本ファイルに追記（agent 内の重複定義禁止）。
