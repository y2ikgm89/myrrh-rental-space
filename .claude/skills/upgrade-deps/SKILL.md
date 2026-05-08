---
name: upgrade-deps
description: 依存関係のアップグレード。bun outdated で確認 → semver 範囲内更新 → メジャー/マイナーアップグレード → validate → lint エラー修正 → build 検証の一連フロー。「依存関係を更新して」「パッケージをアップグレードして」場面で使用。
paths:
  - package.json
  - bun.lock
---

# 依存関係アップグレードスキル

## ワークフロー

### Step 1: 現状確認

```bash
bun outdated
```

出力を分類:

- **semver 範囲内**: `bun update` で自動更新
- **メジャー/マイナー**: `bun add pkg@latest` で個別更新（破壊的変更の可能性）

### Step 2: semver 範囲内の安全な更新

```bash
bun update
```

### Step 3: メジャー/マイナーアップグレード（ユーザー確認）

メジャー changelog の取得は `gh release view <tag> -R <owner>/<repo>` を ground truth とする。WebFetch は新規リリース直後（同日〜数日以内）のページで日付・内容を訓練データから hallucinate することがある。
パッケージのサブパス export（`<pkg>/locale` 等）が必要な場合は `bun pm view <pkg> exports` で install 前に構造確認。

更新候補をテーブルで提示し、ユーザーに確認:

| パッケージ | 現在  | 最新  | 変更規模 | リスク                |
| ---------- | ----- | ----- | -------- | --------------------- |
| example    | 2.0.0 | 3.0.0 | MAJOR    | ESLint ルール名変更等 |

承認後:

```bash
bun add pkg1@latest pkg2@latest
```

### Step 4: Prisma 再生成（該当時）

Prisma が更新された場合:

```bash
bun run db:generate
```

### Step 5: 検証

```bash
bun run validate
```

### Step 6: lint エラー修正

メジャーアップグレードで lint エラーが発生した場合:

1. ルール名変更 → eslint-disable コメントを一括置換
2. 新規ルール追加 → コード修正（IIFE 除去、コンポーネント抽出等）
3. false positive → warn レベルなら放置可

### Step 7: ビルド検証

```bash
bun run build
```

### Step 8: コミット

```
refactor: upgrade deps and fix breaking changes

Dependencies upgraded:
- pkg1: old → new (MAJOR)
- pkg2: old → new (minor)

Breaking changes fixed:
- [具体的な修正内容]
```

## 既知のアップグレード注意点

| パッケージ                    | 注意点                                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@eslint-react/eslint-plugin` | v2→v3 でルール名変更（`hooks-extra/*` → `@eslint-react/*`）、新ルール追加（purity, unsupported-syntax, component-hook-factories）                                                                                                                                                                                      |
| `prisma`                      | マイナーでも generated client の API が変わることがある。必ず `bun run db:generate`                                                                                                                                                                                                                                    |
| `better-auth`                 | パッチでも Prisma adapter の互換性が変わることがある。`@better-auth/prisma-adapter` も同時更新                                                                                                                                                                                                                         |
| `next`                        | `next.config.ts` の experimental オプション名が変わることがある                                                                                                                                                                                                                                                        |
| scoped package rename         | 公式 changelog で「legacy 名は互換維持」「新 scoped 名が推奨」と明記されている場合、`bun add <new-scoped>@latest && bun remove <legacy>` で direct dep を切替 + source の import を新名に統一。bun.lock に legacy が transitive で残るのは正常（package contract）。例: `react-day-picker` → `@daypicker/react`（v10） |
