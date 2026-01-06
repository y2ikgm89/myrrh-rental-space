# 顧客名の設計方針

## 概要

顧客管理機能では、姓名を分けて管理する設計を採用しています。このドキュメントでは、その理由と実装方針を説明します。

## 姓名を分ける理由

### 1. 国際化対応

- **多様な名前形式への対応**: 日本（姓→名）、欧米（名→姓）、中国・韓国（姓→名）など、文化によって名前の順序が異なる
- **将来的な多言語対応**: 多言語対応時に、言語ごとに適切な表示順序を実装可能
- **名前の構造の違い**: ミドルネーム、複数の姓など、様々な名前構造に対応可能

### 2. メール送信時のパーソナライゼーション

- **適切な敬称の付与**: 「山田太郎様」「John Smith様」など、文化に応じた適切な敬称を付与可能
- **名前の表示順序**: 日本語では「姓 名 様」、英語では「FirstName LastName様」など、適切な順序で表示

### 3. ソート・検索の精度向上

- **姓でのソート**: 姓でソートすることで、より直感的な一覧表示が可能
- **部分一致検索**: 姓のみ、名のみでの検索が可能
- **複合インデックス**: `[lastName, firstName]`の複合インデックスで効率的な検索・ソート

### 4. ビジネス環境での一般的な慣習

- **日本のビジネス環境**: 姓名を分けて管理することが一般的
- **データベース設計のベストプラクティス**: 正規化の観点から、姓名を分ける方が柔軟性が高い

## データベース設計

### Customersテーブル

```prisma
model Customer {
  id              String   @id @default(uuid())
  lastName        String   @db.VarChar(50)  // 姓（必須）
  firstName       String   @db.VarChar(50)  // 名（必須）
  email           String   @unique @db.VarChar(255)
  // ... その他のフィールド
  
  @@index([lastName])
  @@index([lastName, firstName])  // 姓名での検索・ソート用
}
```

### インデックス設計

- **`lastName`**: 姓での検索・ソート用
- **`[lastName, firstName]`**: 姓名での検索・ソート用（複合インデックス）

## アプリケーション層での実装

### フルネームの生成

```typescript
// src/lib/customer.ts
export function getCustomerFullName(
  customer: { lastName: string; firstName: string },
  locale: string = 'ja'
): string {
  if (locale === 'ja') {
    // 日本語: 姓 名
    return `${customer.lastName} ${customer.firstName}`
  } else {
    // 英語など: FirstName LastName
    return `${customer.firstName} ${customer.lastName}`
  }
}

// 敬称付きフルネーム
export function getCustomerFullNameWithHonorific(
  customer: { lastName: string; firstName: string },
  locale: string = 'ja'
): string {
  const fullName = getCustomerFullName(customer, locale)
  return locale === 'ja' ? `${fullName}様` : `${fullName}様`
}
```

### 予約フォームでの入力

```typescript
// src/components/reservation/ReservationForm.tsx
const [formData, setFormData] = useState({
  lastName: '',
  firstName: '',
  email: '',
  // ...
})

// バリデーション
const reservationSchema = z.object({
  lastName: z.string().min(1).max(50, '姓は50文字以内で入力してください'),
  firstName: z.string().min(1).max(50, '名は50文字以内で入力してください'),
  email: z.string().email('有効なメールアドレスを入力してください'),
  // ...
})
```

### メールテンプレートでの使用

```typescript
// src/components/emails/reservation-confirmation.tsx
import { getCustomerFullNameWithHonorific } from '@/lib/customer'

export function ReservationConfirmationEmail({
  reservation,
}: {
  reservation: {
    customer: { lastName: string; firstName: string; email: string }
    // ...
  }
}) {
  const customerName = getCustomerFullNameWithHonorific(
    reservation.customer,
    'ja'
  )

  return (
    <Email>
      <Text>お客様: {customerName}</Text>
      {/* ... */}
    </Email>
  )
}
```

## バリデーション

### Zodスキーマ

```typescript
// src/lib/validations/customer.ts
import { z } from 'zod'

export const customerSchema = z.object({
  lastName: z.string().min(1, '姓を入力してください').max(50, '姓は50文字以内で入力してください'),
  firstName: z.string().min(1, '名を入力してください').max(50, '名は50文字以内で入力してください'),
  email: z.string().email('有効なメールアドレスを入力してください').max(255),
  phoneNumber: z.string().regex(/^[0-9-+()]+$/).max(20).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  status: customerStatusEnum.optional(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
})

export const customerUpdateSchema = customerSchema.partial().extend({
  email: z.string().email().max(255).optional(), // 更新時はメールアドレス変更不可
})
```

## 検索・ソート機能

### 顧客一覧での検索

```typescript
// src/app/(admin)/admin/customers/page.tsx
const where: any = {}
if (searchParams.search) {
  where.OR = [
    { lastName: { contains: searchParams.search, mode: 'insensitive' } },
    { firstName: { contains: searchParams.search, mode: 'insensitive' } },
    { email: { contains: searchParams.search, mode: 'insensitive' } },
    { phoneNumber: { contains: searchParams.search, mode: 'insensitive' } },
  ]
}

// ソート
const orderBy: any = {}
if (searchParams.sortBy === 'name') {
  orderBy.lastName = searchParams.sortOrder || 'asc'
  orderBy.firstName = searchParams.sortOrder || 'asc'
} else if (searchParams.sortBy) {
  orderBy[searchParams.sortBy] = searchParams.sortOrder || 'asc'
}
```

## 将来の拡張

### 多言語対応

将来的に多言語対応を行う場合、以下のように拡張可能：

```typescript
// 言語ごとの名前表示順序
const nameDisplayOrder = {
  ja: (lastName: string, firstName: string) => `${lastName} ${firstName}`,
  en: (lastName: string, firstName: string) => `${firstName} ${lastName}`,
  zh: (lastName: string, firstName: string) => `${lastName} ${firstName}`,
  ko: (lastName: string, firstName: string) => `${lastName} ${firstName}`,
}
```

### ミドルネーム対応

将来的にミドルネームが必要になった場合：

```prisma
model Customer {
  // ...
  lastName        String   @db.VarChar(50)
  firstName       String   @db.VarChar(50)
  middleName      String?  @db.VarChar(50)  // 追加可能
  // ...
}
```

## 参考資料

- [`DATABASE_DESIGN.md`](./DATABASE_DESIGN.md) - データベース設計
- [`API.md`](./API.md) - API仕様（顧客管理関連）
- [`FEATURE_REQUIREMENTS.md`](./FEATURE_REQUIREMENTS.md) - 機能要件（顧客管理）
