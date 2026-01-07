# ドキュメントインデックス

> **Note**: このディレクトリには、レンタルスペース管理システムの詳細な技術ドキュメントが含まれています。プロジェクト全体の概要とセットアップ手順については、[`AGENTS.md`](../AGENTS.md)を参照してください。

## 実装方針

**後方互換性を考慮しないクリーンな実装**: このプロジェクトは、最新の公式ベストプラクティスに準拠したクリーンでモダンな実装を優先します。古いバージョンや非推奨APIとの後方互換性は維持しません。すべての実装は、フレームワークとライブラリの最新の安定版を使用し、レガシーな回避策なしに公式推奨事項に従う必要があります。

**主要原則**:
- Next.js 16、React 19、Prisma 7、Auth.js 5などの最新の安定版を使用
- 公式のベストプラクティスと推奨パターンに従う（非推奨APIは使用しない）
- レガシーなアプローチよりもモダンなパターン（Server Components、Server Actions、JWTセッション）を優先
- 非推奨のコードパターンを削除し、モダンな代替手段に置き換える
- 本番環境の安定性に絶対に必要な場合を除き、ポリフィルや互換性レイヤーは使用しない

---

## ドキュメント構造

ドキュメントは以下のカテゴリに分類されています：

- **`requirements/`** - 要件定義ドキュメント
- **`architecture/`** - アーキテクチャ・設計ドキュメント
- **`development/`** - 開発・技術詳細ドキュメント
- **`deployment/`** - デプロイメント・運用ドキュメント
- **`security/`** - セキュリティドキュメント

---

## ドキュメント一覧

### 要件定義ドキュメント (`requirements/`)

#### [`requirements/FEATURE_REQUIREMENTS.md`](./requirements/FEATURE_REQUIREMENTS.md)
機能要件の詳細、要件精査結果、実装優先順位とフェーズを記載しています。

**読者**: プロダクトマネージャー、開発者、QAエンジニア  
**内容**: 公開ページ要件、管理画面要件、実装優先順位、要件精査結果

#### [`requirements/EMAIL_REQUIREMENTS.md`](./requirements/EMAIL_REQUIREMENTS.md)
メール送信機能の詳細な要件定義、メールタイプ、送信タイミング、技術要件、セキュリティ要件を記載しています。

**読者**: 開発者、QAエンジニア、プロダクトマネージャー  
**内容**: メール送信の種類とタイミング、テンプレート要件、技術要件、セキュリティ要件、監視・ログ要件

#### [`requirements/SETTINGS_REQUIREMENTS.md`](./requirements/SETTINGS_REQUIREMENTS.md)
管理画面の設定画面（`/admin/settings`）の詳細な要件定義、設定項目、UI/UX設計、Server Actions仕様を記載しています。

**読者**: 開発者、QAエンジニア、プロダクトマネージャー  
**内容**: サイト基本情報、連絡先情報、メール設定、SEO設定、予約設定、通知設定、その他の設定、データベース設計、バリデーション

**Note**: ページ管理機能（`/admin/pages`）については、[`requirements/FEATURE_REQUIREMENTS.md`](./requirements/FEATURE_REQUIREMENTS.md)の「ページ管理」セクションを参照してください。公開ページ（ブログ・お知らせを除く）のコンテンツをリッチテキストエディタで管理する機能です。

**Note**: 顧客管理機能（`/admin/customers`）については、[`requirements/FEATURE_REQUIREMENTS.md`](./requirements/FEATURE_REQUIREMENTS.md)の「顧客管理」セクションを参照してください。予約した顧客のプロフィールを一元管理し、顧客の状態を確認・管理する機能です。

#### [`requirements/BLOG_REQUIREMENTS.md`](./requirements/BLOG_REQUIREMENTS.md)
ブログ機能の詳細な要件定義、お知らせ機能との使い分け、SEO要件、コンテンツ管理要件を記載しています。

**読者**: 開発者、QAエンジニア、プロダクトマネージャー  
**内容**: ブログ機能の要件定義、お知らせ機能との使い分け、SEO要件、コンテンツ管理要件

#### [`requirements/JWT_AUTH_REQUIREMENTS.md`](./requirements/JWT_AUTH_REQUIREMENTS.md)
JWT認証システムの詳細な要件定義、実装要件、セキュリティ要件、テスト要件を記載しています。

