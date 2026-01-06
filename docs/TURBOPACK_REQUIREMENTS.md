# Turbopack要件定義

> **Note**: このドキュメントにはNext.js 16でのTurbopack採用に関する要件定義が記載されています。技術スタックの詳細については、[`AGENTS.md`](../AGENTS.md)を参照してください。技術検証結果については、[`ARCHITECTURE.md`](./ARCHITECTURE.md)の「技術検証結果」セクションを参照してください。

---

## 概要

### Turbopackとは

Turbopackは、Rustで書かれた次世代のJavaScript/TypeScriptバンドラーです。Next.js 16では、開発環境と本番環境の両方でデフォルトのバンドラーとして採用されています。Webpackの後継として設計され、大幅なパフォーマンス向上を実現しています。

#### Turbopackの技術的利点

- **Unified Graph**: Next.jsは複数の出力環境（クライアント、サーバーなど）をサポートしています。Turbopackはすべての環境に対して**単一の統一グラフ**を使用し、複数のコンパイラを管理する必要がありません。
- **Bundling vs Native ESM**: 一部のツールは開発時にバンドリングをスキップしてブラウザのネイティブESMに依存しますが、大規模アプリでは過剰なネットワークリクエストにより遅くなります。Turbopackは開発時にも**バンドリング**を行いますが、最適化された方法で大規模アプリを高速に保ちます。
- **Incremental Computation**: Turbopackは複数コア間で作業を並列化し、関数レベルまで結果を**キャッシュ**します。一度完了した作業は繰り返しません。
- **Lazy Bundling**: Turbopackは開発サーバーが実際に要求したもののみをバンドルします。この遅延アプローチにより、初期コンパイル時間とメモリ使用量を削減できます。

### Next.js 16での位置づけ

- **デフォルトバンドラー**: Next.js 16では、Turbopackが開発・本番の両方でデフォルトのバンドラーとして使用されます
- **本番環境対応**: Next.js 16のリリース時点で、Turbopackは本番環境でも安定して動作することが確認されています
- **プロジェクト方針**: 本プロジェクトではWebpackは使用しません。すべての設定はTurbopackで対応します

### プロジェクトでの採用理由

1. **パフォーマンス向上**
   - 開発環境: Fast Refreshが最大10倍高速化
   - 本番環境: ビルド時間が2-5倍短縮

2. **Next.js 16の標準機能**
   - プロジェクトはNext.js 16.1.1を使用しているため、Turbopackがデフォルトで有効
   - 追加の設定やインストールが不要

3. **将来性**
   - Webpackの後継として設計されており、長期的なサポートが期待される
   - Next.jsの今後の機能開発はTurbopackを前提に進められる

---

## 技術要件

### バージョン要件

- **Next.js**: 16.1.1以上（✅ 既に満たしている）
- **Turbopack**: Next.js 16に統合されており、個別のインストールは不要
- **Node.js/Bun**: Bun 1.3.5で動作確認済み（✅ 既に満たしている）

### Turbopack設定

本プロジェクトではWebpackは使用しません。`next.config.js`の`turbopack`オプションで必要な設定を行います：

1. **モジュールエイリアス（`resolveAlias`）**
   - パスエイリアスやパッケージの置き換えが可能
   ```typescript
   // next.config.ts
   const nextConfig: NextConfig = {
     turbopack: {
       resolveAlias: {
         '@': './src',
         'underscore': 'lodash',
         // 条件付きエイリアス（ブラウザ環境用）
         'mocha': { browser: 'mocha/browser-entry.js' }
       }
     }
   }
   ```

2. **ファイル拡張子の解決（`resolveExtensions`）**
   - カスタムファイル拡張子のサポート
   ```typescript
   const nextConfig: NextConfig = {
     turbopack: {
       resolveExtensions: ['.mdx', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.json']
     }
   }
   ```

3. **カスタムローダー（`rules`）**
   - カスタムローダーの設定が可能
   ```typescript
   const nextConfig: NextConfig = {
     turbopack: {
       rules: {
         '*.svg': {
           loaders: [
             {
               loader: '@svgr/webpack',
               options: {
                 icon: true,
               },
             },
           ],
           as: '*.js',
         },
       },
     }
   }
   ```

4. **Sassの`~`構文の対応**
   - レガシーなSassインポート構文の対応
   ```typescript
   const nextConfig: NextConfig = {
     turbopack: {
       resolveAlias: {
         '~*': '*' // ~bootstrap → bootstrap に変換
       }
     }
   }
   ```

**注意**: ローダーのオプションはプレーンなJavaScriptプリミティブ、オブジェクト、配列のみ（`require()`は不可）です。

#### 技術スタックとの互換性

