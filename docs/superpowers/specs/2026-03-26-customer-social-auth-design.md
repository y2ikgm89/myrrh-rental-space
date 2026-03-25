# 顧客ソーシャルログイン + マイページ設計

> Google / LINE アカウント連携による予約体験の改善

## 概要

公開ユーザー（顧客）が Google / LINE でログインし、予約情報の自動入力・マイページでの予約管理（閲覧・変更・キャンセル）を可能にする。

### 決定事項

| 項目                 | 決定                                        |
| -------------------- | ------------------------------------------- |
| ゲスト予約           | 維持（ログイン任意）                        |
| ソーシャルログイン   | Google + LINE                               |
| モデル設計           | Customer に userId FK 追加（User と紐づけ） |
| マイページ機能       | 閲覧 + 変更 + キャンセル（フル）            |
| 変更・キャンセル期限 | 管理画面から設定可能（時間ベース）          |
| 通知                 | 全てメール（既存のまま）                    |
| 破壊的変更           | OK（クリーン実装優先）                      |
| フェーズ2            | LINE Bot 予約確認（Reply Message）          |

---

## 1. 認証基盤

### Better Auth 設定

既存の Better Auth インスタンスに LINE プロバイダーと Account Linking を追加。管理者と顧客は同じ `User` テーブルで `role` フィールドにより分離。

```typescript
// src/shared/lib/auth.ts
export const auth = betterAuth({
  socialProviders: {
    google: {
      clientId: serverEnv.GOOGLE_CLIENT_ID,
      clientSecret: serverEnv.GOOGLE_CLIENT_SECRET,
      scope: ["openid", "email", "profile"],
    },
    line: {
      clientId: serverEnv.LINE_CLIENT_ID,
      clientSecret: serverEnv.LINE_CLIENT_SECRET,
      // デフォルトスコープ: openid, profile, email
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "line"],
    },
  },
  user: {
    additionalFields: {
      role: {
        type: ["USER", "ADMIN", "SUPER_ADMIN", "EDITOR", "VIEWER", "CUSTOMER"],
        required: false,
        defaultValue: "CUSTOMER", // ソーシャルログインの新規ユーザーは CUSTOMER
        input: false,
      },
    },
  },
});
```

**注意**: Google の Calendar スコープ (`calendar.events`) は管理者用の Google Calendar 同期専用。公開ユーザーのログインには不要なため、スコープを分離する必要がある。管理者がGoogleでログインする場合のみ Calendar スコープを付与する設計とする。

### Account Linking の動作

- `trustedProviders` に含まれるプロバイダーはメール一致で自動統合
- Google (tanaka@gmail.com) でログイン後、LINE (同じメール) でログイン → 同一 User に統合
- 異なるメールの場合 → ログイン済み状態で `/mypage/settings` から `linkSocial()` で手動連携

### databaseHooks は使用しない

