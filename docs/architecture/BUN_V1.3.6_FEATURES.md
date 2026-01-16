# Bun v1.3.6 新機能ガイド

> **リリース日**: 2026年1月13日  
> **参考**: [Bun v1.3.6 Release Notes](https://bun.com/blog/bun-v1.3.6)

---

## 概要

Bun v1.3.6では、多くの新機能とパフォーマンス改善が導入されました。このドキュメントでは、プロジェクトで活用できる主要な機能を紹介します。

---

## 🆕 主要な新機能

### 1. Bun.Archive API - Tarballの作成・展開

**用途**: バックアップ、データエクスポート、ファイル配布

```typescript
// アーカイブの作成
const archive = new Bun.Archive({
  "data.json": JSON.stringify({ foo: "bar" }),
  "readme.txt": "Hello, World!",
  "binary.bin": new Uint8Array([1, 2, 3, 4]),
});

// gzip圧縮付きアーカイブ
const compressed = new Bun.Archive(files, { 
  compress: "gzip",
  level: 12 // 最大圧縮
});

// ファイルに書き込み
await Bun.write("backup.tar.gz", compressed);

// アーカイブの展開
const tarball = new Bun.Archive(await Bun.file("backup.tar.gz").bytes());
const fileCount = await tarball.extract("./output-dir");
```

**プロジェクトでの活用例**:
- 管理画面でのデータバックアップ機能
- ブログ記事やニュースのエクスポート機能
- 画像やファイルの一括ダウンロード

---

### 2. Bun.JSONC API - JSON with Commentsのパース

**用途**: 設定ファイルの読み込み（tsconfig.json、VS Code設定など）

```typescript
// JSONC形式の設定ファイルをパース
const config = Bun.JSONC.parse(`{
  // データベース設定
  "host": "localhost",
  "port": 5432,
  "options": {
    "ssl": true, // 末尾カンマも許可
  },
}`);

console.log(config.host); // "localhost"
```

**プロジェクトでの活用例**:
- `tsconfig.json`の動的読み込み
- カスタム設定ファイルのサポート
- コメント付きJSON設定の処理

**現在の使用箇所**:
- `src/lib/analytics/ga-data-api.ts`: `JSON.parse()`を使用 → `Bun.JSONC.parse()`に置き換え可能

---

### 3. metafile in Bun.build - バンドル分析

**用途**: バンドルサイズの追跡、依存関係の可視化、CI統合

```typescript
const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  metafile: true, // メタデータを生成
});

// バンドルサイズの分析
for (const [path, meta] of Object.entries(result.metafile.inputs)) {
  console.log(`${path}: ${meta.bytes} bytes`);
}

for (const [path, meta] of Object.entries(result.metafile.outputs)) {
  console.log(`${path}: ${meta.bytes} bytes`);
}

// esbuildのバンドルアナライザーで使用可能
await Bun.write("./dist/meta.json", JSON.stringify(result.metafile));
```

**CLI使用例**:
```bash
bun build ./src/index.ts --outdir ./dist --metafile ./dist/meta.json
```

**プロジェクトでの活用例**:
- ビルドサイズの監視
- CI/CDでのバンドルサイズチェック
- 依存関係の可視化

---

### 4. files in Bun.build - 仮想ファイルのバンドル

**用途**: コード生成、ビルド時定数の注入、モックモジュール

```typescript
// 仮想ファイルのバンドル
await Bun.build({
  entrypoints: ["./src/index.ts"],
  files: {
    // ビルド時定数を注入
    "./src/build-info.ts": `
      export const BUILD_ID = "${crypto.randomUUID()}";
      export const BUILD_TIME = ${Date.now()};
    `,
    // 本番環境設定で上書き
    "./src/config.ts": `
      export const API_URL = "https://api.production.com";
      export const DEBUG = false;
    `,
  },
  outdir: "./dist",
});
```

**プロジェクトでの活用例**:
- ビルドIDやビルド時刻の注入
- 環境別設定の動的生成
- テスト用のモックモジュール生成

---

## ⚡ パフォーマンス改善

### 1. Response.json() - 3.5倍高速化

**改善内容**: JavaScriptCoreのSIMD最適化FastStringifierを使用

```typescript
// 以前: Response.json()が3.5倍遅かった
// 現在: JSON.stringify() + new Response()と同等のパフォーマンス

const obj = { items: Array.from({ length: 100 }, (_, i) => ({ 
  id: i, 
  value: `item-${i}` 
})) };

// 両方とも同等のパフォーマンス
Response.json(obj);
new Response(JSON.stringify(obj));
```

**プロジェクトでの影響**:
- API RoutesでのJSONレスポンスが高速化
- Server ActionsでのJSON返却が高速化

---

### 2. async/await - 15%高速化

**改善内容**: JavaScriptCoreの最適化により、async/awaitの処理が15%高速化

**プロジェクトでの影響**:
- すべての非同期処理が高速化
- データベースクエリ、API呼び出しなど

---

### 3. Promise.race() - 30%高速化

**改善内容**: Promise.race()の処理が30%高速化

**プロジェクトでの活用例**:
- タイムアウト処理
- 複数APIの並列呼び出し
- レースコンディションの処理

---

### 4. Buffer.indexOf/includes - 最大2倍高速化

**改善内容**: SIMD最適化された検索関数を使用

```typescript
const buffer = Buffer.from("a".repeat(1_000_000) + "needle");

// 最大2倍高速化
buffer.indexOf("needle");
buffer.includes("needle");
```

**プロジェクトでの影響**:
- 大きなバッファの検索処理が高速化
- バイナリデータの処理が高速化

---

### 5. Bun.hash.crc32 - 20倍高速化

**改善内容**: ハードウェア加速CRC32命令を使用

```typescript
const data = Buffer.alloc(1024 * 1024); // 1MB
Bun.hash.crc32(data); // 20倍高速化（2,644 μs → 124 μs）
```

**プロジェクトでの活用例**:
- ファイルの整合性チェック
- データの検証
- キャッシュキーの生成

---

### 6. JSON serialization - 3倍高速化

**改善内容**: 複数の内部APIでJSONシリアライゼーションが3倍高速化

**影響を受けるAPI**:
- `console.log` with `%j` format
- PostgreSQL JSON/JSONB types
- MySQL JSON type
- Jest `%j/%o` format specifiers

**プロジェクトでの影響**:
- データベースのJSON/JSONB操作が高速化
- デバッグ出力が高速化
- テスト出力が高速化

---

## 🔧 機能改善

### 1. sql() INSERT helper - undefined値の扱い改善

**改善内容**: undefined値がNULLに変換されず、データベースのDEFAULT値が使用される

```typescript
// 以前: undefinedがNULLに変換され、DEFAULT値が使われなかった
// 現在: undefined値はカラムから除外され、DEFAULT値が使用される

const [record] = await sql`
  INSERT INTO "MyTable" ${sql({
    foo: undefined, // カラムから除外され、DEFAULT値が使用される
    id: Bun.randomUUIDv7(),
  })}
`;
```

**プロジェクトでの影響**:
- Prismaの代わりにBun SQLを使用する場合の改善
- デフォルト値の扱いが改善

---

### 2. Fake Timers with @testing-library/react

**改善内容**: `jest.useFakeTimers()`が`@testing-library/react`と正しく動作

```typescript
import { jest } from "bun:test";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

it("works with fake timers", async () => {
  jest.useFakeTimers();
  const { getByRole } = render(<button>Click me</button>);
  const user = userEvent.setup();
  
  // 以前: ハングアップしていた
  // 現在: 正常に動作
  await user.click(getByRole("button"));
  jest.useRealTimers();
});
```

**プロジェクトでの影響**:
- Reactコンポーネントのテストが改善
- タイマーを使用するコンポーネントのテストが容易に

---

### 3. --grep flag for bun test

**改善内容**: Jest/Mochaと同様の`--grep`フラグをサポート

```bash
# すべて同等
bun test --grep "should handle"
bun test --test-name-pattern "should handle"
bun test -t "should handle"
```

**プロジェクトでの影響**:
- テストの実行が柔軟に
- 特定のテストのみを実行可能

---

### 4. S3 Requester Pays Support

**改善内容**: S3のRequester Paysバケットをサポート

```typescript
import { s3 } from "bun";

// Requester Paysバケットから読み込み
const file = s3.file("data.csv", {
  bucket: "requester-pays-bucket",
  requestPayer: true,
});

const content = await file.text();
```

**プロジェクトでの活用例**:
- 大容量データのS3アクセス
- コスト効率的なデータ転送

---

### 5. HTTP/HTTPS Proxy Support for WebSocket

**改善内容**: WebSocketがHTTP/HTTPSプロキシ経由で接続可能

```typescript
// プロキシ経由でWebSocket接続
new WebSocket("wss://example.com", {
  proxy: "http://proxy:8080",
});

// 認証付きプロキシ
new WebSocket("wss://example.com", {
  proxy: "http://user:pass@proxy:8080",
});
```

**プロジェクトでの活用例**:
- 企業環境でのWebSocket接続
- プロキシ経由でのリアルタイム通信

---

## 🐛 重要なバグ修正

### セキュリティ改善

1. **Null byte injection対策**: `Bun.spawn`、環境変数、シェルテンプレートリテラルでnullバイトを拒否
2. **Wildcard certificate matching**: RFC 6125 Section 6.4.3に準拠した厳格なマッチング
3. **WebSocket decompression bomb対策**: 128MB制限を追加

### メモリリーク修正

1. **node:zlib**: Brotli、Zstd、Zlib圧縮ストリームのメモリリーク修正
2. **Bun.write()**: 2GB以上のファイルでのデータ破損修正
3. **Bun.serve()**: ストリーミングレスポンスのプロキシ時のメモリリーク修正

### パフォーマンス修正

1. **Bun.spawnSync()**: Linux ARM64で最大30倍高速化
2. **IPC**: 大容量メッセージで9倍高速化
3. **Embedded .node files**: Linuxで高速化

---

## 📝 プロジェクトでの活用推奨

### 即座に活用可能

1. **Response.json()の使用**: API RoutesやServer Actionsで`Response.json()`を使用（3.5倍高速化）
2. **Bun.JSONC.parse()**: 設定ファイルの読み込みで使用
3. **--grep flag**: テスト実行時のフィルタリング

### 検討すべき機能

1. **Bun.Archive API**: バックアップ機能やエクスポート機能の実装
2. **metafile in Bun.build**: バンドルサイズの監視とCI統合
3. **files in Bun.build**: ビルド時定数の注入や環境別設定の生成

### パフォーマンス改善の恩恵

- すべての非同期処理が15%高速化
- JSON処理が全体的に高速化
- バッファ操作が高速化

---

## 🔗 参考リンク

- [Bun v1.3.6 Release Notes](https://bun.com/blog/bun-v1.3.6)
- [Bun.Archive API Documentation](https://bun.sh/docs/api/archive)
- [Bun.JSONC API Documentation](https://bun.sh/docs/api/jsonc)
- [Bun.build API Documentation](https://bun.sh/docs/bundler)

---

## 更新履歴

- **2026-01-13**: Bun v1.3.6の新機能をまとめたドキュメントを作成