- **TypeScript**: 完全対応（✅ 問題なし）
- **Tailwind CSS**: 完全対応（✅ 問題なし）
- **Prisma**: ビルドプロセスとは独立（✅ 問題なし）
- **Auth.js**: ビルドプロセスとは独立（✅ 問題なし）

#### ファイルシステムキャッシュ

- **開発環境**: `turbopackFileSystemCacheForDev`はNext.js 16でデフォルトで有効
  - 開発サーバーの再起動間でコンパイラアーティファクトをディスクに保存
  - 後続の`next dev`実行を大幅に高速化
- **本番ビルド**: `turbopackFileSystemCacheForBuild`はオプトイン機能（ベータ版）
  - `next.config.js`で明示的に有効化する必要がある
  - 後続の`next build`実行を高速化
- **設定例**:
  ```typescript
  // next.config.ts
  import type { NextConfig } from 'next'
  
  const nextConfig: NextConfig = {
    experimental: {
      // 開発環境のファイルシステムキャッシュ（デフォルトで有効）
      turbopackFileSystemCacheForDev: true,
      // 本番ビルドのファイルシステムキャッシュ（オプトイン）
      turbopackFileSystemCacheForBuild: true,
    },
  }
  
  export default nextConfig
  ```

---

## パフォーマンス要件

### 開発環境

#### Fast Refreshの高速化

- **目標**: Fast Refreshの応答時間を最大10倍短縮
- **測定指標**:
  - コード変更から画面反映までの時間
  - 大規模コンポーネントでの更新速度
- **期待値**: 100ms以下での反映（従来の1秒以上から改善）

#### 開発サーバー起動時間

- **目標**: 開発サーバーの起動時間を短縮
- **測定指標**: `bun run dev`実行からサーバー起動完了までの時間
- **期待値**: 従来の50%以下の起動時間

#### ホットリロードの応答性

- **目標**: ファイル変更時の再コンパイル時間を短縮
- **測定指標**: ファイル保存から再コンパイル完了までの時間
- **期待値**: 大規模プロジェクトでも1秒以内

#### ファイルシステムキャッシュの活用

- **目標**: 開発サーバーの再起動時間を短縮
- **測定指標**: `.next`ディレクトリのキャッシュを活用した再起動時間
- **期待値**: 初回起動の50%以下の時間
- **注意**: パフォーマンス比較を行う際は、`.next`フォルダを削除してコールドビルドを測定するか、ファイルシステムキャッシュを有効にしてウォームビルドを測定する

### 本番環境

#### ビルド時間の短縮

- **目標**: 本番ビルド時間を2-5倍短縮
- **測定指標**: `bun run build`実行からビルド完了までの時間
- **期待値**: 従来のビルド時間の20-50%

#### バンドルサイズの最適化

- **目標**: バンドルサイズを維持または削減
- **測定指標**:
  - 各ルートのJavaScriptバンドルサイズ
  - 総バンドルサイズ
- **期待値**: バンドルサイズを最適化

#### デプロイ時間の短縮

- **目標**: CI/CDパイプラインでのビルド時間短縮
- **測定指標**: GitHub Actions/Cloud Buildでのビルド時間
- **期待値**: 従来のビルド時間の50%以下

#### ファイルシステムキャッシュの活用（本番ビルド）

- **目標**: 本番ビルドの再実行時間を短縮
- **測定指標**: キャッシュを活用した`bun run build`の実行時間
- **設定**: `experimental.turbopackFileSystemCacheForBuild: true`を`next.config.js`に追加
- **注意**: CI/CD環境では、キャッシュを適切に管理する必要がある（例: GitHub Actionsのキャッシュ機能と組み合わせる）

---

## 移行要件

### 段階的移行戦略

#### フェーズ1: 開発環境での検証

1. **現状確認**
   - 既存のビルドエラーの有無確認
   - 必要なTurbopack設定の確認

2. **Turbopack設定の確認**
   - `next.config.js`に`turbopack`オプションが必要な場合は設定を追加
   - エイリアス、ローダー、拡張子の設定を確認

3. **開発環境でのTurbopack有効化**
   - Next.js 16ではデフォルトで有効
   - `bun run dev`でTurbopackが使用されることを確認
   - Webpackは使用しない（Turbopack設定で対応）

4. **動作確認**
   - すべてのページが正常に表示されることを確認
   - Fast Refreshが正常に動作することを確認
   - 開発時のエラーがないことを確認
   - 移行した設定が正常に動作することを確認

#### フェーズ2: 本番ビルドの検証

1. **本番ビルドの実行**
   - `bun run build`でTurbopackを使用したビルドを実行
   - ビルドエラーがないことを確認

2. **ビルド成果物の検証**
   - 生成されたバンドルサイズを確認
   - すべてのルートが正常にビルドされることを確認

