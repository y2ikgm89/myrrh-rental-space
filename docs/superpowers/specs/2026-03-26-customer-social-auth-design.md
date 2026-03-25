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
      // calendar.events スコープは含めない（下記「Google Calendar スコープ分離」参照）
    },
    line: {
      clientId: serverEnv.LINE_CLIENT_ID,
      clientSecret: serverEnv.LINE_CLIENT_SECRET,
      scope: ["openid", "profile", "email"],
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

### Google Calendar スコープ分離

Google OAuth のログインスコープから `calendar.events` を削除する。管理者の Google Calendar 同期は、管理画面の設定ページ（`/admin/settings`）から明示的な OAuth 認可フローで行う（Service Account 方式が既に存在するため、OAuth ログインスコープへの依存を解消）。

### Account Linking の動作

- `trustedProviders` に含まれるプロバイダーはメール一致で自動統合
- Google (tanaka@gmail.com) でログイン後、LINE (同じメール) でログイン → 同一 User に統合
- 異なるメールの場合 → ログイン済み状態で `/mypage/settings` から `linkSocial()` で手動連携

### 管理者/顧客のロール分離

ソーシャルログイン後にロールチェックを行い、リダイレクト先を分ける:

- `ADMIN` / `SUPER_ADMIN` / `EDITOR` / `VIEWER` → `/admin` にリダイレクト
- `CUSTOMER` / `USER` → `/mypage` にリダイレクト

管理者メールで顧客がソーシャルログインした場合、Account Linking により既存の ADMIN User に統合され、`/admin` に飛ぶ。`ensureCustomerLinked` は `CUSTOMER` ロール以外では呼ばれないため、管理者に Customer レコードが作られることはない。

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

| 制約                      | 状態 | 効果                                             |
| ------------------------- | ---- | ------------------------------------------------ |
| `Customer.email @unique`  | 既存 | 同じメールの Customer は2件作れない              |
| `Customer.userId @unique` | 新規 | 同じ User に紐づく Customer も2件作れない        |
| `User.email @unique`      | 既存 | 同じメールの User は作れない（Better Auth 管理） |

### Reservation.userId の扱い

既存の `Reservation.userId` は予約作成者（管理者 or 顧客）を示す。顧客がログイン済みで予約した場合、`Reservation.userId` にも `User.id` をセットする。これにより:

- `Customer.userId` → 顧客のアカウント連携（CRM 用途）
- `Reservation.userId` → 個別予約の作成者（監査・追跡用途）

両方を維持する。既存の `Reservation.userId` の `onDelete: SetNull` はそのまま。

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
  // 1. userId で既に紐づけ済みか確認（O(1)、@unique インデックス）
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

  // 3. 完全に新規 → Customer 作成（名前は仮入力、マイページ設定で正式入力を促す）
  // Google/LINE のプロフィール名は姓名分離が不確実なため、name をそのまま lastName に格納
  return prisma.customer.create({
    data: {
      email: user.email,
      lastName: user.name || "未設定",
      firstName: "",
      userId: user.id,
    },
  });
}
```

### 名前の取り扱い

- Google: `user.name` は `"田中 太郎"` 形式だが、全角スペース/半角スペースの混在あり
- LINE: 表示名のみ（例: `"田中太郎"`、姓名分離なし）
- **方針**: 初回ログイン時は `lastName` に `user.name` をそのまま格納。マイページ設定画面で姓名の正式入力を促すバナーを表示。既存 Customer（ゲスト予約で姓名入力済み）にはバナー非表示。

### LINE メールアドレス未登録への対応

LINE アカウントにメールが登録されていない場合、`user.email` が null になる可能性がある。

- LINE Login 後にメールが取得できなかった場合 → `/mypage/settings` にリダイレクトし、メールアドレス入力を必須化
- メール未入力の状態では予約不可（既存の予約フォームバリデーションで自然にブロック）
- メール入力完了後に `ensureCustomerLinked` を再実行

### 呼び出しタイミング

- `/mypage/layout.tsx`（Server Component）で認証チェック後に実行
- `CUSTOMER` ロールの場合のみ実行（管理者ロールではスキップ）
- 紐づけ済みなら `findUnique({ where: { userId } })` で即 return（O(1)）

### 競合状態への対策

複数タブ同時オープンなどで `ensureCustomerLinked` が並行実行された場合、`userId @unique` 制約でエラーが発生する。`upsert` パターンまたは try-catch + リトライで対応:

```typescript
try {
  return await prisma.customer.create({ data: { ... } });
} catch (e) {
  if (isPrismaUniqueConstraintError(e)) {
    // 別タブで既に作成済み → 再取得
    return await prisma.customer.findUniqueOrThrow({ where: { userId: user.id } });
  }
  throw e;
}
```

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
| 管理者メールで顧客がソーシャルログイン     | Account Linking で ADMIN User に統合 → /admin へ       | No     |
| 複数タブで同時にマイページを開く           | userId unique 制約 + try-catch で安全                  | No     |

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

### 認証ヘルパー関数

既存の `verifySession` は未認証時に `/admin/login` へリダイレクトするため、顧客用に別の関数を用意する:

```typescript
// src/shared/lib/auth.ts

