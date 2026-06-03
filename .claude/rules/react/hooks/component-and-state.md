---
description: Outer/Inner Component Split (Rules of Hooks 回避) + thin dispatcher 削除 + useReducer cascade + startTransition + conform fields.x.value リアクティブ
paths:
  - "src/**/*.tsx"
  - "src/**/use-*.ts"
  - "src/**/use[A-Z]*.ts"
  - "src/**/hooks.ts"
  - "src/**/hooks/**/*.ts"
  - "src/**/_hooks/**/*.ts"
  - "src/**/editor/**/*.ts"
  - "src/shared/lib/conform/**"
---

# Component Split + State 管理 hooks

> Outer/Inner gate 分離 / thin dispatcher clean-break / `useReducer` カスケード / `startTransition` イベント駆動 / conform `fields.x.value` リアクティブ。

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

## Thin mode dispatcher は clean-break で削除推奨

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

## useReducer — カスケードステート管理（React 公式推奨）

関連する複数の `useState` がカスケードリセット（親変更→子リセット）を伴う場合、`useReducer` で一元化する（[React 公式: Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer)）。

**判断基準**: リセットが 3 段以上連鎖する場合は `useReducer` を選択

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

## conform — `fields.x.value` はリアクティブ

conform の `fields.x.value` は render ごとに最新値を返すリアクティブな参照。**render 中に直接使用してよい**。クロスフィールドの値参照は `form.value.fieldName` を使う（`useWatch` / `form.getValues` 等の RHF 固有 API は package.json から削除済）。

```typescript
// OK: fields.x.value はリアクティブ（値が更新されると再レンダリング）
<Summary date={fields.date.value ?? ""} />

// OK: クロスフィールド参照は form.value
const locationId = form.value?.locationId ?? null;
```

## useOptimistic — UI 選択状態と楽観的サーバー状態の分離

`useOptimistic` setter は React 19 公式仕様で **`startTransition` または action 内のみ** 呼出可能。純粋な UI クリックハンドラ（サーバーアクションを伴わない選択状態の更新等）から setter を呼ぶと `An optimistic state update occurred outside a transition or action` warning が発生する。

```typescript
// NG: 選択 dialog の表示状態を useOptimistic で管理 → click handler が transition 外で setter 呼出
const [selectedEvent, setSelectedEvent] = useOptimistic<
  Event | null,
  Event | null
>(null, (_, next) => next);
const handleClick = (event: Event) => {
  setSelectedEvent(event); // warning: outside transition
};

// OK: UI 選択状態は useState で id を保持、選択中 entity は optimisticArray から派生
const [selectedId, setSelectedId] = useState<string | null>(null);
const selected =
  selectedId !== null
    ? (optimisticEvents.find((e) => e.id === selectedId) ?? null)
    : null;
const handleClick = (event: Event) => setSelectedId(event.id);
```

**判定基準**: 「純粋な UI 選択状態」（dialog 表示対象 / focused row 等）は `useState`、「サーバー mutation の楽観的 preview」は `useOptimistic`。両者を 1 つの `useOptimistic` にまとめると click handler の transition 外呼出 warning + 二重 state 管理（status 楽観更新を per-state に手動同期する必要）の二重不利益が発生する。**派生設計に分離**すれば status 楽観更新も `optimisticArray` 経由で自動反映され二重 state も解消する。

参照実装: `reservations/_components/calendar/hooks/use-event-actions.ts`（2026-05-12 修正、`selectedEvent` を `useOptimistic` から `useState<id> + derive` に clean break）