**読者**: バックエンド開発者、セキュリティ担当者  
**内容**: JWT認証の機能要件、技術要件、セキュリティ要件、実装パターン、テスト要件、運用要件

#### [`requirements/TURNSTILE_REQUIREMENTS.md`](./requirements/TURNSTILE_REQUIREMENTS.md)
Cloudflare Turnstileの詳細な要件定義、実装要件、セキュリティ要件、テスト要件を記載しています。

**読者**: 全開発者、セキュリティ担当者  
**内容**: Cloudflare Turnstileの機能要件、技術要件、セキュリティ要件、実装パターン、テスト要件、運用要件

#### [`requirements/DDOS_PROTECTION_REQUIREMENTS.md`](./requirements/DDOS_PROTECTION_REQUIREMENTS.md)
DDoS対策の詳細な要件定義、実装要件、監視要件を記載しています。

**読者**: 全開発者、セキュリティ担当者、DevOpsエンジニア  
**内容**: DDoS攻撃の種類と対策、Cloudflare DDoS保護（無料プラン）、Cloud Run側の対策、アプリケーション側の対策、監視とアラート

#### [`requirements/ABUSE_PROTECTION_REQUIREMENTS.md`](./requirements/ABUSE_PROTECTION_REQUIREMENTS.md)
荒らし対策の詳細な要件定義、実装要件、監視要件を記載しています。

**読者**: 全開発者、セキュリティ担当者  
**内容**: IPブロック機能、異常アクセスパターンの検出、スパム対策、監視とアラート

#### [`requirements/TEST_REQUIREMENTS.md`](./requirements/TEST_REQUIREMENTS.md)
テスト要件定義、テスト環境の設定、CI/CDでのテスト実行、テストデータ管理を記載しています。

**読者**: 全開発者、QAエンジニア  
**内容**: テストフレームワークとツール、テスト環境の設定、テスト構造の詳細、テストカバレッジ要件、CI/CDでのテスト実行、モック/スタブの使用方法、テストデータ管理、パフォーマンステスト、アクセシビリティテスト、セキュリティテスト

#### [`requirements/TYPE_SAFETY_REQUIREMENTS.md`](./requirements/TYPE_SAFETY_REQUIREMENTS.md)
型安全・型定義の包括的な要件定義を記載しています。TypeScript Strict Mode、型定義の統一、バリデーションスキーマの統一、Prisma型定義、Zod型定義、React 19 + Next.js 16の型安全性、Server Actionsの型安全性、Route Handlersの型安全性、URLクエリパラメータの型安全性、エラーハンドリングの型安全性、コンポーネントPropsの型定義、型定義の配置と命名規則、型安全性チェックリスト、不足している要件の洗い出しを網羅しています。

**読者**: 全開発者、アーキテクト  
**内容**: 型安全性の要件定義、型定義の統一と一元管理、バリデーションスキーマの統一、Prisma型定義の活用、Zod型定義の活用、React 19 + Next.js 16の型安全性、Server Actionsの型安全性、Route Handlersの型安全性、URLクエリパラメータの型安全性、エラーハンドリングの型安全性、コンポーネントPropsの型定義、型定義の配置と命名規則、型安全性チェックリスト、不足している要件の洗い出し、実装優先順位

#### [`requirements/TURBOPACK_REQUIREMENTS.md`](./requirements/TURBOPACK_REQUIREMENTS.md)
Turbopack要件定義、設定方法、パフォーマンス要件、移行要件を記載しています。

**読者**: 全開発者  
**内容**: Turbopack概要、設定方法、パフォーマンス要件、移行戦略

#### [`requirements/NUQS_REQUIREMENTS.md`](./requirements/NUQS_REQUIREMENTS.md)
nuqsライブラリの採用箇所と実装要件を記載しています。

**読者**: 全開発者  
**内容**: nuqs概要、採用箇所、実装要件、型安全性

#### [`requirements/ARCHITECTURE_IMPROVEMENT_REQUIREMENTS.md`](./requirements/ARCHITECTURE_IMPROVEMENT_REQUIREMENTS.md)
Next.js 16、React 19、Prisma 7の最新公式ベストプラクティスに準拠したアーキテクチャ改善の詳細な要件定義を記載しています。

