---
description: Zod パターンルール — 詳細は sub-file を参照
---

# Zod パターン（barrel index）

> **注**: このファイルは TOC のみ。実体は sub-file が `paths:` で auto-load する。手動参照用。

- [バリデーションスキーマ構築](zod-patterns/validation-schemas.md) — 基本 schema / 複合スキーマ / スキーマ合成 / URL / datetime-local / RHF 連携 / Discriminated union / ファイル配置 / 禁止事項
- [エラーフォーマット](zod-patterns/error-formatting.md) — `error:` パラメータ / safeParse + flattenError
- [配列 uniqueness・cross-field refine](zod-patterns/array-uniqueness.md) — write-side `.refine()` 厳格拒否 / read-side `.transform()` dedupe / `.superRefine()` / collectXxx ヘルパー
- [メタデータ registry](zod-patterns/metadata-registry.md) — `.meta()` / `z.registry<T>()` / fieldRegistry / ADR 0018
- [Enum・Literal・型ガード](zod-patterns/enum-and-literals.md) — `z.enum(PrismaEnum)` / isValid* / getValid* / ローカル型ガード禁止
