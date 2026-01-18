# 046: 顧客管理 - 新規顧客作成機能

| 項目 | 内容 |
|------|------|
| 作成日 | 2026-01-18 |
| ステータス | 完了 |
| 関連 | Plan 045 (Admin Reservation Creation) |

## 概要

管理画面の顧客管理に新規顧客作成機能を追加する。
予約フォームからの顧客検索だけでなく、顧客管理画面から直接顧客を登録できるようにする。

## 背景

- 現在の顧客管理は閲覧・ステータス変更・メモ更新のみ
- 顧客は予約時に自動作成されるが、事前登録ができない
- 電話予約や来店予約時に顧客を先に登録したいケースがある

## 実装内容

### Phase 1: Server Action

`src/admin/actions/customer.ts` に `createCustomer` を追加。

| フィールド | 型 | 必須 | 説明 |
|------------|-----|------|------|
| lastName | string | ✅ | 姓 |
| firstName | string | ✅ | 名 |
| email | string | ✅ | メールアドレス（ユニーク） |
| phoneNumber | string | - | 電話番号 |
| address | string | - | 住所 |
| notes | string | - | メモ |

### Phase 2: CustomerForm コンポーネント

`src/app/(admin)/admin/(dashboard)/customers/_components/CustomerForm.tsx`

- React Hook Form + Zod バリデーション
- useActionState による Server Action 連携
- 作成成功時は顧客一覧へリダイレクト

### Phase 3: 新規顧客ページ

`src/app/(admin)/admin/(dashboard)/customers/new/page.tsx`

- Server Component でシンプルに構成
- CustomerForm をレンダリング

### Phase 4: 顧客一覧に新規ボタン追加

`src/app/(admin)/admin/(dashboard)/customers/page.tsx`

- ヘッダー右側に「新規顧客」ボタンを追加

## 技術仕様

- **バリデーション**: Zod 4
- **フォーム**: React Hook Form + useActionState
- **権限**: `withPermission('customer', 'create')`
- **パターン**: Plan 045 の ReservationForm と同様のパターン

## チェックリスト

- [x] createCustomer Server Action
- [x] CustomerForm コンポーネント
- [x] 新規顧客ページ
- [x] 顧客一覧にボタン追加
- [x] type-check / lint / build

## 完了条件

- `/admin/customers` に「新規顧客」ボタンが表示される
- `/admin/customers/new` で顧客を作成できる
- 作成後、顧客一覧に表示される
