# 048 - スタッフ招待フロー

## 概要

管理者が直接パスワードを設定する方式から、招待メールによるスタッフ自身でのパスワード設定フローに移行。
既存のLoginToken機能を活用してセキュリティを強化。

## 背景

- 現状: 管理者がパスワードを設定 → パスワード共有が必要
- 問題: セキュリティ面で懸念、パスワード管理の煩雑さ
- 解決: 招待フロー + ログインURL生成活用

## 新しいフロー

```
管理者: メールアドレス入力 → 「招待を送信」ボタン
    ↓
システム: 招待トークン生成 → 招待メール送信
    ↓
スタッフ: メール受信 → URLクリック → パスワード設定
    ↓
完了: 設定したパスワードでログイン可能
```

## フェーズ

### Phase 1: 招待トークン・メール送信基盤

**新規ファイル:**

- `src/admin/actions/staff-invitation.ts` - 招待Server Actions
- `src/admin/lib/validations/staff-invitation.ts` - Zodスキーマ
- `src/public/emails/staff-invitation.tsx` - 招待メールテンプレート

**変更ファイル:**

- `prisma/schema.prisma` - StaffInvitation モデル追加

**モデル設計:**

```prisma
model StaffInvitation {
  id        String   @id @default(cuid())
  email     String
  token     String   @unique
  role      Role     @default(USER)
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())
  createdBy String

  creator   User     @relation(fields: [createdBy], references: [id])
}
```

### Phase 2: パスワード設定画面

**新規ファイル:**

- `src/app/(admin)/admin/setup/[token]/page.tsx` - パスワード設定ページ
- `src/app/(admin)/admin/setup/[token]/_components/SetupForm.tsx` - パスワード設定フォーム

**機能:**

- トークン検証（有効期限、使用済みチェック）
- パスワード入力（確認入力付き）
- ユーザー作成 + 招待トークン消費
- 自動ログイン → ダッシュボードへリダイレクト

### Phase 3: 登録フォーム変更（招待フロー）

**変更ファイル:**

- `src/app/(admin)/admin/(dashboard)/staff/new/page.tsx` - 招待フォームに変更
- `src/app/(admin)/admin/(dashboard)/staff/_components/InviteForm.tsx` - 新規: 招待フォーム

**UIの変更:**

- 「新規スタッフ」→「スタッフを招待」
- パスワード欄削除
- ロール選択のみ（ADMIN/USER）
- 「招待を送信」ボタン

### Phase 4: 検証 ✅

- type-check 成功
- lint 成功
- build 成功

## 完了 (2026-01-19)

すべてのフェーズが完了しました。

**新規ファイル:**

- `prisma/migrations/20260118153836_add_staff_invitation/` - DBマイグレーション
- `src/admin/actions/staff-invitation.ts` - 招待Server Actions（送信/検証/パスワード設定/再送/削除）
- `src/admin/lib/validations/staff-invitation.ts` - Zodバリデーションスキーマ
- `src/public/emails/staff-invitation.tsx` - 招待メールテンプレート
- `src/app/(admin)/admin/(auth)/setup/[token]/page.tsx` - パスワード設定ページ
- `src/app/(admin)/admin/(auth)/setup/[token]/_components/SetupForm.tsx` - パスワード設定フォーム
- `src/app/(admin)/admin/(dashboard)/staff/` - スタッフ管理ページ一式
- `src/app/(admin)/admin/(dashboard)/staff/_components/InviteForm.tsx` - 招待フォーム
- `src/app/(admin)/admin/(dashboard)/staff/_components/InvitationActions.tsx` - 招待操作（再送/削除）
- `src/app/(admin)/admin/(dashboard)/staff/_components/UserActions.tsx` - ユーザー操作

**変更ファイル:**

- `prisma/schema.prisma` - StaffInvitationモデル追加
- `src/shared/lib/email-service.ts` - sendStaffInvitationEmail関数追加

## 削除するもの（今後）

- `LoginTokenGenerator` コンポーネント（招待フローに統合）
- UserForm の新規作成時パスワード欄

## 設計判断

1. **招待トークン有効期限**: 7日（一般的なSaaS招待フロー）
2. **再送機能**: スタッフ一覧から「招待を再送」可能
3. **招待ステータス**: スタッフ一覧に「招待中」ステータス表示
4. **既存LoginToken**: 廃止（招待フローに統合）
