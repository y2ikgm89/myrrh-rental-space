---
description: 構造化ロガー（logError + logger）+ ErrorCategory / ErrorSeverity 選択ガイド + エラー正規化 + ドメイン固有エラー
paths:
  - src/shared/lib/errors/**
  - src/shared/lib/logger*
  - src/**/actions/**
  - src/**/queries.ts
  - src/app/api/**
---

# logger の使用

> GCP Cloud Logging / Cloud Error Reporting 対応の構造化ログ。`logError`（主用途）+ `logger`（汎用）の使い分け、ErrorCategory / ErrorSeverity 選択、normalize、ドメイン固有エラー。

## logError（サーバーサイドエラーログ — 主用途）

GCP Cloud Logging / Cloud Error Reporting 対応の構造化エラーログ。
本番では `severity`（GCP LogSeverity）・`stack_trace`・`serviceContext`・`@type` を含む JSON を出力。
ERROR 以上で Cloud Error Reporting が自動グループ化する。Server Actions・Server Components で使用:

```typescript
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

// NG: console.log のみ
console.log("エラー:", error);

// NG: エラー握りつぶし
try {
  await action();
} catch {
  /* ignore */
}

// OK: 構造化ログ + createMutationError
import { createMutationError } from "@/shared/lib/mutation-result";

try {
  await action();
} catch (error) {
  logError(error, {
    category: ErrorCategory.DATABASE, // 'DATABASE' | 'EXTERNAL_API' | 'VALIDATION' | 'AUTHORIZATION' | 'CACHE' | 'UNKNOWN'
    severity: ErrorSeverity.HIGH, // 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
    context: { operation: "createReservation", userId: user.id },
  });
  return createMutationError("予約の作成に失敗しました");
}
```

## logger（汎用ロガー — シンプルなログ用途）

クライアントコンポーネント・シンプルなサーバーログ。
本番環境では GCP Cloud Logging 対応の構造化 JSON（`severity` フィールド付き）を出力:

```typescript
import { logger } from "@/shared/lib/logger";

// NG: console.log
console.log("User logged in:", userId);

// OK: logger
logger.info("User logged in", { userId });
logger.warn("Deprecated API called", { endpoint: "/old-api" });
logger.error("Failed to sync calendar", { error: e.message, calendarId });
logger.debug("Processing item", { itemId }); // 開発環境のみ出力
```

## ErrorCategory・ErrorSeverity 選択ガイド

| Category        | 使用場面                                              |
| --------------- | ----------------------------------------------------- |
| `DATABASE`      | Prisma クエリエラー                                   |
| `EXTERNAL_API`  | Stripe / Instagram / Google Calendar / Cloudflare API |
| `VALIDATION`    | データ整合性エラー（Zod 以外）                        |
| `AUTHORIZATION` | 権限チェック失敗                                      |
| `CACHE`         | `revalidateTag` / CDN パージ失敗                      |
| `UNKNOWN`       | 分類不明なエラー                                      |

| Severity   | 使用場面                               |
| ---------- | -------------------------------------- |
| `CRITICAL` | システム障害、ユーザー続行不可         |
| `HIGH`     | 機能障害、フォールバック利用可能       |
| `MEDIUM`   | 部分的障害（ナビゲーション取得失敗等） |
| `LOW`      | 軽微な問題（CDN パージ失敗等）         |

## エラー正規化

catch 句の `unknown` 型を安全に扱う:

```typescript
import { normalizeError, getErrorMessage } from '@/shared/lib/errors'

// getErrorMessage: メッセージ文字列のみ必要な場合
catch (error) {
  logger.error('Failed', { error: getErrorMessage(error) })
}

// normalizeError: Error オブジェクトが必要な場合
catch (error) {
  const err = normalizeError(error)
  logError(err, { category: ErrorCategory.DATABASE, severity: ErrorSeverity.HIGH })
}
```

## ドメイン固有エラー（ReservationOverlapError）

```typescript
import {
  ReservationOverlapError,
  isReservationOverlapError,
} from "@/shared/lib/errors";

try {
  await prisma.$transaction(async (tx) => {
    const overlap = await tx.reservation.findFirst({
      /* 重複チェック */
    });
    if (overlap) throw new ReservationOverlapError();
    await tx.reservation.create({ data });
  });
} catch (error) {
  if (isReservationOverlapError(error)) {
    return createMutationError(error.message); // '選択された時間帯は既に予約されています'
  }
  logError(error, {
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.HIGH,
  });
  return createMutationError("予約の作成に失敗しました");
}
```