3. **パフォーマンス測定**
   - ビルド時間を記録
   - バンドルサイズを記録
   - ベースラインとの比較

### 検証要件

#### 開発環境での動作確認

- [ ] すべてのページが正常に表示される
- [ ] Fast Refreshが正常に動作する
- [ ] ホットリロードが正常に動作する
- [ ] 開発時のエラーがない
- [ ] TypeScriptの型チェックが正常に動作する
- [ ] Tailwind CSSが正常に適用される

#### 本番ビルドの検証

- [ ] ビルドエラーがない
- [ ] すべてのルートが正常にビルドされる
- [ ] 静的ファイルが正常に生成される
- [ ] 画像最適化が正常に動作する
- [ ] メタデータが正常に生成される

#### CI/CDパイプラインでの検証

- [ ] GitHub Actions/Cloud Buildでのビルドが正常に完了する
- [ ] ビルド時間が短縮されている
- [ ] デプロイプロセスが正常に動作する
- [ ] 本番環境での動作確認

---

## 制約事項

### 既知の制約

#### Turbopack設定の制約

- **制約**: カスタムローダーのオプションはプレーンなJavaScriptプリミティブ、オブジェクト、配列のみ（`require()`は不可）
- **対応**: 
  - `turbopack.resolveAlias`でエイリアス設定
  - `turbopack.rules`でローダー設定
  - `turbopack.resolveExtensions`で拡張子設定
  - 詳細は「Turbopack設定」セクションを参照

#### Edge Runtimeとの関係

- **制約**: TurbopackはEdge Runtimeとは直接関係ないが、プロジェクトではPrismaの制約によりEdge Runtimeを使用していない
- **対応**: 既存の`runtime = "nodejs"`設定を維持（Turbopackとは独立）

### 技術的制約

#### デバッグツール

- **制約**: Turbopack固有のデバッグ方法が必要な場合がある
- **対応**: Turbopackのデバッグ方法を学習・適用

#### ビルドキャッシュ

- **制約**: Turbopack固有のキャッシュメカニズム
- **対応**: `.next/cache`ディレクトリの管理方法を理解

---

## 運用要件

### 開発ワークフロー

#### `bun run dev`でのTurbopack使用

- **デフォルト動作**: Next.js 16では、`bun run dev`を実行すると自動的にTurbopackが使用される
- **明示的な指定**: 特に指定は不要（デフォルトで有効）
- **方針**: 本プロジェクトではWebpackは使用しません

#### デバッグ方法

1. **ビルドエラーの確認**
   - ターミナルに表示されるエラーメッセージを確認
   - エラーログの詳細を確認

2. **パフォーマンスの確認**
   - 開発サーバーの起動時間を測定
   - Fast Refreshの応答時間を測定

3. **キャッシュのクリア**
   - `.next`ディレクトリを削除してクリーンビルド
   - ファイルシステムキャッシュをクリアする場合は`.next/cache`ディレクトリも削除
   - `bun run dev --turbo`で明示的にTurbopackを指定（オプション）

#### ファイルシステムキャッシュの管理

- **開発環境**: デフォルトで有効（`turbopackFileSystemCacheForDev: true`）
  - キャッシュは`.next/cache`ディレクトリに保存される
  - 開発サーバー再起動時に自動的に活用される
- **本番ビルド**: オプトイン機能（`turbopackFileSystemCacheForBuild: true`を設定）
  - CI/CD環境では、キャッシュを適切に管理する必要がある
  - GitHub Actionsの場合は、`.next/cache`をキャッシュアクションで保存・復元

#### パフォーマンスモニタリング

- **開発環境**: 開発サーバーの起動時間、Fast Refreshの応答時間を定期的に測定
- **本番環境**: ビルド時間、バンドルサイズを定期的に記録
- **比較**: ベースラインとのパフォーマンス比較を実施

### CI/CD統合

#### ビルドスクリプトの更新

- **現状**: `package.json`の`build`スクリプトは`next build`を実行
- **変更不要**: Next.js 16ではデフォルトでTurbopackが使用されるため、スクリプトの変更は不要
- **方針**: 本プロジェクトではWebpackは使用しません

#### テスト環境での検証

**注意**: テスト要件の詳細については、[`TEST_REQUIREMENTS.md`](./TEST_REQUIREMENTS.md)を参照してください。

- **ローカルテスト**: 開発環境でTurbopackを使用したビルドをテスト
- **CI/CDテスト**: GitHub Actions/Cloud BuildでTurbopackを使用したビルドをテスト
- **ステージング環境**: ステージング環境でTurbopackを使用したビルドをデプロイして検証

#### デプロイプロセスの確認

- **ビルド時間**: CI/CDパイプラインでのビルド時間を記録
- **デプロイ時間**: デプロイ全体の時間を記録
- **ロールバック計画**: 問題発生時のロールバック手順を準備