// 顧客用: 未認証 → /login、管理者ロール → /admin
async function verifyCustomerSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  const { role } = session.user;
  if (["ADMIN", "SUPER_ADMIN", "EDITOR", "VIEWER"].includes(role)) {
    redirect("/admin");
  }
  return session;
}

// 既存の verifySession / verifyAdminSession はそのまま維持
```

### 認証フロー

```
/login
  ├── 「Googleでログイン」→ signIn.social({ provider: "google", callbackURL: "/mypage" })
  └── 「LINEでログイン」 → signIn.social({ provider: "line", callbackURL: "/mypage" })
  ↓
  ログイン完了後、callbackURL にリダイレクト
  ↓
  /mypage/layout.tsx (Server Component)
    → verifyCustomerSession()
    → CUSTOMER ロール確認
    → ensureCustomerLinked(user)
    → LINE でメール未取得の場合 → /mypage/settings にリダイレクト
    → children 表示
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
  - 期限の基準: `Reservation.startTime` から `Settings.cancellationDeadlineHours` / `modificationDeadlineHours` 時間前
- 期限切れは「変更・キャンセルはお電話でお問い合わせください」表示
- ステータスが `COMPLETED` / `CANCELLED` の予約は閲覧のみ
- 名前未入力（ソーシャルログイン初回）の場合は設定完了を促すバナー表示

### 予約変更 (`/mypage/reservations/[id]/edit`)

変更可能:

- 日時（空き状況の再チェック必要）
- 人数
- スペース（同ロケーション内）

変更不可:

- ロケーション（変更する場合はキャンセル → 新規予約）
- 手動割引 (`manualDiscountAmount`) が適用されている場合 → 変更不可（管理者に連絡を促す）

変更フローは既存の予約フォームのコンポーネントを再利用。変更後は料金を再計算し確認画面を表示。

クーポン:

- 元の予約に適用されていたクーポンは引き継ぐ
- 新しいクーポンの適用は不可（変更フォームにクーポン入力欄を表示しない）

顧客用の変更コマンド (`updateCustomerReservationCommand`) を新設。管理者用 (`updateAdminReservationCommand`) とは分離し、顧客が変更可能なフィールドのみを受け付ける。

### 予約キャンセル (`/mypage/reservations/[id]`)

詳細画面内に「この予約をキャンセル」ボタン。確認ダイアログ後にキャンセル実行。

- ステータスを `CANCELLED` に変更
- 管理者にメール通知
- クーポンが適用されていた場合 → `coupon.usedCount` をデクリメント（再利用可能にする）
- `Customer.totalReservations` はデクリメントしない（履歴として維持）

### アカウント設定 (`/mypage/settings`)

