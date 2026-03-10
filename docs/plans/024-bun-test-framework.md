# 024: Bun テストフレームワーク導入

## 概要

Bun 1.3.6のネイティブテストランナー(`bun:test`)を使用した、包括的なテストフレームワークを導入。

## 実装内容

### 作成ファイル

```
__tests__/
├── setup.ts                          # グローバルセットアップ
├── mocks/
│   ├── prisma.ts                     # Prisma Clientモック
│   ├── auth.ts                       # Better Authセッションモック
│   ├── next.ts                       # Next.js APIモック
│   └── index.ts
├── fixtures/
│   ├── users.ts                      # ユーザーフィクスチャ（全ロール）
│   ├── reservations.ts               # 予約・スペース・重複テストケース
│   └── index.ts
├── helpers/
│   ├── session-mock.ts               # セッションモックヘルパー
│   ├── assertions.ts                 # ActionResult用カスタムアサーション
│   └── index.ts
└── unit/
    ├── lib/
    │   ├── permissions.test.ts       # 権限管理テスト（70テスト）
    │   ├── validations/
    │   │   └── reservation.test.ts   # 予約バリデーションテスト（24テスト）
    │   └── reservation-utils.test.ts # 予約重複チェックテスト（27テスト）
    └── types/
        └── server-actions.test.ts    # Server Actions HOFテスト
```

### 変更ファイル

- `bunfig.toml`: テスト設定追加
- `package.json`: テストスクリプト追加

## テスト実行コマンド

```bash
bun test                    # 全テスト実行
bun test:unit              # ユニットテストのみ
bun test:watch             # ウォッチモード
bun test:coverage          # カバレッジ付き
bun test --grep "権限"      # パターンフィルター（Bun 1.3.6新機能）
```

## テスト結果

```
121 pass
0 fail
379 expect() calls
Ran 121 tests across 4 files. [150.00ms]
```

## アーキテクチャ

### モック戦略

1. **Prisma Mock**: `mock.module()`でモジュール差し替え
2. **Auth Mock**: セッション状態をグローバル変数で管理
3. **Next.js Mock**: `headers`, `redirect`, `revalidatePath`をモック

### フィクスチャ設計

- **ユーザー**: 全5ロール（SUPER_ADMIN, ADMIN, EDITOR, VIEWER, USER）
- **予約**: 半開区間重複チェック用9パターン
- **バリデーション**: Zod スキーマ用入力データ

### カスタムアサーション

- `expectSuccess()`: ActionResult成功検証
- `expectFailure()`: ActionResult失敗検証
- `expectFailureWithError()`: 特定エラーメッセージ検証
- `expectSuccessWithData()`: 成功 + データ検証
- `expectFieldErrors()`: フィールドエラー検証

## 対象コード

| ファイル                             | テスト対象                    |
| ------------------------------------ | ----------------------------- |
| `src/lib/permissions.ts`             | RBAC権限管理                  |
| `src/lib/validations/reservation.ts` | 予約Zodスキーマ               |
| `src/lib/reservation-utils.ts`       | 予約重複チェック              |
| `src/types/server-actions.ts`        | withPermission, withRole等HOF |

## 設計判断

### なぜBunネイティブテスト？

- Jest/Vitestより高速（150ms for 121 tests）
- 設定不要（bunfig.toml最小限）
- TypeScript直接実行
- `--grep`フラグによるフィルタリング（Bun 1.3.6）

### なぜ外部ライブラリなし？

- `bun:test`の`mock.module()`で十分
- `prisma-mock`等のセットアップコスト回避
- 型安全なモックを自作

## 今後の拡張

1. **統合テスト**: `__tests__/integration/`にServer Actions統合テスト
2. **E2Eテスト**: Playwright導入検討
3. **カバレッジ目標**: 80%以上

## 関連ドキュメント

- [docs/architecture/TECH_STACK.md](../architecture/TECH_STACK.md)
- [CLAUDE.md](../../CLAUDE.md) テストコマンド
