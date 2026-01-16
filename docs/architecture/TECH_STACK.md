# 技術スタック最新バージョン情報

> **Note**: このドキュメントは、プロジェクトで使用している技術スタックの最新バージョン情報をまとめたものです。最終更新: **2026-01-13**

---

## 調査方法

- Web検索による公式リリース情報の確認
- npm公式レジストリの確認
- GitHub公式リポジトリのリリース情報の確認

---

## コア技術

### React

- **現在のプロジェクトバージョン**: 19.2.3 (CVE-2025-55182修正版)
- **最新安定版**: **19.2.3** (2026-01-05時点)
- **状態**: 安定版
- **重要なセキュリティ情報**: 
  - React 19.0-19.2.0には重大なセキュリティ脆弱性（CVE-2025-55182）が存在
  - React 19.2.1以降で修正済み
  - **推奨**: 19.2.3へのアップグレードを推奨
- **リリースノート**: [React 19.2.3 Release](https://github.com/facebook/react/releases)

### Next.js

- **現在のプロジェクトバージョン**: 16.1.1 (CVE-2025-55182修正版)
- **最新安定版**: **16.1.1** (2026-01-05時点)
- **状態**: 安定版
- **重要なセキュリティ情報**:
  - Next.js 15.x-16.0.6には重大なセキュリティ脆弱性（CVE-2025-55182, CVE-2025-66478）が存在
  - Next.js 16.0.7以降で修正済み（最新安定版: 16.1.1）
  - React 19.2サポート、Turbopackがデフォルトで有効
- **リリースノート**: [Next.js 16.1.1 Release](https://github.com/vercel/next.js/releases)

### TypeScript

- **現在のプロジェクトバージョン**: 5.9.3
- **最新安定版**: **5.9.3** (2026-01-05時点)
- **状態**: 安定版
- **重要な機能**:
  - 最小限で更新された`tsc --init`
  - `import defer`のサポート
  - `--module node20`のサポート
  - DOM APIのサマリ説明
  - 拡張可能なホバー（プレビュー）
- **将来のリリース**:
  - TypeScript 6.0: 開発中（既存JavaScriptコードベースの最終版）
  - TypeScript 7.0 (Project Corsa): 開発中（Go言語によるネイティブ実装、リリース予定日は未確定。2026-01-05時点）
- **リリースノート**: [TypeScript Blog](https://devblogs.microsoft.com/typescript/)

### Bun

- **現在のプロジェクトバージョン**: 1.3.6 ✅
- **最新安定版**: **1.3.6** (2026-01-13リリース)
- **状態**: 安定版
- **アップグレード方法**: `bun upgrade`
- **公式サイト**: [bun.sh](https://bun.sh)
- **Node.js互換性**: BunはNode.js互換ランタイムだが、独自の実装のため、Node.jsのセキュリティパッチが直接適用されるわけではない
- **セキュリティ対応**: Bun v1.3.6（2026-01-13リリース）にアップグレード済み。Node.js 24.13.0のセキュリティパッチへの対応状況は、Bunの公式リリースノートで確認が必要
- **リリースノート**: [Bun v1.3.6 Release Notes](https://bun.com/blog/bun-v1.3.6)
- **新機能ガイド**: [Bun v1.3.6 新機能ガイド](./BUN_V1.3.6_FEATURES.md)

---

## データベース & ORM

### Prisma

- **現在のプロジェクトバージョン**: 7.2.0
- **最新安定版**: **7.2.0** (2026-01-05時点)
- **状態**: 安定版
- **重要な機能**:
  - `--url`フラグの再導入
  - ランタイム固有の設定（`prisma init`）
  - 未定義URLのエラーメッセージ改善
- **重要な注意事項**:
  - Prisma 7では、データベース接続にdriver adaptersが必須
  - `@auth/prisma-adapter`との互換性に注意が必要
- **リリースノート**: [Prisma 7.2.0 Release](https://www.prisma.io/blog/announcing-prisma-orm-7-2-0)

### Zod

- **現在のプロジェクトバージョン**: 4.3.5
- **最新安定版**: **4.3.5** (2026-01-05時点)
- **状態**: 安定版
- **重要な機能**:
  - JSON Schema統合（`fromJSONSchema`、`toJSONSchema`メソッド）
  - 新しいコンビネータ（`xor`、`looseRecord`）
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

### Framer Motion / Motion

- **最新安定版**: **12.23.28** (2026-01-05時点)
- **状態**: 安定版
- **重要な変更**:
  - 2024-11-01にFramer Motionが独立プロジェクトとなり、Motionにリブランディング
  - パッケージ名は`motion`に変更（`framer-motion`から移行）
- **用途**: Reactアニメーションライブラリ
- **インストール**: `npm install motion`
- **公式サイト**: [Motion.dev](https://motion.dev)

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

- **現在のプロジェクトバージョン**: 2.8.6
- **最新安定版**: **2.8.6** (2026-01-10時点)
- **状態**: 安定版
- **重要な機能**:
  - `processUrlSearchParams`フックによるURL検索パラメータのインターセプトと変換
  - `shallow:true`とdebounce使用時の警告メッセージ
  - Next.js 16 App Router完全対応
- **用途**: 型安全なクエリパラメータ管理（フィルタ、ソート、検索、ページネーション）
- **npm**: [nuqs package](https://www.npmjs.com/package/nuqs)
- **公式サイト**: [nuqs.dev](https://nuqs.dev)

---

## 認証

### Better Auth

- **現在のプロジェクトバージョン**: 1.4.11
- **最新安定版**: **1.4.11** (2026-01-13時点)
- **状態**: 安定版
- **重要な機能**:
  - Next.js 16 App Router対応
  - Prisma 7 Adapter対応
  - Cookie-based セッション管理
  - scrypt パスワードハッシュ
  - Google OAuth連携
  - nextCookies() プラグインによるServer Actions対応
- **移行履歴**:
  - 2026-01-13: Auth.js v5 (next-auth@5.0.0-beta.30) から Better Auth 1.4.11 に移行完了
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

### 即座にアップグレード推奨

1. **React**: 19.2.3
2. **Next.js**: 16.1.1

### 検討が必要

1. **Prisma**: 
   - Prisma 7.2.0が安定版としてリリースされたため、アップグレードを検討
   - `@auth/prisma-adapter@2.11.1`との互換性を確認

2. **Zod**: 
   - Zod 4.3.5が安定版としてリリースされたため、アップグレードを推奨
   - JSON Schema統合などの新機能が利用可能

3. **Better Auth**:
   - Better Auth 1.x安定版を使用中
   - Auth.js v5から2026-01-13に移行完了

### 最新版への更新推奨

1. **TypeScript**: 最新版 5.9.3
2. **Prisma**: 最新版 7.2.0
3. **Zod**: 最新版 4.3.5
4. **nuqs**: 最新版 2.8.6
5. **Tailwind CSS**: 最新版 4.x
6. **Motion**: 最新版 12.24.7（`motion`パッケージ、`framer-motion`から移行済み）
7. **Three.js**: 最新版 0.182.0
8. **@react-three/fiber**: 最新版 9.5.0（React 19対応）
9. **@react-three/drei**: 最新版 10.7.7
10. **Pixi.js**: 最新版 8.15.0
11. **@pixi/react**: 最新版 8.0.5（React 19、PixiJS v8対応）
12. **Better Auth**: 最新版 1.4.11

---

## セキュリティに関する重要な注意事項

### CVE-2025-55182

- **影響範囲**: React 19.0-19.2.0、Next.js 15.x-16.0.6
- **深刻度**: 重大（未認証のリモートコード実行が可能）
- **修正版**: React 19.2.3、Next.js 16.1.1
- **対応**: 即座にアップグレードを推奨

### CVE-2025-66478

- **影響範囲**: Next.js 15.x-16.0.6
- **修正版**: Next.js 16.1.1+
- **対応**: 即座にアップグレードを推奨

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
  - nuqs: 2.8.6（プロジェクト使用バージョン）
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
