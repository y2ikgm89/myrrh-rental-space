# Puck vs GrapesJS 詳細比較

## 概要

このドキュメントは、Next.js 16 / React 19 / TypeScript環境でのノーコードビジュアルエディター選択において、**Puck**と**GrapesJS**を詳細に比較したものです。

現在のプロジェクトではGrapesJSが実装済みですが、移行を検討する際の判断材料として作成しました。

---

## 1. 基本情報

| 項目               | Puck                                                  | GrapesJS                                          |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------- |
| **ライセンス**     | MIT（完全オープンソース）                             | MIT（完全オープンソース）                         |
| **公式リポジトリ** | [puckeditor/puck](https://github.com/puckeditor/puck) | [artf/grapesjs](https://github.com/artf/grapesjs) |
| **初回リリース**   | 2023年                                                | 2014年                                            |
| **最新バージョン** | v2.x（2025年1月時点）                                 | v0.22.14（2025年1月時点）                         |
| **TypeScript対応** | ✅ 完全対応                                           | ✅ 完全対応                                       |
| **React統合**      | ✅ ネイティブ（React専用）                            | ⚠️ プラグイン経由（`@grapesjs/react`）            |
| **Next.js対応**    | ✅ 優秀                                               | ⚠️ やや複雑（SSR回避が必要）                      |
| **日本語対応**     | ⚠️ 部分対応（カスタムラベル可、UIは英語）             | ✅ 完全対応（プラグインで日本語化可能）           |

---

## 1.5 日本語対応（i18n）

### 1.5.1 Puck

**現状：**

- **標準i18n機能**: ❌ なし（組み込みの国際化機能なし）
- **カスタムラベル**: ✅ 可能（コンポーネントの`label`プロパティで日本語設定可能）
- **エディターUI**: ⚠️ 英語のまま（ボタン、メニューなどは英語）
- **外部ライブラリ統合**: ✅ 可能（react-i18next、react-intlなどと統合可能）

**実装例：**

```typescript
// コンポーネントラベルを日本語化
const config = {
  components: {
    HeadingBlock: {
      label: "見出し", // 日本語ラベル
      fields: {
        title: {
          type: "text",
          label: "タイトル" // フィールドラベルも日本語化可能
        }
      },
      render: ({ title }) => <h1>{title}</h1>
    },
    ReservationForm: {
      label: "予約フォーム",
      fields: {
        spaceId: {
          type: "text",
          label: "スペースID"
        }
      },
      render: ({ spaceId }) => <ReservationForm spaceId={spaceId} />
    }
  }
}
```

**制限事項：**

- エディターUI（「Add」、「Delete」、「Duplicate」などのボタン）は英語のまま
- サイドバーのカテゴリ名なども英語
- 完全な日本語化には外部ライブラリとの統合が必要

**外部ライブラリ統合例：**

```typescript
// react-i18nextを使用した例（推奨）
import { useTranslation } from "react-i18next";

const config = {
  components: {
    HeadingBlock: {
      label: t("components.heading"), // 翻訳キーから取得
      // ...
    },
  },
};
```

### 1.5.2 GrapesJS

**現状：**

- **標準i18n機能**: ✅ あり（プラグインで日本語化可能）
- **エディターUI**: ✅ 完全日本語化可能
- **カスタムラベル**: ✅ 可能（ブロック、カテゴリ、トレイトなど）

**実装例：**

```typescript
// プラグインオプションで日本語化
const pluginsOpts = {
  "grapesjs-preset-webpage": {
    modalImportTitle: "HTMLをインポート",
    modalImportButton: "インポート",
  },
  "grapesjs-blocks-basic": {
    category: "基本",
    blocks: ["column1", "column2", "column3"],
  },
  "grapesjs-plugin-forms": {
    category: "フォーム",
  },
};

// カスタムブロックの日本語ラベル
blockManager.add("reservation-form", {
  label: "予約フォーム",
  category: "フォーム",
  // ...
});
```

**メリット：**

- エディターUI全体を日本語化可能
- プラグイン経由で簡単に設定可能
- コミュニティプラグインで日本語対応済みのものもある

---

## 2. アーキテクチャと設計思想

### 2.1 Puck

**設計思想：**

- **Reactファースト**: Reactコンポーネントを直接使用
- **コンポーネントベース**: 既存のReactコンポーネントを再利用可能
- **シンプルなデータ構造**: JSON形式でコンポーネントツリーを保存
- **軽量**: 最小限の機能に特化

**アーキテクチャ：**

```
Puck Editor
  ├── Component Config (React Components)
  ├── Field Definitions (Form Fields)
  └── Data Structure (JSON)
```

**データ形式：**

```typescript
// Puckのデータ構造
{
  root: { id: "root" },
  content: [
    {
      type: "HeadingBlock",
      props: { title: "Hello World" },
      id: "heading-1"
    }
  ]
}
```

### 2.2 GrapesJS

**設計思想：**

- **フレームワーク非依存**: バニラJSベース、Reactは後付け
- **HTML/CSS直接編集**: 低レベルなHTML/CSS操作をサポート
- **プラグインシステム**: 豊富なプラグインエコシステム
- **包括的**: エディター、スタイルマネージャー、レイヤーパネルなど

**アーキテクチャ：**

```
GrapesJS Editor
  ├── Core (Vanilla JS)
  ├── Plugins (preset-webpage, blocks-basic, etc.)
  ├── React Wrapper (@grapesjs/react)
  └── Project Data (JSON)
```

**データ形式：**

```typescript
// GrapesJSのProjectData構造
{
  id: "project-id",
  pages: [{
    frames: [{
      component: {
        type: "text",
        components: [...],
        styles: {...}
      }
    }]
  }],
  styles: [...]
}
```

---

## 3. 実装の複雑さ

### 3.1 セットアップと初期化

#### Puck

```typescript
// シンプルなセットアップ
import { Puck } from "@measured/puck"
import "@measured/puck/puck.css"

const config = {
  components: {
    HeadingBlock: {
      fields: { title: { type: "text" } },
      render: ({ title }) => <h1>{title}</h1>
    }
  }
}

function Editor() {
  return <Puck config={config} data={initialData} onPublish={save} />
}
```

**複雑度：** ⭐⭐☆☆☆（低）

#### GrapesJS

```typescript
// 複雑なセットアップ
import grapesjs from 'grapesjs'
import GjsEditor from '@grapesjs/react'

// プラグインの非同期ロード
async function loadPluginsWithOptions() {
  const [presetWebpage, blocksBasic, blocksFlexbox, pluginForms] = await Promise.all([
    import('grapesjs-preset-webpage').then((m) => m.default),
    import('grapesjs-blocks-basic').then((m) => m.default),
    import('grapesjs-blocks-flexbox').then((m) => m.default),
    import('grapesjs-plugin-forms').then((m) => m.default),
  ])
  return { plugins: [...], pluginsOpts: {...} }
}

// SSR回避ラッパーが必要
function GrapesJSEditorWrapper() {
  const [isReady, setIsReady] = useState(false)
  // ... 複雑な初期化ロジック
}
```

**複雑度：** ⭐⭐⭐⭐☆（高）

### 3.2 カスタムコンポーネントの追加

#### Puck

```typescript
// 既存のReactコンポーネントを直接使用
const config = {
  components: {
    ReservationForm: {
      fields: {
        spaceId: { type: "text" },
        hourlyPrice: { type: "number" }
      },
      render: ({ spaceId, hourlyPrice }) => (
        <ReservationForm spaceId={spaceId} hourlyPrice={hourlyPrice} />
      )
    }
  }
}
```

**メリット：**

- 既存のReactコンポーネントをそのまま再利用
- TypeScriptの型安全性が保たれる
- テスト済みコンポーネントを活用可能

#### GrapesJS

```typescript
// カスタムブロックの登録が必要
function registerReservationFormBlock(editor: Editor): void {
  const blockManager = editor.BlockManager;

  blockManager.add("reservation-form", {
    label: "予約フォーム",
    category: "フォーム",
    content: {
      type: "reservation-form",
      components: '<div class="gjs-reservation-form">...</div>',
    },
  });

  editor.DomComponents.addType("reservation-form", {
    isComponent: (el) => el.classList?.contains("gjs-reservation-form"),
    model: {
      defaults: {
        traits: [
          { type: "text", name: "space-id", label: "スペースID" },
          { type: "number", name: "hourly-price", label: "時間単価" },
        ],
      },
    },
    view: {
      // 複雑なビュー定義
    },
  });
}
```

**デメリット：**

- 既存のReactコンポーネントを直接使用できない
- HTML文字列ベースの定義が必要
- レンダリング時にReactコンポーネントへの変換が必要

---

## 4. Next.js統合

### 4.1 Server-Side Rendering (SSR)

#### Puck

```typescript
// Next.js App Routerで直接使用可能
'use client'

import { Puck } from "@measured/puck"

export default function EditorPage() {
  return <Puck config={config} data={data} onPublish={save} />
}
```

**SSR対応：** ✅ 問題なし（Reactコンポーネントとして動作）

#### GrapesJS

```typescript
// SSR回避が必要
import dynamic from 'next/dynamic'

const GrapesJSEditorWrapper = dynamic(
  () => import('@/components/admin/editor/grapesjs/GrapesJSEditorWrapper'),
  { ssr: false }
)

export default function EditorPage() {
  return <GrapesJSEditorWrapper {...props} />
}
```

**SSR対応：** ⚠️ `ssr: false`が必要（ブラウザAPI依存のため）

### 4.2 データフェッチング

#### Puck

```typescript
// Server Componentでデータ取得
async function EditorPage({ params }: { params: { id: string } }) {
  const page = await getPage(params.id)

  return (
    <ClientEditor initialData={page.puckData} />
  )
}
```

#### GrapesJS

```typescript
// 同様にServer Componentで取得可能
async function EditorPage({ params }: { params: { id: string } }) {
  const page = await getGrapesPage(params.id)

  return (
    <GrapesJSEditorWrapper projectData={page.projectData} />
  )
}
```

**比較：** どちらも同様に実装可能

---

## 5. パフォーマンス

### 5.1 バンドルサイズ

| ライブラリ   | バンドルサイズ（gzip） | 依存関係               |
| ------------ | ---------------------- | ---------------------- |
| **Puck**     | ~50KB                  | 最小限（Reactのみ）    |
| **GrapesJS** | ~200KB+                | 多数（プラグイン含む） |

**詳細：**

**Puck:**

- コアライブラリのみ
- React依存のみ
- プラグイン不要

**GrapesJS:**

- コアライブラリ: ~150KB
- `@grapesjs/react`: ~20KB
- `grapesjs-preset-webpage`: ~30KB
- `grapesjs-blocks-basic`: ~15KB
- `grapesjs-blocks-flexbox`: ~10KB
- `grapesjs-plugin-forms`: ~10KB
- **合計: ~235KB+**

### 5.2 初期ロード時間

#### Puck

- **初回ロード:** 即座（Reactコンポーネントとして動作）
- **コード分割:** 自動（Next.jsの動的インポート）
- **Tree Shaking:** 完全対応

#### GrapesJS

- **初回ロード:** プラグインの非同期ロードが必要（~300ms）
- **コード分割:** 手動実装が必要
- **Tree Shaking:** 部分的（プラグインは個別ロード）

### 5.3 ランタイムパフォーマンス

#### Puck

- **レンダリング:** Reactの仮想DOMを使用（最適化済み）
- **更新:** Reactの差分更新アルゴリズム
- **メモリ使用量:** 低（Reactコンポーネントのみ）

#### GrapesJS

- **レンダリング:** 独自のDOM操作（直接操作）
- **更新:** イベントベースの更新
- **メモリ使用量:** 中〜高（エディター状態、プラグイン）

---

## 6. データモデルと保存形式

### 6.1 データ構造

#### Puck

```typescript
// シンプルなJSON構造
interface PuckData {
  root: { id: string }
  content: Array<{
    type: string
    props: Record<string, any>
    id: string
  }>
}

// データベース保存例
model Page {
  id          String   @id
  puckData    Json     // PuckData形式
  content     String   @db.Text // レンダリング済みHTML（オプション）
}
```

**メリット：**

- 構造がシンプルで理解しやすい
- TypeScript型定義が容易
- バージョン管理が簡単

#### GrapesJS

```typescript
// 複雑なProjectData構造
interface ProjectData {
  id: string
  pages: Array<{
    frames: Array<{
      component: {
        type: string
        components: Array<any>
        styles: Record<string, any>
        attributes: Record<string, any>
      }
    }>
  }>
  styles: Array<any>
}

// データベース保存例
model GrapesPage {
  id          String   @id
  projectData Json     // ProjectData形式
  content     String   @db.Text // レンダリング済みHTML
}
```

**デメリット：**

- 構造が複雑で理解が困難
- 型定義が複雑
- バージョン管理時の差分が大きい

### 6.2 レンダリング

#### Puck

```typescript
// 公開ページでのレンダリング
import { Render } from "@measured/puck"

export default function PublicPage({ page }: { page: Page }) {
  return <Render config={config} data={page.puckData} />
}
```

**メリット：**

- Reactコンポーネントとして直接レンダリング
- サーバーサイドレンダリング可能
- 既存のReactコンポーネントをそのまま使用

#### GrapesJS

```typescript
// HTML文字列をレンダリング
import { renderGrapesJSContent } from '@/lib/grapesjs-renderer'

export default function PublicPage({ page }: { page: GrapesPage }) {
  // HTML文字列をサニタイズ・変換
  const html = renderGrapesJSContent(page.content)

  return (
    <div dangerouslySetInnerHTML={{ __html: html }} />
  )
}
```

**デメリット：**

- HTML文字列ベース（Reactの利点を活かせない）
- サニタイズが必要
- プレースホルダーの置換処理が必要
- サーバーサイドレンダリングが複雑

---

## 7. カスタマイズ性

### 7.1 UI/UXカスタマイズ

#### Puck

- **エディターUI:** 限定的（シンプルなデザイン）
- **カスタマイズ:** CSS変数でテーマ変更可能
- **拡張性:** プラグインシステムなし（シンプルさを優先）

#### GrapesJS

- **エディターUI:** 完全カスタマイズ可能
- **カスタマイズ:** CSS、JavaScriptで自由に変更
- **拡張性:** 豊富なプラグインエコシステム

### 7.2 機能拡張

#### Puck

```typescript
// カスタムフィールドタイプの追加
const config = {
  fields: {
    customColor: {
      type: "custom",
      render: ({ value, onChange }) => (
        <ColorPicker value={value} onChange={onChange} />
      )
    }
  },
  components: {
    MyComponent: {
      fields: {
        color: { type: "customColor" }
      }
    }
  }
}
```

**制限：**

- プラグインシステムなし
- 機能追加はコードベースでの実装が必要

#### GrapesJS

```typescript
// プラグインの追加
import customPlugin from "./custom-plugin";

editor.use(customPlugin, {
  // プラグインオプション
});
```

**メリット：**

- 豊富なプラグインエコシステム
- コミュニティプラグインの利用可能
- 機能追加が容易

---

## 8. 開発者体験（DX）

### 8.1 TypeScriptサポート

#### Puck

```typescript
// 完全な型安全性
import type { Config, Data } from "@measured/puck"

const config: Config = {
  components: {
    HeadingBlock: {
      fields: {
        title: { type: "text" }
      },
      render: ({ title }: { title: string }) => <h1>{title}</h1>
    }
  }
}

function Editor({ data }: { data: Data }) {
  return <Puck config={config} data={data} onPublish={save} />
}
```

**メリット：**

- 完全な型推論
- コンポーネントのprops型が自動推論
- エディタでの補完が完璧

#### GrapesJS

```typescript
// 型定義が複雑
import type { Editor, ProjectData } from "grapesjs";

// ProjectDataの型が複雑で推論が困難
function handleProjectChange(data: ProjectData) {
  // 型安全性が低い
  const pages = data.pages; // any型に近い
}
```

**デメリット：**

- 型定義が複雑
- 型推論が困難
- エディタでの補完が限定的

### 8.2 デバッグ

#### Puck

- **React DevTools:** 完全対応
- **デバッグ:** 通常のReactコンポーネントとしてデバッグ可能
- **エラー追跡:** Reactのエラーバウンダリーで捕捉可能

#### GrapesJS

- **React DevTools:** 限定的（GrapesJS内部はReact外）
- **デバッグ:** ブラウザの開発者ツールでDOMを直接確認
- **エラー追跡:** GrapesJS内部のエラーは追跡が困難

### 8.3 テスト

#### Puck

```typescript
// React Testing Libraryでテスト可能
import { render, screen } from '@testing-library/react'
import { Render } from "@measured/puck"

test('renders heading', () => {
  const data = {
    root: { id: "root" },
    content: [{ type: "HeadingBlock", props: { title: "Test" }, id: "1" }]
  }

  render(<Render config={config} data={data} />)
  expect(screen.getByText("Test")).toBeInTheDocument()
})
```

**メリット：**

- 標準的なReactテストツールを使用可能
- コンポーネント単体テストが容易

#### GrapesJS

```typescript
// HTML文字列のテストが必要
import { renderGrapesJSContent } from "@/lib/grapesjs-renderer";

test("renders heading", () => {
  const html = renderGrapesJSContent("<h1>Test</h1>");
  expect(html).toContain("Test");
});
```

**デメリット：**

- HTML文字列ベースのテスト
- Reactコンポーネントとしてテストできない

---

## 9. 学習曲線

### 9.1 開発者

| 項目                           | Puck    | GrapesJS |
| ------------------------------ | ------- | -------- |
| **基本セットアップ**           | 30分    | 2-3時間  |
| **カスタムコンポーネント追加** | 1時間   | 3-4時間  |
| **高度な機能実装**             | 2-3時間 | 1-2日    |
| **ドキュメントの充実度**       | 中      | 高       |
| **コミュニティサポート**       | 小規模  | 大規模   |

### 9.2 コンテンツ作成者（エンドユーザー）

| 項目                 | Puck      | GrapesJS     |
| -------------------- | --------- | ------------ |
| **UIの直感性**       | ⭐⭐⭐⭐☆ | ⭐⭐⭐☆☆     |
| **学習時間**         | 30分      | 1-2時間      |
| **機能の多さ**       | シンプル  | 豊富（複雑） |
| **エラーの発生頻度** | 低        | 中           |

---

## 10. プロジェクトへの適合度

### 10.1 現在のプロジェクト要件

**技術スタック：**

- Next.js 16.1.1
- React 19.2.3
- TypeScript 5.9.3
- Prisma 7.2.0
- Bun 1.3.5

**既存実装：**

- GrapesJSが既に実装済み
- カスタムブロック（予約フォーム、お問い合わせフォームなど）
- バージョン管理機能
- データベース統合

### 10.2 Puckへの移行メリット

✅ **メリット：**

1. **React統合が自然**: 既存のReactコンポーネントを直接使用可能
2. **バンドルサイズ削減**: ~200KB削減可能
3. **型安全性向上**: TypeScriptの型推論が完璧
4. **テスト容易性**: React Testing Libraryでテスト可能
5. **SSR対応**: Next.jsのSSRをフル活用可能
6. **保守性向上**: シンプルなコードベース

❌ **デメリット：**

1. **移行コスト**: 既存のGrapesJS実装を書き直しが必要
2. **機能の再実装**: カスタムブロックをReactコンポーネントとして再実装
3. **学習コスト**: チームメンバーの学習が必要
4. **プラグイン不足**: 豊富なプラグインエコシステムがない

### 10.3 GrapesJS継続のメリット

✅ **メリット：**

1. **既存実装の活用**: 移行コストなし
2. **豊富な機能**: プラグインエコシステム
3. **柔軟性**: HTML/CSS直接編集可能
4. **コミュニティ**: 大規模なコミュニティサポート

❌ **デメリット：**

1. **バンドルサイズ**: 大きい（~235KB+）
2. **型安全性**: 限定的
3. **SSR対応**: 複雑（`ssr: false`が必要）
4. **React統合**: やや不自然

---

## 11. 移行シナリオ

### 11.1 段階的移行（推奨）

**フェーズ1: プロトタイプ（1-2週間）**

- 小規模なページでPuckを試用
- 既存のReactコンポーネントをPuckコンポーネントとして登録
- パフォーマンス比較

**フェーズ2: 並行運用（1-2ヶ月）**

- 新規ページはPuckで作成
- 既存ページはGrapesJSで継続
- データベースに両方の形式を保存

**フェーズ3: 完全移行（2-3ヶ月）**

- 既存ページをPuck形式に変換
- GrapesJSコードを削除
- ドキュメント更新

### 11.2 移行コスト見積もり

| 作業項目                       | 工数        | 備考                                   |
| ------------------------------ | ----------- | -------------------------------------- |
| **Puckセットアップ**           | 1日         | 基本実装                               |
| **カスタムコンポーネント移行** | 3-5日       | 予約フォーム、お問い合わせフォームなど |
| **データ移行スクリプト**       | 2-3日       | GrapesJS → Puck形式変換                |
| **既存ページの移行**           | 5-10日      | ページ数による                         |
| **テスト・デバッグ**           | 3-5日       | 品質保証                               |
| **ドキュメント更新**           | 1-2日       | 開発者向けドキュメント                 |
| **合計**                       | **15-26日** | 約3-5週間                              |

---

## 12. 推奨事項

### 12.1 現状維持（GrapesJS継続）を推奨する場合

以下の条件に該当する場合、GrapesJS継続を推奨：

1. ✅ **既存実装が安定している**
2. ✅ **バンドルサイズが問題にならない**
3. ✅ **HTML/CSS直接編集が必要**
4. ✅ **プラグインエコシステムを活用したい**
5. ✅ **移行コストを避けたい**

### 12.2 Puckへの移行を推奨する場合

以下の条件に該当する場合、Puckへの移行を推奨：

1. ✅ **React/Next.jsの利点を最大限活用したい**
2. ✅ **バンドルサイズを削減したい**
3. ✅ **型安全性を重視する**
4. ✅ **既存のReactコンポーネントを活用したい**
5. ✅ **SSRをフル活用したい**
6. ✅ **長期的な保守性を重視する**

---

## 13. 結論

### 13.1 技術的観点

**Puckの優位性：**

- React/Next.js統合が自然
- 型安全性が高い
- バンドルサイズが小さい
- テストが容易

**GrapesJSの優位性：**

- 機能が豊富
- プラグインエコシステム
- HTML/CSS直接編集
- コミュニティが大きい

### 13.2 プロジェクト観点

**現時点での推奨：**

- **短期（3-6ヶ月）**: GrapesJS継続
  - 既存実装が安定
  - 移行コストを避ける
  - 機能要件を満たしている

- **中期（6-12ヶ月）**: Puckのプロトタイプ検証
  - 小規模なページで試用
  - パフォーマンス比較
  - 移行コストの精査

- **長期（12ヶ月以降）**: 移行検討
  - プロトタイプ結果を評価
  - 段階的移行の実施

---

## 14. 参考資料

### 14.1 公式ドキュメント

- **Puck**: [https://puckeditor.com/docs](https://puckeditor.com/docs)
- **GrapesJS**: [https://grapesjs.com/docs](https://grapesjs.com/docs)

### 14.2 GitHubリポジトリ

- **Puck**: [https://github.com/puckeditor/puck](https://github.com/puckeditor/puck)
- **GrapesJS**: [https://github.com/artf/grapesjs](https://github.com/artf/grapesjs)

### 14.3 プロジェクト内ドキュメント

- `docs/plans/016-grapesjs-visual-editor.md` - GrapesJS実装計画
- `docs/plans/017-grapesjs-custom-blocks.md` - カスタムブロック実装
- `docs/plans/018-grapesjs-database-integration.md` - データベース統合

---

**最終更新日:** 2025年1月13日  
**作成者:** AI Assistant  
**レビュー状況:** 未レビュー
