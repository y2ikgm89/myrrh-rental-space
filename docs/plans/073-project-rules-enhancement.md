# 073: プロジェクトルール拡充

> ステータス: 完了
> 作成日: 2026-01-27
> 完了日: 2026-01-27

## 概要

公式ドキュメントに準拠したベストプラクティスルールを整備し、プロジェクト全体の品質と一貫性を向上させる。

## 背景

- 現在のルールファイルは5つ（type-safety, implementation-quality, test-quality, lexical-patterns, react-patterns）
- Next.js 16、Prisma、Zod 4、nuqsなど主要技術のベストプラクティスが文書化されていない
- コードベース全体での一貫性確保が困難

## 目標

1. 主要技術のベストプラクティスをルールとして文書化
2. 既存コードの違反箇所を特定・修正
3. 開発効率と品質の向上

## 実装計画

### Phase 1: ルールファイル作成

| タスク | ファイル             | 内容                                                 |
| ------ | -------------------- | ---------------------------------------------------- |
| 1.1    | `server-actions.md`  | Next.js 16 Server Actions、'use cache'、revalidation |
| 1.2    | `prisma-patterns.md` | Prisma型安全、JSON fields、transactions              |
| 1.3    | `zod-patterns.md`    | Zod 4 Standard Schema、error customization           |
| 1.4    | `nuqs-patterns.md`   | URL状態管理、parsers、型推論                         |
| 1.5    | `auth-patterns.md`   | Better Auth、RBAC、権限チェック                      |

### Phase 2: 既存コード検証

- 各ルールに基づいてコードベースを検証
- 違反箇所の特定とリスト化

### Phase 3: 違反修正

- 優先度順に修正を実施
- type-check、lint、buildで検証

## 技術調査結果（context7）

### Next.js 16 Server Actions / Caching

```typescript
// 'use cache' - データキャッシュ（新ディレクティブ）
async function getPosts() {
  "use cache";
  cacheTag("posts");
  cacheLife("hours");
  return await prisma.post.findMany();
}

// updateTag - 即時キャッシュ失効（read-your-own-writes）
import { updateTag } from "next/cache";
updateTag("posts"); // Server Actions内でのみ使用

// revalidateTag - 非同期再検証（遅延OK）
import { revalidateTag } from "next/cache";
revalidateTag("posts");
```

### Prisma JSON Fields

```typescript
// prisma-json-types-generatorで型安全なJSONフィールド
declare global {
  namespace PrismaJson {
    type Settings = {
      theme: "light" | "dark";
      notifications: boolean;
    };
  }
}
```

### Zod 4

```typescript
// error parameterでエラーカスタマイズ（message非推奨）
z.string().min(1, { error: "Required" });

// Standard Schemaによるライブラリ間互換性
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
```

### nuqs

```typescript
// parseAsStringEnum - 型安全なenum
import { parseAsStringEnum, useQueryState } from "nuqs";

const tabs = ["home", "settings", "profile"] as const;
const [tab, setTab] = useQueryState(
  "tab",
  parseAsStringEnum(tabs).withDefault("home"),
);

// inferParserType - パーサーから型推論
import type { inferParserType } from "nuqs";
type Tab = inferParserType<typeof parseAsStringEnum<typeof tabs>>;
```

## 完了条件

- [x] 5つの新規ルールファイル作成（server-actions, prisma-patterns, zod-patterns, nuqs-patterns, auth-patterns）
- [x] Next.js 16 'use cache' ディレクティブ、cacheLife、cacheTag パターン追加
- [x] Zod 4 `{ error: }` パラメータ（`message`は非推奨）対応
- [x] CLAUDE.mdへの参照追加
- [x] context7・Web検索による公式ドキュメント検証完了
- [x] type-check、lint、build通過

## 関連ドキュメント

- `.claude/rules/` - 既存ルールファイル
- `CLAUDE.md` - プロジェクト設定
