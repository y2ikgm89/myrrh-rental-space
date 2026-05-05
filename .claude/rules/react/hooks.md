---
description: React フックパターン（Outer/Inner Split・useReducer・startTransition・useSyncExternalStore・headless UI）
paths:
  - "src/**/*.tsx"
  - "src/**/*.ts"
---

# React フックパターン

> React 19.2 / React Compiler 1.0 対応

## Outer/Inner Component Split（gate + hooks 分離パターン）

フィーチャーフラグ・権限・props 値によって「早期 return するか / 完全な form を描画するか」を切り替えたいが、描画側が hooks を使う場合、単一コンポーネントで `if (!flag) return <Disabled />` を hooks の前に置くと Rules of Hooks 違反（`@eslint-react/rules-of-hooks` / `react-hooks/rules-of-hooks`）になる。

解決パターン: outer（gate、hooks なし）と inner（module-local、全 hooks）に分離する:

```tsx
type Props = { flag: boolean; reservationId: string /* ... */ };
type InnerProps = Omit<Props, "flag">;

export function MyForm({ flag, ...rest }: Props) {
  if (!flag) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-muted-foreground">
          この機能は無効化されています。
        </p>
      </div>
    );
  }
  return (
    <MyFormInner
      reservationId={rest.reservationId} /* ...explicit forwarding... */
    />
  );
}

function MyFormInner({ reservationId /* ... */ }: InnerProps) {
  const [state, setState] = useState(/* ... */); // hooks は常に unconditional
  const ref = useRef<HTMLFormElement>(null);
  const form = usePublicForm(/* ... */);
  // ...
  return <form>{/* ... */}</form>;
}
```

**ルール:**

- **outer に hooks を置かない** — 完全に pure な gate にする（`useState` / `useEffect` / `useWatch` 等一切禁止）
- **inner は module-local（非 export）** — 外部 API を広げない
- **props は `Omit<Props, "flag">` で inner 型を導出** — flag の forwarding を型レベルで防ぐ
- **`{...rest}` spread 禁止** — flag が inner に漏れる事故防止のため、明示的に per-name forward する
- **outer で分岐する条件は props のみ** — inner の render 結果に依存する条件を outer で使わない（相互再帰になる）

**いつ使うか:**

- フィーチャーフラグ（`reviewsEnabled` 等のスペース単位トグル）による render 分岐
- 権限チェック（`canEdit` / `isOwner`）による UI 切り替え
- 認証状態による「ログインメッセージ」vs「実際のフォーム」切り替え
- 早期 return で hooks の前に出したい全てのケース

参照実装: `src/app/(public)/mypage/reservations/[id]/_components/review-form.tsx`（`reviewsEnabled` による投稿フォーム gate）

### Thin mode dispatcher は clean-break で削除推奨

`if (mode === "x") return <X/>; return <Y/>` + 軽微な state 変換（一度だけ行う HTML→JSON 等）だけの dispatcher は、routing を pages に inline + state 変換を使用する component に移譲して削除する。dispatcher 層の `useState` は上記 Outer/Inner Component Split strict 規則（outer に hooks を置かない）違反。mode が props 由来で runtime 変化しない場合、discriminated union props も不要。

**判断基準（dispatcher 削除適用）**:

- dispatcher 本体が hooks + `if (mode) return <X/>` の 2 要素のみ
- hooks の state が mode branch の一方でのみ使われる
- pages が静的に mode を選択できる（`new/page.tsx` は常に create、`[id]/edit/page.tsx` は常に edit 等）

**clean-break 手順**:

1. dispatcher が持つ state 変換（HTML→JSON 等）を、実際に使用する inner component 内へ `useState` 遅延初期化で移譲
2. inner component の props API を「変換前の生データ」を受ける形に変更（`resolvedContentJson: string | null` → `initialTemplateHtml: string | null` 等）
3. pages が dispatcher 経由ではなく inner component を直接 import（`TermsInlineEditor` → `TermsInlineEditorCreate` / `TermsInlineEditorEdit`）
4. `mode` prop と discriminated union props 型を削除
5. dispatcher ファイルを削除（barrel 再 export 禁止の項と同じく後方互換シム不要）

参照実装: `terms/new/page.tsx` が `TermsInlineEditorCreate` を直接 import、`terms/[id]/edit/page.tsx` が `TermsInlineEditorEdit` を直接 import（2026-04-22 削除事例、`TermsInlineEditor.tsx` 93 行 dispatcher 削除）

---

## useReducer — カスケードステート管理（React 公式推奨）

