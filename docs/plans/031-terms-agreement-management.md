# 031: 利用規約同意機能

## 概要

予約システムに利用規約同意機能を実装。スペースごとに異なる利用規約を設定でき、予約時に顧客が規約に同意することで法的コンプライアンスを担保する。

## 実装内容

### 1. データモデル（Prisma）

```
Terms (規約マスター)
├── TermsVersion (バージョン管理)
│   ├── content (Lexicalエディタのリッチテキスト)
│   ├── status (DRAFT/PUBLISHED/ARCHIVED)
│   └── isCurrentVersion (有効バージョンフラグ)
└── TermsAgreement (同意記録)
    ├── termsVersionId
    ├── reservationId
    ├── ipHash (SHA-256でハッシュ化)
    ├── userAgent
    └── agreedAt
```

### 2. 管理画面機能

- **規約一覧**: `/admin/terms` - 全規約の一覧表示、有効/無効切り替え
- **規約作成**: `/admin/terms/new` - 新規規約作成フォーム
- **規約詳細**: `/admin/terms/[id]` - バージョン一覧、使用スペース数表示
- **バージョン管理**:
  - 新バージョン作成（DRAFT）
  - 編集（DRAFTのみ）
  - 公開（PUBLISHED）
  - アーカイブ（ARCHIVED）
- **スペース設定**: SpaceFormに規約選択ドロップダウン追加

### 3. 公開UI

- **TermsAgreementDialog**: Radix UI Dialogベースのモーダル
  - スクロール検出（最後まで読む必要あり）
  - チェックボックス同意
  - アクセシビリティ対応

### 4. Server Actions

**管理用 (`src/actions/admin/terms.ts`)**:
- `getTermsList` - 規約一覧取得
- `getActiveTermsForSelect` - ドロップダウン用
- `getTermsById` - 規約詳細
- `createTerms` - 規約作成
- `updateTerms` - 規約更新
- `deleteTerms` - 規約削除
- `toggleTermsActive` - 有効/無効切り替え
- `getTermsVersionById` - バージョン詳細
- `createTermsVersion` - バージョン作成
- `updateTermsVersion` - バージョン更新
- `publishTermsVersion` - バージョン公開
- `archiveTermsVersion` - バージョンアーカイブ
- `deleteTermsVersion` - バージョン削除

**公開用 (`src/actions/public/terms.ts`)**:
- `getTermsForReservation` - 予約時の規約取得
- `recordTermsAgreement` - 同意記録

### 5. 権限設定（RBAC）

`src/lib/permissions.ts` に `terms` リソースを追加:
- SUPER_ADMIN: 全権限
- ADMIN: 全権限
- VIEWER: 閲覧のみ
- EDITOR/USER: なし

## ファイル構成

```
src/
├── actions/
│   ├── admin/terms.ts          # 管理用Server Actions
│   └── public/terms.ts         # 公開用Server Actions
├── app/(admin)/admin/(dashboard)/
│   ├── terms/
│   │   ├── page.tsx            # 規約一覧
│   │   ├── new/page.tsx        # 新規作成
│   │   ├── [id]/
│   │   │   ├── page.tsx        # 規約詳細
│   │   │   └── versions/[versionId]/
│   │   │       ├── page.tsx    # バージョンプレビュー
│   │   │       └── edit/page.tsx # バージョン編集
│   │   └── _components/
│   │       ├── TermsList.tsx
│   │       ├── TermsForm.tsx
│   │       ├── TermsDetailView.tsx
│   │       └── TermsVersionForm.tsx
│   └── spaces/_components/
│       └── SpaceForm.tsx       # 規約選択追加
├── components/site/
│   └── TermsAgreementDialog.tsx # 公開UI
└── lib/
    ├── validations/terms.ts    # Zodスキーマ
    ├── validations/space.ts    # termsId追加
    └── permissions.ts          # terms権限追加
```

## 技術的決定

1. **バージョン管理**: 法的要件として過去バージョンの保持が必要。`isCurrentVersion`フラグで有効バージョンを管理
2. **IPハッシュ化**: プライバシー保護のためSHA-256でハッシュ化して保存
3. **スクロール検出**: `IntersectionObserver`で最後まで読んだことを検出
4. **PPR対応**: Next.js 16のPPRに対応し、動的ページでは`connection()`を使用

## 今後の拡張

- 規約プレビュー機能
- 複数規約の同時適用
- 同意履歴のCSVエクスポート
- 同意失効・再同意フロー

## 関連ファイル

- `prisma/schema.prisma` - Terms, TermsVersion, TermsAgreementモデル
- `prisma/migrations/20260116010114_add_terms_management/`
