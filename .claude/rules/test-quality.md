# test-quality.md - テスト品質保護ルール

> テストの改ざん・無効化を防止するガードレール

## 禁止事項

### 1. テストのスキップ・無効化

以下のパターンは**絶対に使用禁止**:

```typescript
// NG: テストのスキップ
it.skip('should validate input', () => {})
test.skip('should handle errors', () => {})
describe.skip('ValidationService', () => {})

// NG: テストのコメントアウト
// it('should validate input', () => {})

// NG: 条件付きスキップ（正当な理由なし）
it.skipIf(true, 'should work', () => {})
```

### 2. 常に成功するテスト

```typescript
// NG: 空のテスト
it('should work', () => {})

// NG: アサーションなし
it('should validate', () => {
  const result = validate(data)
  // アサーションがない
})

// NG: 常に true
it('should work', () => {
  expect(true).toBe(true)
})
```

### 3. エラーの握りつぶし

```typescript
// NG: try-catch で握りつぶし
it('should throw error', () => {
  try {
    throwingFunction()
  } catch (e) {
    // 何もしない
  }
})
```

## 許可される例外

### 環境依存のスキップ

```typescript
// OK: 環境依存（明確な理由）
it.skipIf(!process.env.CI, 'CI only test', () => {})

// OK: プラットフォーム依存
it.skipIf(process.platform !== 'linux', 'Linux only', () => {})
```

### 未実装の明示

```typescript
// OK: TODO として明示（ただし放置禁止）
it.todo('should implement feature X')
```

## 検出時の対応

テスト改ざんを検出した場合:

1. **即座に警告**を表示
2. **変更を元に戻す**
3. **正当な理由**がある場合のみ、decisions.md に記録して例外許可

## 品質基準

- カバレッジ: 80% 以上
- アサーション: 各テストに最低1つ
- エッジケース: 境界値、エラー、空入力をカバー
