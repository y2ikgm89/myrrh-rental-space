# 技術スタックバージョン情報

> プロジェクトで使用している技術のバージョンとプロジェクト固有の判断。
> 最終更新: **2026-02-18**

---

## コア

| 技術 | バージョン | 備考 |
|------|-----------|------|
| React | 19.2.4 | React Compiler 1.0 デフォルト有効 |
| Next.js | 16.1.6 | `'use cache'`, `updateTag`, PPR |
| TypeScript | 6.0-beta | `css.d.ts` で TS2882 対応済み |
| Bun | 1.3.x | ランタイム + パッケージマネージャ |

### TypeScript 6.0-beta

- TS 6.0 は 5.9 と 7.0（Go native）のブリッジリリース
- **TS2882**: side-effect CSS import (`import './file.css'`) に型宣言が必要。`src/shared/types/css.d.ts` で対応
- TS 7.0（Go native）はプレビュー段階。安定版リリース後に移行を検討

---

## データベース & ORM

| 技術 | バージョン | 備考 |
|------|-----------|------|
| Prisma | 7.4.0 | 型生成98%削減, mapped enums, WASM engine |
| PostgreSQL | 16 | Supabase (本番) / Docker Compose (開発) |
| Zod | 4.3.6 | `{ error: }` パラメータ, `z.fromJSONSchema()` |

---

## UI & スタイリング

| 技術 | バージョン | 備考 |
|------|-----------|------|
| Tailwind CSS | 4.1.18 | CSS-first設定, `@theme` |
| GSAP | 3.14.2 | ScrollTrigger, @gsap/react 2.1 |
| Three.js | 0.182.0 | @react-three/fiber 9.5, @react-three/drei 10.7 |
| PixiJS | 8.16.0 | 2D WebGL |
| Lenis | 1.3.17 | スムーススクロール |

---

## その他

| 技術 | バージョン | 備考 |
|------|-----------|------|
| Better Auth | 1.4.18 | RBAC, Prisma adapter |
| nuqs | 2.8.8 | URL状態管理, Zod 4統合 |
| Lexical | 0.40.0 | リッチテキストエディタ, NodeState API |

---

## プロジェクト固有の判断

### ESLint 10 見送り

**ESLint 9.39.2** を使用。ESLint 10 は `eslint-plugin-react` と `eslint-plugin-import` が未対応のためブロック中。`@eslint/compat` ワークアラウンドは不要な複雑性のため採用しない。

### Prisma WASM エンジン

`engineType = "client"` + `runtime = "bun"` で WASM ベース。OpenSSL パッケージ不要（`libc6-compat` のみ）。Docker イメージの軽量化に寄与。

### STANDALONE 条件付き有効化

Windows + Turbopack で `node:` プロトコルのコロンが `EINVAL` エラーになるため、`output: 'standalone'` は `STANDALONE=true` 環境変数で Docker ビルド時のみ有効化。

---

## セキュリティ（対策済み）

| CVE | 対象 | 修正版 | 状態 |
|-----|------|--------|------|
| CVE-2025-55182 | React 19.0-19.2.0 | React 19.2.3+ | 対策済み |
| CVE-2025-66478 | Next.js 15.x-16.0.6 | Next.js 16.1.4+ | 対策済み |
| CVE-2025-59471/59472 | Next.js | 16.1.5+ | 対策済み |

---

## 参考

- 詳細は [CLAUDE.md](../../CLAUDE.md) の技術スタック表を参照
- 各技術の公式ドキュメントを一次情報とする