**読者**: アーキテクト、シニア開発者  
**内容**: 現状分析、改善要件、実装優先順位

### アーキテクチャ・設計ドキュメント (`architecture/`)

#### [`architecture/ARCHITECTURE.md`](./architecture/ARCHITECTURE.md)
システム全体のアーキテクチャ設計、技術スタックの詳細、アーキテクチャパターン、技術検証結果を記載しています。

**読者**: アーキテクト、シニア開発者、新規メンバー  
**内容**: システムアーキテクチャ、技術スタック詳細、データフロー、デプロイメントアーキテクチャ、技術検証結果

#### [`architecture/DATABASE_DESIGN.md`](./architecture/DATABASE_DESIGN.md)
データベーススキーマ設計、Prismaベストプラクティス、インデックス設計、マイグレーション管理を記載しています。

**読者**: バックエンド開発者、データベース管理者  
**内容**: テーブル設計、リレーション定義、インデックス戦略、Prisma設定

#### [`architecture/PROJECT_STRUCTURE.md`](./architecture/PROJECT_STRUCTURE.md)
プロジェクトのディレクトリ構成、ファイル命名規則、レンダリング戦略、キャッシュ戦略を記載しています。

**読者**: 全開発者  
**内容**: ディレクトリ構造、ファイル命名規則、Server Components vs Client Components、レンダリング戦略


### 開発・技術詳細ドキュメント (`development/`)

#### [`development/API.md`](./development/API.md)
Server ActionsとRoute HandlersのAPI仕様、エラーハンドリング、バリデーション、認証・認可を記載しています。

**読者**: フロントエンド開発者、バックエンド開発者  
**内容**: Server Actions仕様、Route Handlers仕様、エラーハンドリング、バリデーションスキーマ

#### [`development/BEST_PRACTICES.md`](./development/BEST_PRACTICES.md)
Next.js 16、React 19、Prisma 7、Auth.js 5の最新の公式推奨に基づくベストプラクティスガイドを記載しています。

**読者**: 全開発者  
**内容**: Server Components優先アーキテクチャ、Server Actionsのベストプラクティス、Prisma 7のクエリ最適化、Auth.js 5の設定、エラーハンドリング、パフォーマンス最適化

#### [`development/CACHING_STRATEGY.md`](./development/CACHING_STRATEGY.md)
Next.js 16 App Routerの最新のキャッシングAPIに基づく詳細なキャッシング戦略を記載しています。

**読者**: 全開発者  
**内容**: キャッシングAPI一覧（unstable_cache、unstable_noStore、revalidatePath、revalidateTag等）、キャッシングパターン、ベストプラクティス、トラブルシューティング

#### [`development/BUN_RUNTIME.md`](./development/BUN_RUNTIME.md)
Bunランタイムの完全対応ガイド、開発環境・本番環境での使用方法、パフォーマンス最適化を記載しています。

**読者**: 全開発者  
**内容**: Bunランタイム対応状況、開発環境設定、本番環境設定、パフォーマンス最適化

#### [`development/PRISMA_7.md`](./development/PRISMA_7.md)
Prisma 7でのインポート方法、移行手順、ベストプラクティスを記載しています。

**読者**: 全開発者  
**内容**: Prisma 7でのインポート方法、カスタム出力パスの設定、推奨パターン、移行チェックリスト

#### [`development/TECH_STACK_VERSIONS.md`](./development/TECH_STACK_VERSIONS.md)
技術スタックの最新バージョン情報、アップグレード推奨事項、セキュリティ情報を記載しています。

**読者**: 全開発者、DevOpsエンジニア  
**内容**: 各技術の最新安定版、ベータ版情報、アップグレード推奨事項、セキュリティ脆弱性情報

### デプロイメント・運用ドキュメント (`deployment/`)

#### [`deployment/DEPLOYMENT.md`](./deployment/DEPLOYMENT.md)
Google Cloud Runへのデプロイ手順、Supabaseセットアップ、CI/CDパイプライン、環境変数管理を記載しています。