- プロフィール編集（姓・名・電話番号）→ Customer テーブルも同期更新
- メールアドレスは変更不可（Customer.email @unique のキーのため）
- アカウント連携管理: Google / LINE の連携・解除
  - `linkSocial()` / Account 削除で操作
  - 最低1つの連携は残す制約（最後の1つは解除不可）
- アカウント削除:
  - Better Auth の User を削除 → `onDelete: SetNull` により `Customer.userId` = null、`Reservation.userId` = null
  - Customer レコードと予約履歴はビジネスデータとして保持（削除しない）
  - Session / Account レコードは `onDelete: Cascade` で自動削除

---

## 6. 管理画面の変更

### 顧客詳細ページ

既存の顧客詳細にアカウント連携状況を閲覧表示:

```
アカウント連携: Google ✓ / LINE ✗
```

`Customer.userId` が存在する場合、`User` の `Account[]` を検索してプロバイダー一覧を表示。管理者が連携を操作する機能は不要（顧客本人のみ）。

### 設定ページ

「予約設定」セクションに追加:

```
キャンセル期限: [24] 時間前まで
変更期限:       [24] 時間前まで
```

選択肢: 1, 3, 6, 12, 24, 48, 72 時間

---

## 7. セキュリティ

| 対策                       | 実装                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------- |
| CSRF                       | Better Auth 組み込み                                                                  |
| セッション管理             | Better Auth（HTTPOnly Cookie）                                                        |
| 予約変更の認可             | Server Action で `customer.userId === session.user.id` を必ずチェック                 |
| Account Linking            | `trustedProviders` で信頼済みプロバイダーのみ自動統合                                 |
| 管理者/顧客ロール分離      | ソーシャルログイン後にロールチェックしてリダイレクト先を分離                          |
| ログインページのボット対策 | 既存の Turnstile 基盤を流用                                                           |
| 他人の予約へのアクセス防止 | 全ての mypage Server Action で所有者チェック                                          |
| キャンセル期限の検証       | クライアント（ボタン非表示）+ サーバー（Server Action で二重チェック）                |
| callbackURL のリダイレクト | 相対パス (`/mypage`) のみ使用。Better Auth の `trustedOrigins` で外部リダイレクト防止 |

---

## 8. フェーズ分け

### フェーズ1（今回のスコープ）

1. **DB変更**: `Role.CUSTOMER` 追加、`Customer.userId` FK、Settings フィールド
2. **Better Auth 設定**: LINE プロバイダー追加、`accountLinking` 有効化、ロールデフォルト変更、Google Calendar スコープ分離
3. **環境変数**: `LINE_CLIENT_ID`, `LINE_CLIENT_SECRET` 追加
4. **認証ヘルパー**: `verifyCustomerSession` 新設
5. **ドメインロジック**: `ensureCustomerLinked`、`updateCustomerReservationCommand`、`cancelCustomerReservationCommand`、期限チェック、クーポンロールバック
6. **公開ページ**: `/login`、`/mypage` 一式（予約一覧・詳細・変更・キャンセル・設定）
7. **予約フォーム**: ログイン済み自動入力、完了後のアカウント連携案内
8. **管理画面**: 顧客詳細にアカウント連携表示、キャンセル/変更期限設定

### フェーズ2（将来）

1. **LINE Bot**: Webhook エンドポイント (`/api/line/webhook`)、Reply Message で予約確認
2. **Google カレンダー**: 顧客の Google カレンダーに予約を自動追加

---

## 技術的参考

- [Better Auth - Social Providers](https://better-auth.com/docs/authentication/google)
- [Better Auth - LINE Provider](https://better-auth.com/docs/authentication/line)
- [Better Auth - Account Linking](https://better-auth.com/docs/concepts/users-accounts)
- [Better Auth - Database Hooks Issue #7260](https://github.com/better-auth/better-auth/issues/7260)
- [Better Auth - Database Hooks Issue #4614](https://github.com/better-auth/better-auth/issues/4614)
