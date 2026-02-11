# 技術スタック最新バージョン情報

> **Note**: このドキュメントは、プロジェクトで使用している技術スタックの最新バージョン情報をまとめたものです。最終更新: **2026-01-27**

---

## 調査方法

- Web検索による公式リリース情報の確認
- npm公式レジストリの確認
- GitHub公式リポジトリのリリース情報の確認

---

## コア技術

### React

- **現在のプロジェクトバージョン**: 19.2.3
- **最新安定版**: **19.2.3** (2026-01-27時点)
- **状態**: 安定版
- **React 19.2 新機能**:
  - **`<Activity>`**: UIと内部状態の非表示/復元API
  - **`useEffectEvent`**: 非反応的ロジックをEffect Eventに抽出
  - **`cacheSignal`** (RSC用): cache()のライフタイム終了を検知
  - **React Performance tracks**: ブラウザ開発者ツールのPerformanceパネルに表示
  - **`useId`プレフィックス変更**: `_r_`（19.2）← `«r»`（19.1）← `:r:`（19.0）
  - **Suspense境界のバッチ表示**: View Transitions対応
- **eslint-plugin-react-hooks**: flat config対応、React Compiler powered rules（オプトイン）
- **リリースノート**: [React 19.2 Blog](https://react.dev/blog/2025/10/01/react-19-2)

### Next.js

- **現在のプロジェクトバージョン**: 16.1.4
- **最新安定版**: **16.1.5** (2026-01-26 セキュリティリリース)
- **状態**: 安定版
- **重要なセキュリティ情報**:
  - **CVE-2025-59471, CVE-2025-59472, CVE-2026-23864**: 16.1.5で修正
  - **CVE-2025-55184** (高): React Server ComponentsのDoS脆弱性
  - **CVE-2025-55183** (中): ソースコード露出の脆弱性
  - Next.js 13.x, 14.x, 15.x, 16.xユーザーは即座にアップグレード推奨
- **主要機能**:
  - `'use cache'` ディレクティブ、`cacheLife()`, `cacheTag()`
  - `updateTag` (read-your-own-writes)
  - Build Adapters API
  - Turbopack File System Caching (stable)
- **リリースノート**: [Next.js Blog](https://nextjs.org/blog)

### TypeScript

- **現在のプロジェクトバージョン**: 5.9.3
- **最新安定版**: **5.9.3** (2026-01-27時点)
- **状態**: 安定版
- **重要な機能**:
  - 最小限で更新された`tsc --init`
  - `import defer`のサポート
  - `--module node20`のサポート
  - DOM APIのサマリ説明
  - 拡張可能なホバー（プレビュー）
- **将来のリリース**:
  - **TypeScript 6.0**: ブリッジリリース（5.9と7.0の間）、非推奨機能の移行準備
  - **TypeScript 7.0** (Project Corsa): Go言語によるネイティブ実装
    - プロジェクトロード時間が約8倍高速化
    - 型チェックがほぼ完成（5.9と同じエラーを検出）
    - プレビュー版: `npm install -D @typescript/native-preview`
    - Visual Studio 2026 Insidersで利用可能
- **リリースノート**: [TypeScript Blog](https://devblogs.microsoft.com/typescript/)

### Bun

- **現在のプロジェクトバージョン**: 1.3.x
- **最新安定版**: **1.3.5** (2026-01-13リリース)
- **状態**: 安定版
- **Bun 1.3 主要機能**:
  - **Bun.SQL**: MySQL, MariaDB, PostgreSQL, SQLiteの統合API（外部依存なし）
  - **HTML直接実行**: `bun index.html`でJavaScript/CSS/Reactを自動トランスパイル
  - **Hot Module Replacement**: React Fast Refresh内蔵
  - **Bun.Terminal API**: ターミナル操作API
  - **Content-Disposition**: S3アップロードサポート
- **所有者変更**: 2025年12月にAnthropicが買収（Claude Code, Agent SDKの基盤）
- **アップグレード方法**: `bun upgrade`
- **公式サイト**: [bun.sh](https://bun.sh)
- **リリースノート**: [Bun Blog](https://bun.com/blog)

---

## データベース & ORM

### Prisma

- **現在のプロジェクトバージョン**: 7.3.0
- **最新安定版**: **7.3.0** (2026-01-27時点)
- **状態**: 安定版
- **Prisma 7 主要機能**:
  - **パフォーマンス改善** (ArkType連携):
    - 型評価に必要な型が~98%削減
    - クエリ評価の型が~45%削減
    - フル型チェックが70%高速化
  - **Mapped Enums**: `@map`属性によるenum memberのマッピング
  - **新 Prisma Studio**: リッチな可視化、`--url`フラグでリモートDB検査可能
  - **Prisma Postgres**: 標準Postgres接続プロトコル対応（Cloudflare Hyperdrive, TablePlus等と互換）
- **重要な注意事項**:
  - Prisma 7では、データベース接続にdriver adaptersが必須
- **リリースノート**: [Prisma Blog](https://www.prisma.io/blog)

### Zod

- **現在のプロジェクトバージョン**: 4.3.6 ✅
- **最新安定版**: **4.3.6** (2026-01-27時点)
- **状態**: 安定版
- **Zod 4 主要機能**:
  - **パフォーマンス**: string解析14倍、array解析7倍、object解析6.5倍高速化
  - **バンドルサイズ**: コアバンドルが~57%縮小（Zod 3の2.3倍小さい）
  - **`{ error: }` パラメータ**: `{ message: }` は非推奨
  - **`z.fromJSONSchema()`**: JSON SchemaからZodスキーマを生成（draft-2020-12, draft-7, draft-4, OpenAPI 3.0対応）
  - **@zod/mini**: ~1.9KB gzippedの軽量版（tree-shakable）
- **エコシステム**: Hono, LangChain, React Hook Form等がZod 3/4両対応
- **npm**: [zod package](https://www.npmjs.com/package/zod)

---

## UI & スタイリング

### Tailwind CSS

- **現在のプロジェクトバージョン**: 4.1.18
- **最新安定版**: **4.1.18** (2026-01-05時点)
- **状態**: 安定版
- **重要な変更**:
  - Tailwind CSS v4.0は2025-01-22にリリース（大幅な刷新）
  - 新しい高性能エンジン、設定の再設計、モダンなWebプラットフォームの活用
- **リリースノート**: [Tailwind CSS Blog](https://tailwindcss.com/blog)

### GSAP

- **最新安定版**: **3.14.2** (2026-01-05時点)
- **状態**: 安定版
- **用途**: 高性能JavaScriptアニメーションツールセット
- **npm**: [gsap package](https://www.npmjs.com/package/gsap)

### Three.js

- **最新安定版**: **0.182.0** (2026-01-05時点)
- **状態**: 安定版
- **用途**: 3Dグラフィックスライブラリ（公開ページ用）
- **注意事項**: 
  - Three.jsはリビジョンベースのバージョニングシステム（例: r182）を使用
  - npmではセマンティックバージョニング（例: 0.182.0）に変換
- **npm**: [three package](https://www.npmjs.com/package/three)

### @react-three/fiber

- **現在のプロジェクトバージョン**: 9.5.0
- **最新安定版**: **9.5.0** (2026-01-10時点)
- **状態**: 安定版
- **用途**: Three.jsのReactレンダラー（React Three Fiber）
- **重要な機能**:
  - React 19対応
  - 宣言的なReactコンポーネントとしてThree.jsシーンを構築可能
  - Server Componentsとの統合を考慮した実装が可能
- **npm**: [@react-three/fiber package](https://www.npmjs.com/package/@react-three/fiber)
- **公式サイト**: [React Three Fiber Documentation](https://r3f.docs.pmnd.rs)

### @react-three/drei

- **現在のプロジェクトバージョン**: 10.7.7
- **最新安定版**: **10.7.7** (2026-01-10時点)
- **状態**: 安定版
- **用途**: React Three Fiber用のヘルパーと抽象化ライブラリ
- **重要な機能**:
  - よく使う3Dコンポーネントのコレクション
  - カメラ、ライト、コントロールなどの便利なヘルパー
- **npm**: [@react-three/drei package](https://www.npmjs.com/package/@react-three/drei)

### Pixi.js

- **最新安定版**: **8.15.0** (2026-01-05時点)
- **状態**: 安定版
- **重要な修正**:
  - ステージ`Container`が既に存在する場合、初期化時にのみ作成されるように修正
- **用途**: 2Dグラフィックスライブラリ（公開ページ用）
- **npm**: [pixi.js package](https://www.npmjs.com/package/pixi.js)

### @pixi/react

- **最新安定版**: **8.0.0** (2026-01-06時点)
- **状態**: 安定版（React 19対応）
- **用途**: PixiJSのReact統合ライブラリ
- **重要な機能**:
  - React 19対応
  - PixiJS v8対応
  - カスタムJSXプラグマ（`pixi`プレフィックス）による宣言的な実装
  - `@react-three/fiber`に影響を受けた設計
- **注意事項**:
  - 旧バージョン（7.1.2）はReact 17/18、PixiJS v6/v7対応
  - プロジェクトはReact 19.2.3を使用しているため、v8.0.0を使用可能
- **npm**: [@pixi/react package](https://www.npmjs.com/package/@pixi/react)
- **公式サイト**: [PixiJS React Documentation](https://react.pixijs.io)

---

## URL State Management

### nuqs

- **現在のプロジェクトバージョン**: 2.8.8
- **最新安定版**: **2.8.8** (2026-01-27時点)
- **状態**: 安定版
- **主要機能**:
  - **`processUrlSearchParams`**: URLSearchParamsのインターセプトと変換
  - **debounce**: URL更新のデバウンス機能
  - **ゼロ依存**: 外部ランタイム依存なし（<5.5KB）
  - **Next.js 16 App Router**: 完全対応（>=14.2.0）
  - **Zod 4統合**: bidirectional transforms対応
- **フレームワーク対応**: Next.js, Remix, React Router, TanStack Router
- **採用企業**: Sentry, Supabase, Vercel, Clerk
- **npm**: [nuqs package](https://www.npmjs.com/package/nuqs)
- **公式サイト**: [nuqs.dev](https://nuqs.dev)

---

## 認証

### Better Auth

- **現在のプロジェクトバージョン**: 1.4.17
- **最新安定版**: **1.4.17** (2026-01-27時点)
- **状態**: 安定版
- **主要機能**:
  - Next.js 16 App Router対応
  - Prisma 7 Adapter対応
  - Cookie-based セッション管理
  - scrypt パスワードハッシュ
  - Google OAuth連携
  - nextCookies() プラグインによるServer Actions対応
  - **`better-auth/minimal`**: Kyselyを除外した軽量版（カスタムアダプター使用時）
  - **MCP setup_auth tool**: 認証セットアップ自動化
  - **Microsoft Entra ID SCIM互換**: エンタープライズ対応
- **Auth.js統合**: Auth.jsプロジェクトがBetter Authの一部に（セキュリティパッチは継続）
- **移行履歴**:
  - 2026-01-13: Auth.js v5から Better Auth 1.4.xに移行完了
- **公式サイト**: [Better Auth](https://www.better-auth.com)
- **リリースノート**: [Better Auth GitHub](https://github.com/better-auth/better-auth/releases)

---

## デプロイメント

### Google Cloud Run

- **状態**: マネージドサービス（常に最新版が使用される）
- **公式ドキュメント**: [Google Cloud Run Documentation](https://cloud.google.com/run/docs)

### Supabase

- **状態**: マネージドサービス（常に最新版が使用される）
- **公式ドキュメント**: [Supabase Documentation](https://supabase.com/docs)

---

## バージョンアップグレード推奨事項

### 現在のバージョン状態 ✅

すべての主要パッケージが最新安定版に更新済み:
- **React**: 19.2.3 ✅
- **Next.js**: 16.1.4 ✅
- **TypeScript**: 5.9.3 ✅
- **Prisma**: 7.3.0 ✅
- **Better Auth**: 1.4.17 ✅
- **Zod**: 4.3.5 ✅
- **Bun**: 1.3.6 ✅

### 最新版への更新推奨

1. **TypeScript**: 最新版 5.9.3 ✅
2. **Prisma**: 最新版 7.3.0 ✅
3. **Zod**: 最新版 4.3.6 ✅
4. **nuqs**: 最新版 2.8.8 ✅
5. **Tailwind CSS**: 最新版 4.1.18 ✅
6. **Three.js**: 最新版 0.182.0
8. **@react-three/fiber**: 最新版 9.5.0（React 19対応）
9. **@react-three/drei**: 最新版 10.7.7
10. **Pixi.js**: 最新版 8.15.0
11. **@pixi/react**: 最新版 8.0.5（React 19、PixiJS v8対応）
12. **Better Auth**: 最新版 1.4.17 ✅

---

## セキュリティに関する重要な注意事項

### CVE-2025-55182

- **影響範囲**: React 19.0-19.2.0、Next.js 15.x-16.0.6
- **深刻度**: 重大（未認証のリモートコード実行が可能）
- **修正版**: React 19.2.3、Next.js 16.1.4
- **対応**: ✅ 対策済み（React 19.2.3、Next.js 16.1.4適用）

### CVE-2025-66478

- **影響範囲**: Next.js 15.x-16.0.6
- **修正版**: Next.js 16.1.4+
- **対応**: ✅ 対策済み（Next.js 16.1.4適用）

### Node.js セキュリティリリース（2026-01-13）

- **リリース日**: 2026年1月13日
- **影響範囲**: Node.js 20.x, 22.x, 24.x, 25.x
- **修正版**: Node.js 20.20.0, 22.22.0, 24.13.0 (LTS), 25.3.0
- **深刻度**: 高（3件）、中（4件）、低（1件）
- **主な脆弱性**:
  - **CVE-2025-55131** (High): Timeout-based race conditions make Uint8Array/Buffer.alloc non-zerofilled
    - `vm`モジュールのタイムアウトオプション使用時に、バッファ割り当てが中断されると未初期化メモリが露出する可能性
    - 修正: 安全でないバッファ作成をリファクタリングし、ゼロフィルトグルを削除
  - **CVE-2025-55130** (High): Bypass File System Permissions using crafted symlinks
    - 権限モデルで`--allow-fs-read`と`--allow-fs-write`の制限を、細工された相対シンボリックリンクパスでバイパス可能
    - 修正: シンボリックリンクAPIに完全な読み取りと書き込み権限を要求
  - **CVE-2025-59465** (High): Node.js HTTP/2 server crashes with unhandled error when receiving malformed HEADERS frame
    - 不正なHTTP/2 HEADERSフレームでNode.jsがクラッシュする可能性
    - 修正: TLSSocketにデフォルトエラーハンドラーを追加
  - **CVE-2025-59466** (Medium): Uncatchable "Maximum call stack size exceeded" error on Node.js via async_hooks
    - `async_hooks.createHook()`が有効な場合、スタックオーバーフローエラーがキャッチ不可能になる
    - 修正: async_hooksでスタックオーバーフロー例外を再スロー
  - **CVE-2025-59464** (Medium): Memory leak that enables remote Denial of Service against applications processing TLS client certificates
    - TLSクライアント証明書処理時のメモリリーク
  - **CVE-2026-21636** (Medium): Node.js permission model bypass via unchecked Unix Domain Socket connections (UDS)
    - 権限モデルでUnix Domain Socket接続がネットワーク制限をバイパス可能
  - **CVE-2026-21637** (Medium): TLS PSK/ALPN Callback Exceptions Bypass Error Handlers, Causing DoS and FD Leak
    - TLSサーバーで`pskCallback`や`ALPNCallback`使用時に、コールバック例外がエラーハンドラーをバイパス
    - 修正: コールバック例外をエラーハンドラー経由でルーティング
  - **CVE-2025-55132** (Low): fs.futimes() Bypasses Read-Only Permission Model
    - 読み取り専用権限でも`futimes()`でファイルのタイムスタンプを変更可能
    - 修正: 権限モデルが有効な場合、futimesを無効化
- **依存関係の更新**:
  - c-ares: v1.34.6
  - undici: 7.18.2 (Node.js 24.13.0)
- **対応状況**: 
  - ⚠️ **注意**: BunはNode.jsとは別のランタイムのため、Node.jsのセキュリティパッチが直接適用されるわけではありません
  - ✅ `@types/node@24.10.8`に更新済み（Node.js 24.13.0 (LTS) の型定義に対応）
  - ✅ `package.json`で`"@types/node": "^24"`を指定（24.x系の最新が自動インストール）
  - ⚠️ **要確認**: Bun v1.3.6（2026-01-13リリース、Node.js 24.13.0と同じ日）のリリースノートには、Node.js 24.13.0のセキュリティパッチ（CVE-2025-55131, CVE-2025-55130, CVE-2025-59465等）への明示的な言及は見つかりませんでした
  - **推奨**: 
    - Bun v1.3.6へのアップグレードを検討（`bun upgrade`）
    - Bunの公式リリースノートとセキュリティアドバイザリを定期的に確認
    - プロジェクトで使用している機能（`vm`モジュール、HTTP/2、TLS、権限モデル等）が影響を受けるか確認
- **参考**: 
  - [Node.js Security Releases (2026-01-13)](https://nodejs.org/ja/blog/vulnerability/december-2025-security-releases)
  - [Node.js 24.13.0 (LTS) Release Notes](https://nodejs.org/ja/blog/release/v24.13.0)

---

## 更新履歴

- **2026-01-27 (更新)**: バージョン情報を最新化（Web検索による公式情報確認）
  - Next.js: 16.1.4 → 16.1.5 (セキュリティリリース CVE-2025-59471, CVE-2025-59472, CVE-2026-23864)
  - TypeScript 7.0 (Go native) プレビュー情報を追加
  - React 19.2新機能（Activity, useEffectEvent, cacheSignal）を追記
  - Prisma 7パフォーマンス改善情報を追記
  - Zod 4パフォーマンス情報とz.fromJSONSchema()を追記
  - Bun 1.3機能（Bun.SQL, HTML直接実行）を追記
  - Better Auth Auth.js統合情報を追記
  - nuqs採用企業・Zod 4統合情報を追記
- **2026-01-23 (更新)**: バージョン情報を最新化
  - Next.js: 16.1.2 → 16.1.4
  - Prisma: 7.2.0 → 7.3.0
  - Better Auth: 1.4.13 → 1.4.17
  - CVE-2025-55182, CVE-2025-66478を「対策済み」に更新
- **2026-01-19 (更新)**: バージョン情報を最新化
  - Next.js: 16.1.1 → 16.1.2
  - Better Auth: 1.4.11 → 1.4.13
- **2026-01-13 (更新)**: Bun 1.3.5から1.3.6にアップグレード完了
  - `bun upgrade`でBun 1.3.6にアップグレード
  - 型チェックとlintが正常に動作することを確認
  - Dockerfileは`oven/bun:1.3-alpine`を使用（1.3系の最新を指す）
- **2026-01-13 (更新)**: Node.js 24.13.0 (LTS) セキュリティリリースへの対応状況を確認・記録
  - `@types/node`を20.19.29から24.10.8に更新（Node.js 24.13.0 (LTS) の型定義に対応）
  - Bun v1.3.6（2026-01-13リリース）にアップグレード完了
  - ⚠️ **注意**: BunはNode.jsとは別のランタイムのため、Node.jsのセキュリティパッチが直接適用されるわけではありません。Bun v1.3.6のリリースノートには、Node.js 24.13.0のセキュリティパッチへの明示的な言及は見つかりませんでした
  - セキュリティ情報セクションにNode.js セキュリティリリース（2026-01-13）の詳細を追加
  - Node.js 24.13.0 (LTS) リリースノートへのリンクを追加
- **2026-01-13 (更新)**: Auth.js v5からBetter Auth 1.4.11に移行完了
  - next-auth, @auth/prisma-adapterを削除
  - better-auth@1.4.11を追加
  - 認証関連ドキュメントを更新
- **2026-01-10 (更新)**: package.jsonと照合してバージョン情報を更新
  - @react-three/fiber: 9.5.0（プロジェクト使用バージョン）
  - @react-three/drei: 10.7.7（プロジェクト使用バージョン）
  - @pixi/react: 8.0.5（プロジェクト使用バージョン）
  - nuqs: 2.8.8（プロジェクト使用バージョン）
  - Motion: 12.24.7（プロジェクト使用バージョン）
- **2026-01-06 (更新)**: React専用パッケージの情報を追加
- **2026-01-05 (更新)**: 最新バージョン情報を再調査・更新
- **2026-01-05**: 初版作成、全技術スタックの最新バージョン情報を調査・まとめ

---

## 参考資料

- [React Releases](https://github.com/facebook/react/releases)
- [Next.js Releases](https://github.com/vercel/next.js/releases)
- [TypeScript Blog](https://devblogs.microsoft.com/typescript/)
- [Bun Documentation](https://bun.sh)
- [Prisma Releases](https://github.com/prisma/prisma/releases)
- [npm Registry](https://www.npmjs.com/)
- [GitHub Releases](https://github.com/)