**読者**: DevOpsエンジニア、運用担当者  
**内容**: Cloud Runデプロイ手順、Supabase設定、CI/CD設定、環境変数管理、ロールバック手順

#### [`deployment/CLOUDFLARE_CDN.md`](./deployment/CLOUDFLARE_CDN.md)
Cloudflare CDN統合ガイド、キャッシュ戦略設計、Next.js設定、Cloudflare設定手順を記載しています。

**読者**: DevOpsエンジニア、運用担当者  
**内容**: Cloudflare CDN統合、キャッシュ戦略、Next.js設定、Cloudflare設定、パフォーマンス最適化

#### [`deployment/DOCKER.md`](./deployment/DOCKER.md)
Docker設定の詳細、Dockerfile設計、docker-compose.yml設定、ベストプラクティスを記載しています。

**読者**: DevOpsエンジニア、開発者  
**内容**: Dockerfile設計、マルチステージビルド、docker-compose.yml設定、トラブルシューティング

### セキュリティドキュメント (`security/`)

#### [`security/SECURITY.md`](./security/SECURITY.md)
セキュリティポリシー、ベストプラクティス、認証・認可、入力検証、セキュリティヘッダーを記載しています。

**読者**: 全開発者、セキュリティ担当者  
**内容**: セキュリティ方針、認証・認可、入力検証、SQLインジェクション対策、XSS対策、環境変数管理

---

## 読者別推奨読書順序

### 新規開発者

1. [`AGENTS.md`](../AGENTS.md) - プロジェクト全体の概要とセットアップ
2. [`architecture/PROJECT_STRUCTURE.md`](./architecture/PROJECT_STRUCTURE.md) - プロジェクト構造の理解
3. [`architecture/ARCHITECTURE.md`](./architecture/ARCHITECTURE.md) - システムアーキテクチャの理解
4. [`development/API.md`](./development/API.md) - API仕様の理解
5. [`architecture/DATABASE_DESIGN.md`](./architecture/DATABASE_DESIGN.md) - データベース設計の理解

### フロントエンド開発者

1. [`AGENTS.md`](../AGENTS.md) - プロジェクト概要
2. [`architecture/PROJECT_STRUCTURE.md`](./architecture/PROJECT_STRUCTURE.md) - プロジェクト構造
3. [`requirements/FEATURE_REQUIREMENTS.md`](./requirements/FEATURE_REQUIREMENTS.md) - 機能要件
4. [`development/API.md`](./development/API.md) - API仕様
5. [`architecture/ARCHITECTURE.md`](./architecture/ARCHITECTURE.md) - アーキテクチャ理解

### バックエンド開発者

1. [`AGENTS.md`](../AGENTS.md) - プロジェクト概要
2. [`architecture/ARCHITECTURE.md`](./architecture/ARCHITECTURE.md) - システムアーキテクチャ
3. [`architecture/DATABASE_DESIGN.md`](./architecture/DATABASE_DESIGN.md) - データベース設計
4. [`development/API.md`](./development/API.md) - API仕様
5. [`security/SECURITY.md`](./security/SECURITY.md) - セキュリティポリシー
6. [`requirements/JWT_AUTH_REQUIREMENTS.md`](./requirements/JWT_AUTH_REQUIREMENTS.md) - JWT認証要件定義
7. [`requirements/TURNSTILE_REQUIREMENTS.md`](./requirements/TURNSTILE_REQUIREMENTS.md) - Cloudflare Turnstile要件定義
8. [`requirements/TEST_REQUIREMENTS.md`](./requirements/TEST_REQUIREMENTS.md) - テスト要件定義

### DevOpsエンジニア

1. [`AGENTS.md`](../AGENTS.md) - プロジェクト概要
2. [`deployment/DEPLOYMENT.md`](./deployment/DEPLOYMENT.md) - デプロイメント手順
3. [`deployment/DOCKER.md`](./deployment/DOCKER.md) - Docker設定
4. [`deployment/CLOUDFLARE_CDN.md`](./deployment/CLOUDFLARE_CDN.md) - Cloudflare CDN統合
5. [`architecture/ARCHITECTURE.md`](./architecture/ARCHITECTURE.md) - システムアーキテクチャ
6. [`security/SECURITY.md`](./security/SECURITY.md) - セキュリティポリシー

