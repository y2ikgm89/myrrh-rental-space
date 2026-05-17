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

Phase 1 Task 4-7 で確立した conform 1.19 + Zod 4 + Server Action 統合パターン。Radix Dialog の close-after-async-submit 公式パターンと組み合わせる。**Dialog open state の管理場所で 2 つの canonical variant を持つ** — どちらも「success 検知 → close」を **render 中 sync** (React 公式 ["You Might Not Need an Effect" §Adjusting State Directly During Render](https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-when-a-prop-changes)) で表現し、副作用 (`toast` / `router.refresh`) のみ `useEffect` で分離する規律は同一。

#### Variant A: Dialog open state を child component (FooDialog) 内で管理

`useActionState` と同コンポーネント内で open state を管理する場合、success 時の `setIsOpen(false)` は **必ず render 中 sync** で呼ぶ。`useEffect` 内 `setIsOpen(false)` は `react-hooks/set-state-in-effect` + `@eslint-react/set-state-in-effect` で error。

```tsx
"use client";
import { useActionState, useEffect, useState } from "react";
import { useForm } from "@conform-to/react";
import { parseWithZod, getZodConstraint } from "@conform-to/zod/v4";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function CreateFooDialog() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [lastResult, formAction, isPending] = useActionState(
    createFooAction,
    undefined,
  );

  // success → close を render 中 sync (set-state-in-effect 違反回避、
  // 公式「Adjusting State During Render」パターン)
  const [previousLastResult, setPreviousLastResult] = useState(lastResult);
  if (lastResult !== previousLastResult) {
    setPreviousLastResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      setIsOpen(false);
    }
  }

  // 副作用のみ effect で分離 (toast / router.refresh は setState ではない)
  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("作成しました");
      router.refresh();
    }
  }, [lastResult, router]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>作成</DialogTitle>
        </DialogHeader>
        <FooForm
          isPending={isPending}
          lastResult={lastResult}
          formAction={formAction}
          formId="foo-create-form"
        />
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <SubmitButton
            form="foo-create-form"
            isPending={isPending}
            label="作成"
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**子 form (FooForm.tsx)** は parent の `useActionState` を受け取り `<form>` 要素だけ持つ。`SubmitButton` は dialog footer に外置きで `form={formId}` で external connect:

```tsx
"use client";
import type { SubmissionResult } from "@conform-to/react";
import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";

type FooFormProps = {
  readonly foo?: Foo;
  readonly isPending: boolean;
  readonly lastResult: SubmissionResult | undefined;
  readonly formAction: (formData: FormData) => void;
  readonly formId: string;
};

export function FooForm({
  foo,
  isPending,
  lastResult,
  formAction,
  formId,
}: FooFormProps) {
  const [form, fields] = useForm({
    id: formId,
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: fooSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: foo ? { ...foo } : defaultFooValues,
  });
  return (
    <form {...getFormProps(form)} action={formAction} className="space-y-4">
      {/* fields ... */}
    </form>
  );
}
```

#### Variant B: Dialog open state を parent component で管理 (controlled)

list / table から行アクション経由で開く Dialog (`*ActionCell` 等) は parent が `editingFoo` + `open` state を持ち、child Dialog に `open` / `onOpenChange` を渡す。child 内で `onOpenChange(false)` を呼ぶ場合も **render 中 sync** を採用する (ESLint は callback prop 経由 setState を detect しないが、本質的に effect 内 setState は React 公式 anti-pattern のため統一):

```tsx
// parent (FooActionCell.tsx) — 編集対象 + open state を管理
const [editingFoo, setEditingFoo] = useState<Foo | null>(null);
const [open, setOpen] = useState(false);
const handleEdit = (foo: Foo) => {
  setEditingFoo(foo);
  setOpen(true);
};
return (
  <>
    <Button onClick={() => handleEdit(foo)}>編集</Button>
    {editingFoo && (
      <FooDialog open={open} onOpenChange={setOpen} foo={editingFoo} />
    )}
  </>
);

// child (FooDialog.tsx) — onOpenChange を render 中 sync で呼ぶ
export function FooDialog({ open, onOpenChange, foo }: Props) {
  const boundAction = updateFooAction.bind(null, foo.id);
  const [lastResult, formAction, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [previousLastResult, setPreviousLastResult] = useState(lastResult);
  if (lastResult !== previousLastResult) {
    setPreviousLastResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      onOpenChange(false);
    }
  }

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("保存しました");
    }
  }, [lastResult]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{/* ... */}</DialogContent>
    </Dialog>
  );
}
```

#### 禁止パターン

```tsx
// NG: 同コンポーネント内 useState の setter を useEffect 内で呼ぶ
// → react-hooks/set-state-in-effect + @eslint-react/set-state-in-effect で error
useEffect(() => {
  if (lastResult?.initialValue === null) setIsOpen(false);
}, [lastResult]);

// NG: parent の onOpenChange を useEffect 内で呼ぶ
// (ESLint は callback prop 経由 setState を detect しないため lint パスするが、
// 本質的に effect 内 setState で React 公式 anti-pattern — render 中 sync を採用)
useEffect(() => {
  if (lastResult?.initialValue === null) onOpenChange(false);
}, [lastResult, onOpenChange]);
```

`DialogTitle` / `DialogDescription` は Radix の a11y 要件で必須（未配置は WCAG 4.1.2 違反）。省略したい場合は `VisuallyHidden` でラップする。

参照実装:

- Variant A (create/edit 分離): `space-categories/_components/CreateCategoryDialog.tsx` / `CategoryActionCell.tsx` + `CategoryForm.tsx` (PR #64, 2026-05-16)
- Variant A (create/edit 統合 + mount-on-open + `bind` 部分適用): `posts/taxonomy/_components/CategoryManager.tsx` / `TagManager.tsx` (PR #88, 2026-05-17) — 親で `editingItem: T | null` + `isDialogOpen` を持ち、`{isDialogOpen && <FormDialog editingItem={...} />}` の **mount-on-open pattern** で Dialog 内 conform `useForm` の `defaultValue` を確実に反映（Dialog 閉じる時 unmount → 次回開く時 fresh init）。child Dialog 内で `isEdit = editingItem !== null` 判定し、`bind` 部分適用で update/create action を切替 (`updateAction.bind(null, editingItem.id)` vs `createAction`)、独立 `useActionState` で両 mode を 1 sub-component に統合
- Variant A + PortableTextSpan[] hidden input (Pattern B): `settings/appearance/_components/announcement-bar/BarDialog.tsx` (`BarFormDialog`、Phase 1 Task 8.1 PR #90, 2026-05-17) / `settings/appearance/_components/navigation/NavigationDialog.tsx` (`NavigationFormDialog` + `SocialLinkFormDialog`、Phase 1 Task 8.2 PR #91, 2026-05-17) — rich-text label / message を `useState<PortableTextSpan[]>` + `<input type="hidden" value={JSON.stringify(spans)} />` で transit、schema 内 `z.string().transform(JSON.parse).pipe(spans validate)` で server-side parse。`useInputControl` 経由 bridge より simple で contenteditable cursor 問題回避
- Variant B (create/edit 分離 + master-detail): `faq/_components/FaqItemDialog.tsx` / `FaqCategoryDialog.tsx` + 親 `FaqCategoryDetailView.tsx` / `FaqCategoryListView.tsx` / `FaqCategoryActionCell.tsx` (PR #70, 2026-05-16) — create / edit を別 sub-component に分離し独立 `useActionState` を持つ、parent が `editingItem` / `category` state を保持し undefined で create mode を選択する master-detail pattern

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
