# implementation-quality.md - 実装品質保護ルール

> 形骸化実装・スタブ・ハードコードを防止するガードレール

## 禁止事項

### 1. スタブ実装

```typescript
// NG: 空の関数
export function validateInput(input: string) {
  // TODO: implement
}

// NG: 常に固定値を返す
export function calculatePrice(items: Item[]) {
  return 1000 // ハードコード
}

// NG: 引数を無視
export function formatDate(date: Date) {
  return '2024-01-01' // 引数を使っていない
}
```

### 2. モック依存の本番コード

```typescript
// NG: 本番コードにモック
export function fetchData() {
  if (process.env.NODE_ENV === 'test') {
    return mockData
  }
  return realFetch()
}
```

### 3. コメントだけの実装

```typescript
// NG: コメントで済ませる
export async function saveUser(user: User) {
  // Save user to database
  // Validate input
  // Return result
}
```

### 4. any 型の乱用

```typescript
// NG: any で逃げる
export function processData(data: any): any {
  return data
}
```

## 許可される例外

### 開発中の明示的なプレースホルダ

```typescript
// OK: 明示的な未実装エラー
export function featureX() {
  throw new Error('Not implemented: featureX - Planned for Phase 2')
}
```

### テストダブル

```typescript
// OK: テストファイル内のモック
// __tests__/user.test.ts
const mockPrisma = {
  user: {
    findUnique: vi.fn(),
  },
}
```

## 検出時の対応

形骸化実装を検出した場合:

1. **即座に警告**を表示
2. **実装を完成**させる
3. **正当な理由**（段階的実装など）がある場合、Plans.md にタスクとして記録

## 品質基準

- **型安全**: `any` を使わない、明示的な型定義
- **完全実装**: すべてのコードパスが動作する
- **意味のある処理**: 引数を使い、適切な結果を返す
- **エラーハンドリング**: 例外ケースを適切に処理
