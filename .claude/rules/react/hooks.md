---
description: React フックパターン（Outer/Inner Split・useReducer・startTransition・useSyncExternalStore・headless UI）
paths:
  - "src/**/*.tsx"
  - "src/**/*.ts"
---

# React フックパターン

> React 19 / React Compiler 1.0 対応

> 公式 React 19 API: [react.dev](https://react.dev/) / [React Compiler 1.0](https://react.dev/blog/2025/10/07/react-compiler-1)

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
