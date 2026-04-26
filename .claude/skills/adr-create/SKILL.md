---
name: adr-create
description: ADR (Architecture Decision Record) を docs/architecture/decisions/ に次の連番で新規作成する。既存番号を自動スキャンして衝突を防ぐ（過去に 0011 番号衝突事故あり）。引数は短いタイトル（kebab-case 推奨、例 `add-payment-retry-policy`）。
disable-model-invocation: true
---

# ADR Create

新規 ADR を `docs/architecture/decisions/<NNNN>-<kebab-title>.md` として作成する。

## 手順

### 1. 引数からタイトルを取得

ユーザー引数（例 `/adr-create add-payment-retry-policy`）から kebab-case のスラッグを取得。
未指定なら「ADR タイトル（kebab-case）を指定してください」と返して終了。

### 2. 次の連番を算出

```bash
ls docs/architecture/decisions/ 2>/dev/null | grep -E '^[0-9]{4}-' | sort | tail -1
```

最後のファイル名先頭 4 桁を取得し、+1 して 4 桁ゼロパディング（`0021` → `0022`）。
ディレクトリが空なら `0001` から開始。

### 3. ファイル作成

パス: `docs/architecture/decisions/<NNNN>-<kebab-title>.md`

テンプレート:

```markdown
# <NNNN>. <Title (Sentence case)>

- **Status**: Proposed
- **Date**: <YYYY-MM-DD>
- **Deciders**: <git config user.name の値>

## Context and Problem Statement

<解決したい問題と現状の制約を 2-3 段落で記述>

## Decision Drivers

- <driver 1>
- <driver 2>

## Considered Options

1. **Option A**
2. **Option B**
3. **Option C**

## Decision Outcome

**Chosen option**: <Option X> — <理由>

### Consequences

**良い点**:

- <利点 1>
- <利点 2>

**悪い点 / トレードオフ**:

- <欠点 1>
- <欠点 2>

### Compliance / Validation

- <検証手順 / 影響ファイルの列挙>

## Links / References

- <公式ドキュメント / 関連 ADR>
```

`<NNNN>` / `<Title>` / `<YYYY-MM-DD>` / `<Deciders>` を実値に置換。kebab-case のタイトルは Sentence case に変換（`add-payment-retry-policy` → `Add payment retry policy`）。

### 4. README 更新リマインダー

`docs/architecture/decisions/README.md` が存在するなら「README.md にも新 ADR のエントリを追加してください」と user に通知（自動編集はしない）。

### 5. 完了報告

```
作成: docs/architecture/decisions/<NNNN>-<kebab-title>.md
次のステップ: ① 内容を埋める ② Status を Proposed → Accepted に進める ③ README.md に index 追加
```

## ガード

- 同じ `<NNNN>-` で始まるファイルが既に存在する場合は番号衝突として中断（手動で次番号を確認するよう指示）
- kebab-case 以外（CamelCase / snake_case / 日本語）が引数に含まれる場合は kebab-case への変換を提案してから作成

## 参考

- CLAUDE.md §Git / Migration「ADR 新規作成前に `ls docs/architecture/decisions/ | grep "^00"` で既存番号確認」
- 既存 ADR: `docs/architecture/decisions/0021-remove-section-style-library.md` がフォーマット参照