Better Auth の `databaseHooks.user.create.after` には既知の問題がある（ソーシャルログイン時にトランザクション内で FK 制約違反が発生する: [GitHub Issue #7260](https://github.com/better-auth/better-auth/issues/7260)）。

代わりに、アプリケーションレベルでの遅延紐づけを行う。

---

## 2. データモデル変更

### Prisma スキーマ

```prisma
// Role enum に CUSTOMER 追加
enum Role {
  SUPER_ADMIN
  ADMIN
  EDITOR
  VIEWER
  USER
  CUSTOMER
}

// Customer モデルに userId FK 追加
model Customer {
  // ... 既存フィールド ...
  userId  String? @unique @db.Uuid
  user    User?   @relation("CustomerUser", fields: [userId], references: [id], onDelete: SetNull)
}

// Settings モデルにキャンセル・変更期限を追加
model Settings {
  // ... 既存フィールド ...
  cancellationDeadlineHours  Int @default(24)
  modificationDeadlineHours  Int @default(24)
}
```

### 一意制約による重複防止

| 制約                      | 効果                                             |
| ------------------------- | ------------------------------------------------ |
| `Customer.email @unique`  | 同じメールの Customer は2件作れない              |
| `Customer.userId @unique` | 同じ User に紐づく Customer も2件作れない        |
| `User.email @unique`      | 同じメールの User は作れない（Better Auth 管理） |

---

## 3. Customer ↔ User 紐づけロジック

### 遅延紐づけ関数

`databaseHooks` の代わりに、マイページ初回アクセス時にアプリケーション層で紐づけを行う。

```typescript
// src/shared/domain/customers/commands.ts
async function ensureCustomerLinked(user: {
  id: string;
  email: string;
  name: string;
}): Promise<Customer> {
  // 1. userId で既に紐づけ済みか確認
  const linked = await prisma.customer.findUnique({
    where: { userId: user.id },
  });
  if (linked) return linked;

  // 2. email で既存 Customer を検索 → userId を紐づけ
  const byEmail = await prisma.customer.findUnique({
    where: { email: user.email },
  });
  if (byEmail) {
    return prisma.customer.update({
      where: { id: byEmail.id },
      data: { userId: user.id },
    });
  }

  // 3. 完全に新規 → Customer 作成
  return prisma.customer.create({
    data: {
      email: user.email,
      lastName: user.name.split(" ")[0] || "",
      firstName: user.name.split(" ")[1] || "",
      userId: user.id,
    },
  });
}
```

### 呼び出しタイミング

- `/mypage/layout.tsx`（Server Component）で認証チェック後に実行
- 紐づけ済みなら `findUnique({ where: { userId } })` で即 return（O(1)）

### 予約時の顧客解決（修正版）

```typescript
// src/shared/domain/reservations/commands.ts
async function resolveOrCreateCustomer(tx, data, userId?) {
  // ログイン済み → userId で Customer を取得
  if (userId) {
    const existing = await tx.customer.findUnique({ where: { userId } });
    if (existing) {
      return tx.customer.update({
        where: { id: existing.id },
        data: {
          lastName: data.lastName,
          firstName: data.firstName,
          phoneNumber: data.phoneNumber,
          companyName: data.companyName,
        },
        select: { id: true },
      });
    }
  }

  // ゲスト予約 or 未紐づけ → email で upsert（既存ロジック維持）
  return tx.customer.upsert({
    where: { email: data.email },
    create: { ...data, userId },
    update: { ...data, ...(userId ? { userId } : {}) },
    select: { id: true },
  });
}
```

### 重複防止シナリオ検証

| シナリオ                                   | 動作                                                   | 重複？ |
| ------------------------------------------ | ------------------------------------------------------ | ------ |
| 同じメールでゲスト予約を繰り返す           | email upsert → 同一 Customer 更新                      | No     |
| ゲスト予約後に同じメールで Google ログイン | `ensureCustomerLinked` が email マッチで userId セット | No     |
| Google + LINE（同じメール）                | Better Auth accountLinking で同一 User → 同一 userId   | No     |
| Google + LINE（異なるメール）              | ログイン済みで linkSocial() → 同一 User                | No     |
| 管理者が登録した顧客が後からログイン       | email マッチで既存 Customer に userId セット           | No     |

---

## 4. ルーティング・ページ構成

### 新規ルート

```
src/app/(public)/
├── login/
│   └── page.tsx                  # Google/LINE ログインボタン
├── mypage/
│   ├── layout.tsx                # 認証チェック + ensureCustomerLinked
│   ├── page.tsx                  # 予約一覧（ダッシュボード）
│   ├── reservations/
│   │   └── [id]/
│   │       ├── page.tsx          # 予約詳細 + キャンセルボタン
│   │       └── edit/
│   │           └── page.tsx      # 予約変更フォーム
│   └── settings/
│       └── page.tsx              # プロフィール編集 + アカウント連携
```

### 認証フロー

```
/login
  ├── 「Googleでログイン」→ signIn.social({ provider: "google", callbackURL: "/mypage" })
  └── 「LINEでログイン」 → signIn.social({ provider: "line", callbackURL: "/mypage" })

/mypage/layout.tsx (Server Component)
  → getSession() でセッション確認
  → 未認証 → /login にリダイレクト
  → 認証済み → ensureCustomerLinked(user) → children 表示
```

### 予約フォームの変更

```
予約ステップ3（顧客情報入力）
  ├── ログイン済み: 名前・メール・電話番号がプリフィル（編集可能）
  └── 未ログイン: 従来通り手入力

予約完了画面
  └── 未ログインの場合: 「アカウント連携で次回から入力省略」ボタン表示
```

---

## 5. マイページ機能詳細

### 予約一覧 (`/mypage`)

- Customer に紐づく予約を新しい順に表示
- 「変更」「キャンセル」ボタンは期限内のみ表示
- 期限切れは「変更・キャンセルはお電話でお問い合わせください」表示
- ステータスが `COMPLETED` / `CANCELLED` の予約は閲覧のみ

### 予約変更 (`/mypage/reservations/[id]/edit`)

変更可能:

- 日時（空き状況の再チェック必要）
- 人数
- スペース（同ロケーション内）

変更不可:

- ロケーション（変更する場合はキャンセル → 新規予約）

変更フローは既存の予約フォームのコンポーネントを再利用。変更後は料金を再計算し確認画面を表示。

### 予約キャンセル (`/mypage/reservations/[id]`)

詳細画面内に「この予約をキャンセル」ボタン。確認ダイアログ後にキャンセル実行。ステータスを `CANCELLED` に変更し、管理者にメール通知。

### アカウント設定 (`/mypage/settings`)

- プロフィール編集（名前・電話番号）→ Customer テーブルも同期更新
- アカウント連携管理: Google / LINE の連携・解除
  - `linkSocial()` / Account 削除で操作
  - 最低1つの連携は残す制約（最後の1つは解除不可）
- アカウント削除: User を削除し、Customer.userId を null に戻す

---

## 6. 管理画面の変更

### 顧客詳細ページ

既存の顧客詳細にアカウント連携状況を閲覧表示:

```
アカウント連携: Google ✓ / LINE ✗
```

管理者が連携を操作する機能は不要（顧客本人のみ）。

### 設定ページ

「予約設定」セクションに追加:

```
キャンセル期限: [24] 時間前まで
変更期限:       [24] 時間前まで
```

選択肢: 1, 3, 6, 12, 24, 48, 72 時間

---

## 7. セキュリティ

| 対策                       | 実装                                                                   |
| -------------------------- | ---------------------------------------------------------------------- |
| CSRF                       | Better Auth 組み込み                                                   |
| セッション管理             | Better Auth（HTTPOnly Cookie）                                         |
| 予約変更の認可             | Server Action で `customer.userId === session.user.id` を必ずチェック  |
| Account Linking            | `trustedProviders` で信頼済みプロバイダーのみ自動統合                  |
| ログインページのボット対策 | 既存の Turnstile 基盤を流用                                            |
| 他人の予約へのアクセス防止 | 全ての mypage Server Action で所有者チェック                           |
| キャンセル期限の検証       | クライアント（ボタン非表示）+ サーバー（Server Action で二重チェック） |

---

## 8. フェーズ分け

### フェーズ1（今回のスコープ）

1. **DB変更**: `Role.CUSTOMER` 追加、`Customer.userId` FK、Settings フィールド
2. **Better Auth 設定**: LINE プロバイダー追加、`accountLinking` 有効化、ロールデフォルト変更
3. **環境変数**: `LINE_CLIENT_ID`, `LINE_CLIENT_SECRET` 追加
4. **ドメインロジック**: `ensureCustomerLinked`、予約変更・キャンセルコマンド、期限チェック
5. **公開ページ**: `/login`、`/mypage` 一式（予約一覧・詳細・変更・キャンセル・設定）
6. **予約フォーム**: ログイン済み自動入力、完了後のアカウント連携案内
7. **管理画面**: 顧客詳細にアカウント連携表示、キャンセル/変更期限設定

### フェーズ2（将来）

1. **LINE Bot**: Webhook エンドポイント (`/api/line/webhook`)、Reply Message で予約確認
2. **Google カレンダー**: 顧客の Google カレンダーに予約を自動追加

---

## 技術的参考

- [Better Auth - Social Providers](https://better-auth.com/docs/authentication/google)
- [Better Auth - LINE Provider](https://better-auth.com/docs/authentication/line)
- [Better Auth - Account Linking](https://better-auth.com/docs/concepts/users-accounts)
- [Better Auth - Database Hooks Issue #7260](https://github.com/better-auth/better-auth/issues/7260)