---

## リスク管理

### リスク評価

#### 移行リスク

- **リスクレベル**: 低
- **理由**: Next.js 16ではTurbopackがデフォルトで有効化されており、追加の設定が不要
- **影響**: 既存のコードベースに大きな変更は不要

#### 設定リスク

- **リスクレベル**: 低
- **理由**: カスタムローダーや特定の設定が必要な場合、Turbopack設定での対応が必要
- **影響**: 必要な設定を`turbopack`オプションで適切に設定する必要がある

#### パフォーマンスリスク

- **リスクレベル**: 低
- **理由**: Turbopackは一般的にWebpackより高速だが、プロジェクト固有の要因で期待通りの性能が出ない可能性
- **影響**: パフォーマンス改善が期待値に達しない可能性（ただし、悪化する可能性は低い）

### 対策

#### 対応計画

1. **Turbopack設定での解決**
   - `next.config.js`の`turbopack`オプションで必要な設定を追加
   - エイリアス、ローダー、拡張子設定を適切に設定
   - **方針**: 本プロジェクトではWebpackは使用しません。すべての設定はTurbopackで対応します

2. **段階的ロールアウト**
   - まず開発環境でTurbopackを検証
   - 問題がなければ本番ビルドで検証
   - 最終的に本番環境にデプロイ

#### 監視とロールバック手順

1. **監視項目**
   - ビルドエラーの有無
   - ビルド時間の変化
   - バンドルサイズの変化
   - 本番環境でのエラー発生率

2. **問題対応手順**
   - 問題が発生した場合、Turbopack設定を確認・修正
   - 問題の原因を調査
   - Turbopack設定での解決を優先
   - **方針**: 本プロジェクトではWebpackは使用しません

---

## 成功基準

### パフォーマンス指標

#### 開発サーバー起動時間

- **目標**: 従来の50%以下の起動時間
- **測定方法**: `bun run dev`実行からサーバー起動完了までの時間を測定
- **基準値**: 5秒以内（プロジェクト規模による）

#### Fast Refresh応答時間

- **目標**: 100ms以下での反映
- **測定方法**: コード変更から画面反映までの時間を測定
- **基準値**: 100ms以下

#### 本番ビルド時間

- **目標**: 従来のビルド時間の50%以下
- **測定方法**: `bun run build`実行からビルド完了までの時間を測定
- **基準値**: プロジェクト規模による（例: 5分以内）

#### バンドルサイズ

- **目標**: バンドルサイズを最適化
- **測定方法**: `.next`ディレクトリ内のバンドルサイズを測定
- **基準値**: ベースラインとの比較で±5%以内

### 品質指標

#### ビルドエラーなし

- **基準**: Turbopackを使用したビルドでエラーが発生しない
- **確認方法**: `bun run build`が正常に完了することを確認

#### テスト通過率維持

- **基準**: 既存のテストスイートがすべて通過する
- **確認方法**: `bun run test`を実行してすべてのテストが通過することを確認
- **詳細**: テスト要件については[`TEST_REQUIREMENTS.md`](./TEST_REQUIREMENTS.md)を参照

#### 機能動作確認

- **基準**: すべての機能が正常に動作する
- **確認方法**: 
  - すべてのページが正常に表示される
  - フォーム送信が正常に動作する
  - 認証フローが正常に動作する
  - 管理画面のCRUD操作が正常に動作する

---

## 次のステップ

1. ✅ Turbopack要件定義完了
2. ⏭️ 開発環境での動作確認
3. ⏭️ 本番ビルドの検証
4. ⏭️ CI/CDパイプラインでの検証
5. ⏭️ パフォーマンス測定と比較
6. ⏭️ 本番環境へのデプロイ

---

## 参考資料

- [Next.js 16 Documentation - Turbopack](https://nextjs.org/docs/app/api-reference/next-config-js/turbopack)
- [Next.js 16 Documentation - Turbopack Configuration](https://nextjs.org/docs/app/api-reference/next-config-js/turbopack)
- [Next.js 16 Blog - Turbopack](https://nextjs.org/docs/blog/next-16)
- [Turbopack Documentation](https://turbo.build/pack/docs)
- [Next.js 16 Upgrading Guide - Turbopack by default](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Next.js Config - Turbopack FileSystem Cache](https://nextjs.org/docs/app/api-reference/next-config-js/turbopackFileSystemCache)
- [Next.js Config - Turbopack Resolve Aliases](https://nextjs.org/docs/app/api-reference/next-config-js/turbopack#resolvealias)
- [Next.js Config - Turbopack Rules](https://nextjs.org/docs/app/api-reference/next-config-js/turbopack#rules)
