# Agent Skills

このディレクトリには、CursorのAgent Skillsが含まれています。これらのSkillは、エージェントが自動的に適用するルールとして機能し、プロジェクトのベストプラクティスと技術スタックに基づいたガイダンスを提供します。

## 有効化方法

CursorでAgent Skillsを有効化するには：

1. **Cursor Settings → Rules** を開く
2. **Import Settings** セクションを探す
3. **Agent Skills** をオンにする

Skillはエージェントが自動的に検出し、コンテキストに応じて適用されます。

## 利用可能なSkill

### 1. Next.js 16 App Router (`nextjs-app-router/SKILL.md`)

Next.js 16 App Routerのパターン、Server Components、Server Actions、キャッシング戦略に関するガイダンスを提供します。

**適用される場面**:
- Next.jsページやルートの作成・変更
- Server ComponentsやClient Componentsの実装
- Server Actionsの実装
- キャッシング戦略の実装
- Server Componentsでのデータフェッチング
- 動的ルートと静的生成の実装

### 2. Prisma 7 (`prisma-7/SKILL.md`)

Prisma 7 ORMの効果的な使用方法、クエリ最適化、トランザクション、ベストプラクティスに関するガイダンスを提供します。

**適用される場面**:
- Prismaでのデータベースクエリの記述
- データベースクエリの最適化
- リレーションとincludeの操作
- トランザクションの実装
- ページネーションの実装
- インデックスの操作

### 3. Auth.js 5 (`authjs-5/SKILL.md`)

Auth.js 5での認証・認可の実装、JWTセッション、Prismaアダプター、セキュリティベストプラクティスに関するガイダンスを提供します。

**適用される場面**:
- 認証フローの実装
- セッションの操作
- ルートとServer Actionsの保護
- ロールベースアクセス制御（RBAC）の実装
- Auth.jsプロバイダーの設定

### 4. Bun Runtime (`bun-runtime/SKILL.md`)

Bun 1.3.5ランタイムでの開発、ビルド、テスト、デプロイメントに関するガイダンスを提供します。

**適用される場面**:
- 開発サーバーの実行
- アプリケーションのビルド
- テストの実行
- 依存関係の管理
- 本番環境へのデプロイ
- Bun固有の機能の使用

### 5. TypeScript Strict Mode (`typescript-strict/SKILL.md`)

strictモードが有効なTypeScriptコードの記述、明示的な型アノテーション、ベストプラクティスに関するガイダンスを提供します。

**適用される場面**:
- TypeScriptコードの記述
- 関数パラメータと戻り値の型定義
- 型とインターフェースの操作
- 型エラーの処理
- 型安全なコードの記述

## Skillの構造

各Skillは**個別のディレクトリ**として配置され、その中に`SKILL.md`ファイルが含まれます。

### ディレクトリ構造

```
skills/
  ├── authjs-5/
  │   └── SKILL.md
  ├── bun-runtime/
  │   └── SKILL.md
  ├── nextjs-app-router/
  │   └── SKILL.md
  ├── prisma-7/
  │   └── SKILL.md
  └── typescript-strict/
      └── SKILL.md
```

### SKILL.mdファイルの構造

各`SKILL.md`ファイルは、**必須のYAML frontmatter**とMarkdownコンテンツで構成されます：

```markdown
---
name: skill-name
description: Description of what this skill does and when to use it.
---

# Skill Name

This skill provides guidance for...

## When to use this skill

Use this skill when:
- Specific use case 1
- Specific use case 2
- ...

## Instructions

### Section 1
- Guidance and examples

### Section 2
- More guidance and examples

## Best Practices

1. Best practice 1
2. Best practice 2
3. ...

## References

- External references
- Project documentation references
```

### YAML Frontmatter（必須）

- **`name`**: スキル名（必須、1-64文字、小文字・数字・ハイフンのみ、ディレクトリ名と一致）
- **`description`**: スキルの説明（必須、1-1024文字、何をするかと使用タイミングを含む）

## カスタマイズ

プロジェクト固有の要件に応じて、既存のSkillを編集したり、新しいSkillを追加したりできます。

新しいSkillを追加するには：

1. `skills/`ディレクトリに`<skill-name>/`ディレクトリを作成
2. その中に`SKILL.md`ファイルを作成
3. 必須のYAML frontmatter（`name`と`description`）を追加
4. `name`フィールドはディレクトリ名と一致させる
5. Skillの構造に従って内容を記述
6. Cursorが自動的に検出します

## 参考資料

- [Cursor Agent Skills Documentation](https://cursor.com/docs/context/skills)
- [Agent Skills Open Standard](https://agentskills.io)
- プロジェクトドキュメント: `docs/README.md`
