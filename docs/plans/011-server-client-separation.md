# 011-server-client-separation.md

D&DページのServer/Client Component分離

## 完了日

2026-01-11

## 背景

D&D（ドラッグ&ドロップ）機能を持つページが全体としてClient Componentになっていた。
Next.js公式ベストプラクティスに準拠し、Server ComponentでデータフェッチしてClient Componentに渡すパターンに変更。

## 実装内容

### アーキテクチャ変更

**Before:**

```
page.tsx ('use client')
├── useEffect → Server Action呼び出し
├── useState でデータ管理
└── D&D + CRUD UI（全て1ファイル）
```

**After:**

```
page.tsx (Server Component)
├── async function: Server Actionでデータフェッチ
└── <ClientComponent initialData={...} />
    └── _components/Manager.tsx ('use client')
        ├── useState (initialDataで初期化)
        ├── D&D機能
        └── CRUD UI
```

### 変更ファイル

#### blog/categories

| ファイル                          | Before                 | After                          |
| --------------------------------- | ---------------------- | ------------------------------ |
| `page.tsx`                        | 506行 Client Component | 8行 Server Component           |
| `_components/CategoryManager.tsx` | -                      | 379行 Client Component（新規） |

**改善点:**

- 初期レンダリング時にServer側でデータ取得
- useEffectでのデータフェッチ不要
- 共通`DragHandle`コンポーネントを使用（重複削除）

#### settings/navigation

| ファイル                            | Before                  | After                          |
| ----------------------------------- | ----------------------- | ------------------------------ |
| `page.tsx`                          | 1068行 Client Component | 23行 Server Component          |
| `_components/NavigationManager.tsx` | -                       | 780行 Client Component（新規） |

**改善点:**

- 4つのServer Action並列実行（`Promise.all`）
- 初期データをpropsで渡す
- 共通`DragHandle`コンポーネントを使用（重複削除）

### 共通コンポーネント活用

`src/components/admin/ui/sortable.tsx`の`DragHandle`をインポートして使用。
各ページ内のローカルDragHandle定義を削除。

## 技術詳細

### Server Componentでのデータフェッチ

```typescript
// page.tsx (Server Component)
export default async function Page() {
  const data = await getServerAction()
  return <ClientComponent initialData={data} />
}
```

### Client Componentでの状態管理

```typescript
// _components/Manager.tsx
"use client";

export function Manager({ initialData }: Props) {
  const [data, setData] = useState(initialData);

  // 更新後の再取得
  const loadData = async () => {
    const fresh = await getServerAction();
    setData(fresh);
  };

  // D&D, CRUD handlers...
}
```

## 検証結果

- `bun run type-check` - 成功
- `bun run lint` - 警告のみ（既存のReact Hook Form互換性警告）
- `bun run build` - 成功

## メリット

1. **初期レンダリング高速化**: Server側でデータ取得済み
2. **SEO向上**: 初期HTMLにデータ含まれる
3. **コード重複削除**: 共通DragHandle使用
4. **関心の分離**: データフェッチ(Server) / インタラクション(Client)
5. **Next.js公式パターン準拠**: Server Components推奨アーキテクチャ
