---
paths:
  - src/app/(admin)/**/*Dialog.tsx
  - src/app/(admin)/**/_components/*Dialog*.tsx
---

# 管理画面 Dialog パターン

Dialog 型 CRUD・多選択肢ダイアログ・Radix Dialog の a11y 要件を集約。

## Dialog 型 CRUD パターン（軽量エンティティ向け）

カテゴリ・タグ・短い Q&A 等の **フィールド 10 個以下 / 個別 URL 不要 / リッチエディタ不要** のエンティティは、専用ページではなく Dialog で create/edit を行う。`AdminDetailLayout` + 専用ルートと使い分ける。

### 適用判断

| 条件                                    | Dialog | 専用ページ |
| --------------------------------------- | ------ | ---------- |
| フィールド数                            | ≤ 10   | > 10       |
| 個別 URL の deep link 需要              | なし   | あり       |
| リッチエディタ（Lexical）使用           | なし   | あり       |
| 親エンティティの context 内で完結するか | する   | しない     |

### canonical pattern (conform `useActionState` + Radix Dialog controlled)

Phase 1 Task 4-6 で確立した conform 1.19 + Zod 4 + Server Action 統合パターン。Radix Dialog の close-after-async-submit 公式パターンと組み合わせる:

```tsx
// 1. 共用 Dialog コンポーネント (create/edit mode prop で切替)
"use client";
import { useActionState, useEffect } from "react";
import { useForm } from "@conform-to/react";
import { parseWithZod, getZodConstraint } from "@conform-to/zod/v4";

export function FooDialog({ open, onOpenChange, mode, foo }: Props) {
  const action =
    mode === "create" ? createFooAction : updateFooAction.bind(null, foo!.id);
  const [lastResult, formAction] = useActionState(action, undefined);

  const [form, fields] = useForm({
    id: `foo-${mode}`,
    constraint: getZodConstraint(fooSchema),
    lastResult,
    defaultValue: mode === "edit" && foo ? { ...foo } : defaultFooValues,
    onValidate: ({ formData }) => parseWithZod(formData, { schema: fooSchema }),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  // success → dialog close を render 中 derive (set-state-in-effect 違反回避)
  useEffect(() => {
    if (lastResult?.initialValue === null) onOpenChange(false);
  }, [lastResult, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "作成" : "編集"}</DialogTitle>
          <DialogDescription>...</DialogDescription>
          {/* a11y 必須 */}
        </DialogHeader>
        <form id={form.id} onSubmit={form.onSubmit} action={formAction}>
          ...
        </form>
      </DialogContent>
    </Dialog>
  );
}

// 2. 親コンポーネントで編集対象 state + open state を管理
const [editingFoo, setEditingFoo] = useState<Foo | null>(null);
const [open, setOpen] = useState(false);
const handleEdit = (foo: Foo) => {
  setEditingFoo(foo);
  setOpen(true);
};
const handleAdd = () => {
  setEditingFoo(null);
  setOpen(true);
};
```

`DialogTitle` / `DialogDescription` は Radix の a11y 要件で必須（未配置は WCAG 4.1.2 違反）。省略したい場合は `VisuallyHidden` でラップする。

参照実装: `FaqItemDialog.tsx` / `FaqCategoryDialog.tsx` / `FaqCategoryDetailView.tsx`

### controlled / uncontrolled 両対応（空状態からの起動）

親ヘッダーのトリガーボタンと EmptyState からの起動の **両方**で Dialog を開きたい場合、prop を optional union で受ける:

```tsx
type Props = {
  open?: boolean; // 親が制御する時のみ渡す
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean; // 省略時は !isControlled を default
};
```

- `open === undefined` なら内部 `useState` で stand-alone 動作（既存呼び出しと互換）
- `open` が渡されたら parent-controlled（EmptyState `onClick` → `setOpen(true)`）
- `showTrigger` は `showTrigger ?? !isControlled` で parent 制御時に `<DialogTrigger>` を自動非表示
- 参照実装: `pages/_components/CreatePageDialog.tsx`

### Dialog を起動する EmptyState

`EmptyState` コンポーネントの `action` prop は discriminated union で `{ href }` / `{ onClick }` を受ける。Dialog 起動には `onClick` を使う:

```tsx
<EmptyState
  message="カテゴリがまだありません"
  action={{
    label: "最初のカテゴリを作成",
    onClick: () => setCreateOpen(true),
  }}
/>
```

### master-detail ルーティングとの組み合わせ

親子関係の強いデータ（FAQ の Category → Item 等）は master-detail ルーティング + Dialog 型 CRUD を組み合わせる:

- `/admin/{resource}` → master（親一覧 + 親 CRUD Dialog）
- `/admin/{resource}/[parentId]` → detail（親詳細 + 子一覧 + 子 CRUD Dialog）

子の create Dialog は親 context から `parentId` を注入（`<input type="hidden" {...register("parentId")} />`）し、Dialog 内でのカテゴリ変更は許可しない（移動は別途 bulk move Dialog）。参照: `/admin/faq` / `/admin/faq/[categoryId]`

---

## 多選択肢ダイアログのレイアウト

選択肢が5件以上のダイアログは `grid-cols-3` + `max-w-2xl` で横展開、`max-h-[60vh] overflow-y-auto` でスクロール対応:

```tsx
<AlertDialogContent className="max-w-2xl">
  <div className="grid grid-cols-3 gap-2 py-4 max-h-[60vh] overflow-y-auto">
    <button className="flex flex-col items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 text-center">
      <div className="p-2 rounded-md bg-primary/10">
        <Icon />
      </div>
      <span className="text-sm font-medium">{label}</span>
    </button>
  </div>
</AlertDialogContent>
```