### プロダクトマネージャー

1. [`AGENTS.md`](../AGENTS.md) - プロジェクト概要
2. [`requirements/FEATURE_REQUIREMENTS.md`](./requirements/FEATURE_REQUIREMENTS.md) - 機能要件
3. [`architecture/ARCHITECTURE.md`](./architecture/ARCHITECTURE.md) - システムアーキテクチャ（概要）

---

## ドキュメント間の参照関係

```
AGENTS.md (プロジェクト全体の仕様書)
    ├── 技術スタック情報の主要な情報源
    ├── セットアップ手順
    └── コーディング規約

docs/
    ├── requirements/
    │   ├── FEATURE_REQUIREMENTS.md
    │   │   ├── AGENTS.md を参照（技術スタック）
    │   │   └── 要件精査結果を含む
    │   │
    │   ├── EMAIL_REQUIREMENTS.md
    │   │   ├── FEATURE_REQUIREMENTS.md を参照（機能要件概要）
    │   │   └── development/API.md を参照（Server Actions統合）
    │   │
    │   ├── SETTINGS_REQUIREMENTS.md
    │   │   ├── FEATURE_REQUIREMENTS.md を参照（機能要件概要）
    │   │   ├── architecture/DATABASE_DESIGN.md を参照（Settingsテーブル設計）
    │   │   ├── development/API.md を参照（Server Actions仕様）
    │   │   └── EMAIL_REQUIREMENTS.md を参照（メール設定との連携）
    │   │
    │   ├── JWT_AUTH_REQUIREMENTS.md
    │   │   ├── security/SECURITY.md を参照（セキュリティポリシー）
    │   │   ├── architecture/ARCHITECTURE.md を参照（認証フロー）
    │   │   └── FEATURE_REQUIREMENTS.md を参照（認証要件）
    │   │
    │   ├── TEST_REQUIREMENTS.md
    │   │   ├── AGENTS.md を参照（テスト手順）
    │   │   ├── BLOG_REQUIREMENTS.md を参照（ブログ機能のテスト要件）
    │   │   ├── JWT_AUTH_REQUIREMENTS.md を参照（JWT認証のテスト要件）
    │   │   ├── development/BUN_RUNTIME.md を参照（Bun test設定）
    │   │   └── deployment/DEPLOYMENT.md を参照（CI/CDでのテスト実行）
    │   │
    │   ├── TYPE_SAFETY_REQUIREMENTS.md
    │   │   ├── ARCHITECTURE_IMPROVEMENT_REQUIREMENTS.md を参照（型安全性の向上要件）
    │   │   ├── development/BEST_PRACTICES.md を参照（型安全性のベストプラクティス）
    │   │   ├── development/API.md を参照（Server ActionsとRoute Handlersの型定義）
    │   │   ├── architecture/DATABASE_DESIGN.md を参照（Prisma型定義）
    │   │   ├── architecture/PROJECT_STRUCTURE.md を参照（型定義の配置）
    │   │   ├── NUQS_REQUIREMENTS.md を参照（URLクエリパラメータの型定義）
    │   │   └── development/PRISMA_7.md を参照（Prisma 7のインポート方法）
    │   │
    │   ├── TURNSTILE_REQUIREMENTS.md
    │   │   ├── security/SECURITY.md を参照（セキュリティポリシー）
    │   │   ├── development/API.md を参照（Server Actions、Route Handlers）
    │   │   ├── development/BEST_PRACTICES.md を参照（実装パターン）
    │   │   └── TEST_REQUIREMENTS.md を参照（テスト要件）
    │   │
    │   ├── DDOS_PROTECTION_REQUIREMENTS.md
    │   │   ├── security/SECURITY.md を参照（セキュリティポリシー）
    │   │   ├── deployment/CLOUDFLARE_CDN.md を参照（Cloudflare CDN統合）
    │   │   └── ABUSE_PROTECTION_REQUIREMENTS.md を参照（荒らし対策）
    │   │
    │   └── ABUSE_PROTECTION_REQUIREMENTS.md
    │       ├── security/SECURITY.md を参照（セキュリティポリシー）
    │       ├── DDOS_PROTECTION_REQUIREMENTS.md を参照（DDoS対策）
    │       └── TURNSTILE_REQUIREMENTS.md を参照（Turnstile要件）
    │
    ├── architecture/
    │   ├── ARCHITECTURE.md
    │   │   ├── AGENTS.md を参照（技術スタック）
    │   │   └── 技術検証結果を含む
    │   │
    │   ├── DATABASE_DESIGN.md
    │   │   └── AGENTS.md を参照（Prisma設定）
    │   │
    │   └── PROJECT_STRUCTURE.md
    │       └── プロジェクト構造の詳細
    │
    ├── development/
    │   ├── API.md
    │   │   ├── architecture/DATABASE_DESIGN.md を参照（データモデル）
    │   │   └── security/SECURITY.md を参照（認証・認可）
    │   │
    │   ├── BEST_PRACTICES.md
    │   │   ├── AGENTS.md を参照（技術スタック）
    │   │   └── 最新の公式推奨に基づく実装ガイドライン
    │   │
    │   ├── CACHING_STRATEGY.md
    │   │   ├── BEST_PRACTICES.md を参照（キャッシングベストプラクティス）
    │   │   └── architecture/ARCHITECTURE.md を参照（アーキテクチャ）
    │   │
    │   ├── BUN_RUNTIME.md
    │   │   └── AGENTS.md を参照（Bun設定）
    │   │
    │   ├── PRISMA_7.md
    │   │   └── Prisma 7のインポート方法と移行手順
    │   │
    │   └── TECH_STACK_VERSIONS.md
    │       └── AGENTS.md を参照（技術スタックバージョン）
    │
    ├── deployment/
    │   ├── DEPLOYMENT.md
    │   │   ├── DOCKER.md を参照（Docker設定）
    │   │   ├── CLOUDFLARE_CDN.md を参照（CDN統合）
    │   │   └── AGENTS.md を参照（環境変数）
    │   │
    │   ├── DOCKER.md
    │   │   └── DEPLOYMENT.md を参照（デプロイ手順）
    │   │
    │   └── CLOUDFLARE_CDN.md
    │       ├── DEPLOYMENT.md を参照（デプロイ手順）
    │       └── architecture/ARCHITECTURE.md を参照（アーキテクチャ）
    │
    └── security/
        └── SECURITY.md
            └── AGENTS.md を参照（セキュリティベストプラクティス）
```

