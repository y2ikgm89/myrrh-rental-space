# 054 フィルター・フォームパターン統一

公式ベストプラクティスに準拠したクリーン実装。後方互換性なし。

## 概要

| 項目 | 内容 |
|------|------|
| 対象 | 管理画面フィルター・フォーム |
| 状態 | **完了** |
| リスク | 低（UI層のみ、ロジック変更なし） |

---

## Part A: フィルター統一

### Phase A1: シンプルフィルター移行 ✅

**対象**: CustomerFilters, SpaceFilters, ReservationFilters, InquiryFilters, LocationFilters

**完了タスク**:
- [x] CustomerFilters → BaseFilters（ステータスオプションカスタム）
- [x] SpaceFilters → BaseFilters（公開状態フィルター、デバウンスバグ修正）
- [x] ReservationFilters → BaseFilters（ステータスオプションカスタム）
- [x] InquiryFilters → BaseFilters（デバウンスバグ修正）
- [x] LocationFilters → BaseFilters（statusParamName, preserveParams 拡張）

**BaseFilters 拡張**:
- `statusParamName`: カスタムステータスパラメータ名
- `preserveParams`: URL遷移時に保持するパラメータ
- `statusOptions={[]}`: ステータスフィルター非表示

### Phase A2: 拡張フィルター移行 ✅

**対象**: BlogFilters, CategoryFilters

**完了タスク**:
- [x] BlogFilters → BaseFilters + CategorySelect（children）
- [x] CategoryFilters → BaseFilters + IncludeInactiveCheckbox（children、statusOptions=[]）

### Phase A3: 見送り（将来検討）

| フィルター | 理由 |
|-----------|------|
| CommentFilters | ボタンUI、別パターン |
| MediaFilters | ビュー切替・アップロード機能統合 |
| AuditLogFilters | 日付範囲・フォーム形式 |

---

## Part B: フォームパターン統一

### Phase B1: useFormAction フック作成 ✅

**作成ファイル**: `_shared/hooks/useFormAction.ts`

```typescript
export function useFormAction<TInput extends FieldValues, TOutput = void>(
  schema: ZodSchema<TInput>,
  action: (data: TInput) => Promise<ActionResult<TOutput>>,
  options?: UseFormActionOptions<TInput, TOutput>
): UseFormActionReturn<TInput, TOutput>
```

**機能**:
- react-hook-form + Zod + useTransition + toast 統合
- フィールドエラー自動設定
- リダイレクト / リフレッシュオプション
- 成功 / エラーコールバック

### Phase B2: シンプルフォーム移行 ✅

**完了タスク**:
- [x] FaqCategoryForm → useFormAction
- [x] FaqItemForm → useFormAction

**見送り**:
- CategoryForm: 既にクリーン（親がロジック制御）
- TermsVersionForm: react-hook-form不使用、単一フィールド

### Phase B3: 中規模フォーム移行 ✅

**完了タスク**:
- [x] UserForm → useFormAction

**見送り**:
- InviteForm: 成功時の特殊UI（3秒待機後リダイレクト）
- TermsForm: react-hook-form未使用、変換コスト大
- CustomerForm: useActionState + IME自動カナ入力、特殊要件

### Phase B4: 複雑フォーム（見送り）

| フォーム | 行数 | 理由 |
|---------|------|------|
| SpaceForm | 758 | 複雑すぎる、別途分割検討 |
| LocationForm | 495 | 複雑、別途分割検討 |
| ReservationForm | 531 | fieldErrors 特殊処理あり |
| PageSeoForm | 267 | 動作中、優先度低 |

---

## 成果

### コード削減

| 対象 | 削減行数 |
|------|---------|
| フィルター（7個） | ~400行 |
| フォーム（5個） | ~150行 |
| **合計** | ~550行 |

### 品質向上

- デバウンスバグ修正（InquiryFilters, SpaceFilters）
- エラーハンドリング統一
- UX一貫性（トースト通知）
- 新規実装の高速化（useFormAction）

---

## 依存関係

- Plan 053 完了（BaseFilters 作成済み） ✅
