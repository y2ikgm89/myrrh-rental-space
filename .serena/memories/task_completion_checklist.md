# Task Completion Checklist

## 完了報告前に必須
1. `bun run type-check` - 型エラーなし
2. `bun run lint` - lint エラーなし
3. `bun run build` - ビルド成功 (コミット/PR前)

## 禁止事項の確認
- [ ] `as` 型アサーション未使用
- [ ] ハードコードカラー未使用 (gray-*, blue-* 等)
- [ ] 後方互換ハック未使用
- [ ] 不要コード完全削除