関連する複数の `useState` がカスケードリセット（親変更→子リセット）を伴う場合、`useReducer` で一元化する（[React 公式: Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer)）。

**判断基準**: リセットが3段以上連鎖する場合は `useReducer` を選択

```typescript
// NG: 7つの useState + 各ハンドラで 3〜5個の set* が散在
const [locationId, setLocationId] = useState(null);
const [spaceId, setSpaceId] = useState(null);
const [date, setDate] = useState(undefined);
// handleLocationSelect 内で: setSpaceId(null); setDate(undefined); setTime(null); ...

// OK: useReducer でカスケードリセットを reducer に一元化
type Action =
  | { type: "selectLocation"; id: string; autoSpaceId: string | null }
  | { type: "selectSpace"; id: string }
  | { type: "selectDate"; date: Date | undefined };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "selectLocation":
      return {
        ...state,
        locationId: action.id,
        spaceId: action.autoSpaceId,
        date: undefined,
        startTime: null,
        duration: null,
      };
    // ... 各アクションで下流ステートをリセット
  }
}
```

---

## startTransition — ユーザー操作起点のデータ取得（React 19 推奨）

ユーザー操作（ボタンクリック、セレクト変更等）に起因するデータ取得は、`useEffect` ではなくイベントハンドラ内の `startTransition` で実行する（[React 19 useTransition ドキュメント](https://react.dev/reference/react/useTransition)）。

```typescript
// NG: useEffect で依存値を監視してフェッチ（データフローが暗黙的）
useEffect(() => {
  if (!selectedDate) return;
  startTransition(async () => {
    const slots = await fetchSlots(spaceId, selectedDate);
    setSlots(slots);
  });
}, [selectedDate, spaceId]);

// OK: イベントハンドラ内で直接 startTransition（データフローが明示的）
function handleDateChange(date: Date | undefined) {
  dispatch({ type: "selectDate", date });
  if (date && spaceId) {
    startTransition(async () => {
      const slots = await fetchSlots(spaceId, formatDate(date));
      dispatch({ type: "setSlots", slots });
    });
  }
}
```

**`useEffect` が適切な場面**: 外部ストア同期（`useSyncExternalStore` 代替）、サブスクリプション（WebSocket、イベントリスナー）等、ユーザー操作に起因しない副作用のみ。

---

## React Hook Form — `form.getValues()` は非リアクティブ

`form.getValues()` はスナップショット読み取りであり、値が変わっても再レンダリングをトリガーしない。**render 中に使うとステールな値を表示する原因になる**。

```typescript
// NG: render 中の getValues（非リアクティブ — 値が更新されてもUIに反映されない）
<Summary date={form.getValues("date")} />

// OK: useState / useReducer の state を直接使用（リアクティブ）
<Summary date={state.date ? formatDateString(state.date) : ""} />

// OK: リアクティブに値を監視する必要がある場合は useWatch
const date = useWatch({ control: form.control, name: "date" });
```

**例外**: `handleSubmit` コールバック内、`trigger()` 後の条件判定等、イベントハンドラ内での使用は安全。

---

> **詳細リファレンス（React 19.2 新API / Compiler 制限事項）**: `docs/reference/react-api.md`

---

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

### 外部ストア + 楽観的 local state の併用パターン

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

### dismissable alert: signature-based persistence

「ユーザーが了解した」を表現する dismiss ボタンは、bare `dismissed: true` flag ではなく **dismiss 対象の状態を encode した signature を保存**する。状態が変わったら signature 不一致で自動再表示されるため、新しい未設定項目・新しい警告が出たときに silently skip される silent bug を防ぐ。

- **signature**: 対象 key を `.toSorted((a, b) => a.localeCompare(b)).join(",")` で安定化（順序非依存）
- **読み取り**: `useSyncExternalStore`（hydration mismatch 回避、上記 §useSyncExternalStore 参照）
- **楽観的更新**: dismiss クリック時に `setOptimisticDismissed(true)` で即時非表示 + `localStorage.setItem` で永続化
- **判定**: `persistedSignature === currentSignature || optimisticDismissed` で hide
- **scope**: ノイズ化防止のため、表示は責務領域（例: integration alert なら `/admin/settings`）に絞る
- **localStorage 失敗ハンドリング**: try/catch で握り、本セッションのみ optimistic で非表示にフォールバック（Safari Private Mode 対応）

参照実装: `src/app/(admin)/admin/(dashboard)/_components/IntegrationHealthAlertClient.tsx`

---

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
