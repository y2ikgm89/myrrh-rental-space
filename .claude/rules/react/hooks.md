---
description: React フックパターン（Outer/Inner Split・useReducer・startTransition・useSyncExternalStore・headless UI）
paths:
  - "src/**/*.tsx"
  - "src/**/*.ts"
---

# React フックパターン

> React 19.2 / React Compiler 1.0 対応

> 詳細サブルール（path-scoped auto-load）:
>
> - **Outer/Inner Component Split + thin dispatcher 削除 + useReducer + startTransition + form.getValues 非リアクティブ** — `react/hooks/component-and-state.md`
> - **useSyncExternalStore + 楽観的 local state + signature-based dismissable persistence** — `react/hooks/external-store.md`

> **詳細リファレンス（React 19.2 新 API / Compiler 制限事項）**: `docs/reference/react-api.md`

## フックから UI 要素を返すパターン（headless UI）

フックから `ComponentType` を返すと React Compiler / eslint-react v4 でエラー（`component-hook-factories`）。`ReactNode` を返す:

```typescript
// NG: フック内コンポーネント定義（component-hook-factories エラー）
function useDialog() {
  const Dialog = () => <DialogImpl {...props} />;
  return { Dialog }; // ComponentType
}
<picker.Dialog />

// OK: ReactNode を返す（use-media-picker.tsx が実装例）
function useDialog() {
  const dialogElement = <DialogImpl {...props} />;
  return { dialogElement }; // ReactNode
}
{picker.dialogElement}
```
