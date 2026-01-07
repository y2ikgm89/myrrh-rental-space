# 技術スタック最新バージョン情報

> **Note**: このドキュメントは、プロジェクトで使用している技術スタックの最新バージョン情報をまとめたものです。最終更新: **2026-01-06**

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

- **現在のプロジェクトバージョン**: 1.3.5
- **最新安定版**: **1.3.5** (2026-01-05時点)
- **状態**: 安定版
- **アップグレード方法**: `bun upgrade`
- **公式サイト**: [bun.sh](https://bun.sh)

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

- **最新安定版**: **9.4.2** (2026-01-06時点)
- **状態**: 安定版
- **用途**: Three.jsのReactレンダラー（React Three Fiber）
- **重要な機能**:
  - React 19対応
  - 宣言的なReactコンポーネントとしてThree.jsシーンを構築可能
  - Server Componentsとの統合を考慮した実装が可能
- **npm**: [@react-three/fiber package](https://www.npmjs.com/package/@react-three/fiber)
- **公式サイト**: [React Three Fiber Documentation](https://r3f.docs.pmnd.rs)

### @react-three/drei

- **最新安定版**: **9.114.3** (2026-01-06時点、推定)
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

- **現在のプロジェクトバージョン**: 2.8.5
- **最新安定版**: **2.8.5** (2026-01-06時点)
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

### Auth.js (NextAuth.js v5)

- **現在のプロジェクトバージョン**: 5.0.0-beta.30
- **最新安定版**: 
  - `next-auth`: **4.24.13** (2026-01-05時点)
  - `@auth/core`: **0.34.3** (2026-01-05時点)
- **最新ベータ版**:
  - `next-auth`: **5.0.0-beta.30** (2026-01-05時点)
- **状態**: Auth.js v5はベータ版
- **重要な注意事項**:
  - NextAuth.js v4の最新安定版: 4.24.13 (2025-10-29リリース)
  - Auth.js v5はApp Routerファースト、OAuthサポートの改善、ユニバーサル`auth()`メソッドを導入
  - NextAuth.jsはBetter Authと統合予定
- **推奨**: 
  - 本番環境: Auth.js v5を使用する場合はリスク評価を行い、安定版リリースを継続監視
  - 既存運用: 認証基盤の変更は影響が大きいため、移行方針は別途合意の上で実施
- **リリースノート**: [Auth.js GitHub](https://github.com/nextauthjs/next-auth/releases)

### @auth/prisma-adapter

- **最新バージョン**: **2.11.1** (2026-01-05時点)
- **状態**: 安定版
- **重要な機能**:
  - Auth.jsのPasskeyプロバイダーとの互換性
- **Prisma 7との互換性**: 
  - Prisma 7.2.0で動作確認が必要
  - Prisma 7ではdriver adaptersが必須のため、互換性に注意が必要
- **GitHub**: [@auth/prisma-adapter](https://github.com/sidebase/authjs-prisma-adapter)

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

3. **Auth.js**: 
   - Auth.js v5の安定版リリースを監視
   - 認証基盤の変更は影響が大きいため、方針は別途合意の上で検討

### 最新版への更新推奨

1. **TypeScript**: 最新版 5.9.3
2. **Prisma**: 最新版 7.2.0
3. **Zod**: 最新版 4.3.5
4. **nuqs**: 最新版 2.8.5
5. **Tailwind CSS**: 最新版 4.1.18
6. **Framer Motion / Motion**: 最新版 12.23.28（`motion`パッケージへの移行も検討）
7. **Three.js**: 最新版 0.182.0
8. **@react-three/fiber**: 最新版 9.4.2（React 19対応）
9. **@react-three/drei**: 最新版 9.114.3（推定）
10. **Pixi.js**: 最新版 8.15.0
11. **@pixi/react**: 最新版 8.0.0（React 19、PixiJS v8対応）
12. **@auth/prisma-adapter**: 最新版 2.11.1

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

---

## 更新履歴

- **2026-01-06 (更新)**: React専用パッケージの情報を追加
  - @react-three/fiber: 9.4.2が最新安定版（React 19対応）
  - @react-three/drei: 9.114.3が最新安定版（推定）
  - @pixi/react: 8.0.0が最新安定版（React 19、PixiJS v8対応）
  - nuqs: 2.8.5が最新安定版
- **2026-01-05 (更新)**: 最新バージョン情報を再調査・更新
  - TypeScript: 5.9.3が最新
  - Prisma: 7.2.0が安定版としてリリース
  - Zod: 4.3.5が安定版としてリリース
  - Framer Motion: 12.23.28が最新、Motionへのリブランディング情報を追加
  - Three.js: 0.182.0が最新
  - Pixi.js: 8.15.0が最新
  - @auth/prisma-adapter: 2.11.1が最新
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