---

## 重要な注意事項

### 技術スタック情報
- **主要な情報源**: [`AGENTS.md`](../AGENTS.md)の「Technical stack」セクション
- 各ドキュメントでバージョンや制約に触れる場合は`AGENTS.md`と一致させる

### セキュリティ情報
- **主要な情報源**: [`security/SECURITY.md`](./security/SECURITY.md)
- 他のドキュメントで概要を記載する場合は`security/SECURITY.md`と一致させる

### バージョン情報
- **詳細なバージョン情報**: [`development/TECH_STACK_VERSIONS.md`](./development/TECH_STACK_VERSIONS.md)を参照
- すべてのバージョン情報は`AGENTS.md`と一致させる
- 更新時は`AGENTS.md`を先に更新し、その後関連ドキュメントを更新

### 日付形式
- すべての日付は`yyyy-MM-dd`形式で統一

---

## ドキュメント更新ガイドライン

### 更新時のチェックリスト

- [ ] `AGENTS.md`の技術スタック情報と一致しているか
- [ ] 関連ドキュメントへの参照リンクが有効か
- [ ] コード例が最新のベストプラクティスに準拠しているか
- [ ] 用語が統一されているか（例: "Server Actions" vs "API Routes"）
- [ ] 日付形式が`yyyy-MM-dd`で統一されているか

### 新規ドキュメント追加時

1. この`README.md`に追加
2. `AGENTS.md`の「Additional documentation」セクションに追加
3. 関連ドキュメントへの参照を追加
4. 適切なサブディレクトリに配置

---

## 参考資料

