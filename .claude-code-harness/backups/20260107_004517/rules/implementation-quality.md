# 実装品質保護ルール

> 形骸化した実装を防止し、品質を維持するためのルール

## 禁止事項

### 1. ハードコード実装

以下は**禁止**：
- テストの期待値をそのまま return する
- 特定の入力に対してのみ動作するコード
- マジックナンバーの直接使用

```typescript
// ❌ 禁止: テスト期待値のコピペ
function calculate(x: number): number {
  if (x === 5) return 10  // テストケースをハードコード
  return x * 2
}

// ✅ 正しい実装
function calculate(x: number): number {
  return x * 2
}
```

### 2. スタブ・空実装

以下は**禁止**：
- `throw new Error('Not implemented')` の放置
- 空の関数 `() => {}`
- TODO コメントのみの実装
- `any` 型での型回避

```typescript
// ❌ 禁止
async function fetchUser(id: string): Promise<User> {
  // TODO: 実装する
  return {} as any
}

// ✅ 正しい実装
async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`)
  if (!response.ok) throw new Error('User not found')
  return response.json()
}
```

### 3. エラーハンドリングの省略

以下は**禁止**：
- 空の catch ブロック `catch (e) {}`
- エラーの握りつぶし
- 常に成功を返す実装

## 推奨パターン

### 段階的な実装

1. 型定義から始める
2. エッジケースを考慮
3. エラーハンドリングを追加
4. テストで動作確認

### コードレビュー観点

- 実装がビジネスロジックを正しく反映しているか
- エッジケースが考慮されているか
- エラーハンドリングが適切か
- 型が正確に定義されているか

## 違反時の対応

形骸化した実装を検出した場合：
1. 実装の意図を確認
2. 正しいビジネスロジックを実装
3. テストでカバレッジを確認
