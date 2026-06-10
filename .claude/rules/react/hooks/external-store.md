---
description: useSyncExternalStore（sessionStorage / localStorage）+ 楽観的 local state 併用 + signature-based dismissable persistence
paths:
  - "src/**/use-*.ts"
  - "src/**/use[A-Z]*.ts"
  - "src/**/hooks.ts"
  - "src/**/hooks/**/*.ts"
  - "src/**/_hooks/**/*.ts"
  - "src/**/editor/**/*.ts"
  - "src/shared/lib/conform/**"
---

# useSyncExternalStore + 楽観的 local state

> sessionStorage / localStorage 等の変更通知を持たない外部ストアを React 19 公式パターンで読む + 楽観的更新の二重 state 構成 + dismissable alert の signature-based persistence。

## useSyncExternalStore — 外部ストア読み取り（React 19 公式推奨）

sessionStorage / localStorage など**変更通知を持たない外部ストア**を読み取る場合、
`useState` lazy initializer ではなく `useSyncExternalStore` を使用する（React 19 公式推奨）。

```typescript
import { useRef, useSyncExternalStore } from "react";

// NG: 外部ストアに useState lazy initializer（React 19 非推奨）
const [data] = useState(() => sessionStorage.getItem(key));

// OK: useSyncExternalStore（React 19 公式パターン）
const snapshotRef = useRef<T | null>(null);
const data = useSyncExternalStore(
  () => () => {}, // subscribe: no-op（変更通知なし）
  () => {
    snapshotRef.current ??= readFromStorage(); // getSnapshot: useRef でキャッシュ（参照安定性）
    return snapshotRef.current;
  },
  (): T => fallbackValue, // getServerSnapshot: dynamic({ ssr: false }) でも必須
);
```

**3 引数の役割:**

| 引数                | sessionStorage 向け実装               | 理由                                           |
| ------------------- | ------------------------------------- | ---------------------------------------------- |
| `subscribe`         | `() => () => {}` (no-op)              | sessionStorage は変更イベントを発火しない      |
| `getSnapshot`       | `useRef` でキャッシュした読み取り関数 | 毎レンダーで新しい参照を返すと無限ループ       |
| `getServerSnapshot` | エラー/空状態の fallback 値           | `dynamic({ ssr: false })` でも型安全のため必須 |

**`getServerSnapshot` の参照安定性（必須）**: React はサーバー／ハイドレーション時に `getServerSnapshot` を複数回呼ぶ。戻り値が**オブジェクトや配列**のとき、呼び出しのたびに**新しい参照**を返すと「The result of getServerSnapshot should be cached to avoid an infinite loop」警告や再レンダーループの原因になる。**論理値が同じなら `Object.is` で同一参照になるようにする**。

```typescript
// NG: 毎回新しい配列 → 警告・ループの原因
function getServerSnapshot(): string[] {
  return [];
}

// OK: モジュールスコープの定数を返す（空配列の典型例）
const SERVER_DISMISSED_IDS: string[] = [];
function getServerSnapshot(): string[] {
  return SERVER_DISMISSED_IDS;
}

// OK: プリミティブ（null / false 等）は毎回同じ値なのでそのままでよい
function getServerSnapshot(): null {
  return null;
}
```

オブジェクトスナップショットが「空オブジェクト」など固定値なら、同様にモジュール定数 1 つにまとめる。実装例: `src/app/(public)/_shared/components/announcement-bar/use-dismissed-bars.ts`。

**注意**: ブラウザ API 依存のため `dynamic({ ssr: false })` とセットで使用する。

## 外部ストア + 楽観的 local state の併用パターン

投票・ブックマーク・お気に入り等、**ユーザー操作の即座反映（楽観的更新）** と **localStorage 永続化** の両方が必要な UI は、`useSyncExternalStore` と `useState` を二重 state として組み合わせる。SSR → hydration の遷移は render 中の state sync で橋渡しする（`useEffect` を使うと `@eslint-react/set-state-in-effect` に違反する）。

```tsx
const subscribe = () => () => {}; // localStorage は通知なし
const getServerSnapshot = (): VoteValue | null => null; // プリミティブで参照安定

function Vote({ id }: { id: string }) {
  // 1) 外部ストア（永続値）
  const snapshotRef = useRef<VoteValue | null>(null);
  const storedVote = useSyncExternalStore(
    subscribe,
    () => {
      snapshotRef.current ??= readFromStorage(id);
      return snapshotRef.current;
    },
    getServerSnapshot,
  );

  // 2) 楽観的 local state（UI 即時反映用）
  const [voted, setVoted] = useState<VoteValue | null>(storedVote);

  // 3) hydration 後に storedVote が変わったら voted に反映（render 中 sync）
  //    上記「親 prop の変化を render 中に検知して state を同期」参照
  const [previousStored, setPreviousStored] = useState(storedVote);
  if (storedVote !== previousStored) {
    setPreviousStored(storedVote);
    if (voted === null && storedVote !== null) setVoted(storedVote);
  }

  const handleVote = (vote: VoteValue) => {
    if (voted) return;
    setVoted(vote); // 即時 UI 反映
    writeToStorage(id, vote); // 永続化
    void sendVoteToServer(id, vote); // サーバー集計（fire-and-forget）
  };
}
```

参照実装: `src/app/(public)/faq/_components/faq-helpful-vote.tsx`

**アンチパターン:**

```tsx
// NG: useState lazy initializer で localStorage を読む → hydration mismatch
const [voted, setVoted] = useState(() => readFromStorage(id));

// NG: useEffect で storedVote → voted を同期 → set-state-in-effect 警告
useEffect(() => {
  if (storedVote) setVoted(storedVote);
}, [storedVote]);
```

## dismissable alert: signature-based persistence

「ユーザーが了解した」を表現する dismiss ボタンは、bare `dismissed: true` flag ではなく **dismiss 対象の状態を encode した signature を保存**する。状態が変わったら signature 不一致で自動再表示されるため、新しい未設定項目・新しい警告が出たときに silently skip される silent bug を防ぐ。

- **signature**: 対象 key を `.toSorted((a, b) => a.localeCompare(b)).join(",")` で安定化（順序非依存）
- **読み取り**: `useSyncExternalStore`（hydration mismatch 回避、上記 §useSyncExternalStore 参照）
- **楽観的更新**: dismiss クリック時に `setOptimisticDismissed(true)` で即時非表示 + `localStorage.setItem` で永続化
- **判定**: `persistedSignature === currentSignature || optimisticDismissed` で hide
- **scope**: ノイズ化防止のため、表示は責務領域（例: integration alert なら `/admin/settings`）に絞る
- **localStorage 失敗ハンドリング**: try/catch で握り、本セッションのみ optimistic で非表示にフォールバック（Safari Private Mode 対応）

参照実装: `src/app/(admin)/admin/(dashboard)/_components/IntegrationHealthAlertClient.tsx`