- [AGENTS.md](../AGENTS.md) - プロジェクト全体の仕様書
- [Next.js 16 Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Auth.js Documentation](https://authjs.dev)
- [Supabase Documentation](https://supabase.com/docs)
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)

---

## 更新履歴

- **2026-01-07**: NUQS_REQUIREMENTS.md 全面改訂（実装完了に伴い `createLoader` パターンに統一、ベストプラクティス更新）
- **2026-01-06**: ドキュメント構造を整理、カテゴリ別サブディレクトリに分類
  - `requirements/` - 要件定義ドキュメント（13ファイル）
  - `architecture/` - アーキテクチャ・設計ドキュメント（4ファイル）
  - `development/` - 開発・技術詳細ドキュメント（6ファイル）
  - `deployment/` - デプロイメント・運用ドキュメント（3ファイル）
  - `security/` - セキュリティドキュメント（1ファイル）
  - Prisma関連ドキュメントを統合（`PRISMA_7_IMPORT_GUIDE.md` + `PRISMA_7_MIGRATION_REPORT.md` → `development/PRISMA_7.md`）
- **2026-01-06**: TYPE_SAFETY_REQUIREMENTS.md追加、型安全・型定義の包括的な要件定義を追加
- **2026-01-06**: ARCHITECTURE.mdのZodバージョン表記を修正（`4` → `4.3.5`）
- **2026-01-06**: DDOS_PROTECTION_REQUIREMENTS.md追加、商用無料プランで利用可能なDDoS対策の要件定義を完了
- **2026-01-06**: ABUSE_PROTECTION_REQUIREMENTS.md追加、商用無料プランで利用可能な荒らし対策の要件定義を完了
- **2026-01-06**: SECURITY.md強化、レート制限セクションの詳細化、IPブロック機能への参照追加、監視とアラートセクション追加
- **2026-01-06**: CLOUDFLARE_CDN.md強化、DDoS保護セクションの詳細化、Bot Fight Modeの詳細設定要件追加
- **2026-01-06**: TURNSTILE_REQUIREMENTS.md強化、監視とアラートセクションの詳細化
- **2026-01-06**: EMAIL_REQUIREMENTS.md強化、スパム対策セクションの詳細化
- **2026-01-06**: TURNSTILE_REQUIREMENTS.md追加、Cloudflare Turnstileの要件定義を完了（Bot対策、フォーム統合、セキュリティ要件）
- **2026-01-06**: TEST_REQUIREMENTS.md追加、包括的なテスト要件定義を追加（Bun test、Playwright、テスト環境設定、CI/CD統合）
- **2026-01-06**: 顧客管理機能の要件定義をFEATURE_REQUIREMENTS.mdに追加、予約した顧客のプロフィール管理機能を定義（Server Components、Prisma最適化、ベストプラクティス準拠）
- **2026-01-06**: ページ管理機能の要件定義をFEATURE_REQUIREMENTS.mdに追加、公開ページ（ブログ・お知らせを除く）のコンテンツ管理機能を定義
- **2026-01-06**: SETTINGS_REQUIREMENTS.md追加、管理画面の設定画面の包括的な要件定義を追加
- **2026-01-06**: BEST_PRACTICES.md追加、Next.js 16、React 19、Prisma 7、Auth.js 5の最新ベストプラクティスを反映
- **2026-01-06**: CACHING_STRATEGY.md追加、Next.js 16の最新キャッシングAPIに基づく詳細なキャッシング戦略を記載
- **2026-01-06**: ARCHITECTURE.md更新、最新のキャッシングAPIとデータフェッチングパターンを反映
- **2026-01-06**: PROJECT_STRUCTURE.md更新、最新のキャッシング戦略を反映
- **2026-01-06**: API.md更新、最新のServer Actionsパターンとキャッシュ無効化方法を追加
- **2026-01-06**: DATABASE_DESIGN.md更新、Prisma 7の最新ベストプラクティス（トランザクション、並列フェッチング等）を追加
- **2026-01-05**: JWT_AUTH_REQUIREMENTS.md追加、JWT認証システムの詳細な要件定義を完了
- **2026-01-05**: CLOUDFLARE_CDN.md追加、Cloudflare CDN統合ガイドを作成
- **2026-01-05**: TECH_STACK_VERSIONS.md追加、技術スタック最新バージョン情報を調査・まとめ
- **2026-01-05**: ドキュメントインデックス作成、整理・統合完了
- **2026-01-05**: EMAIL_REQUIREMENTS.md追加、メール送信機能の要件定義を完了
