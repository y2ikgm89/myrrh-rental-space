---
paths:
  - src/shared/lib/validations/**
  - src/**/lib/validations/**
  - src/**/actions/**/*.ts
  - src/shared/domain/**
---

# Zod パターン（barrel index）

> **Barrel-index:** 各 subtopic は path-scoped autoload で連鎖ロードされる。

- [バリデーションスキーマ構築](zod-patterns/validation-schemas.md) — 基本 schema / 複合スキーマ / スキーマ合成 / URL / datetime-local / RHF 連携 / Discriminated union / ファイル配置 / 禁止事項
- [エラーフォーマット](zod-patterns/error-formatting.md) — `error:` パラメータ / safeParse + flattenError
- [配列 uniqueness・cross-field refine](zod-patterns/array-uniqueness.md) — write-side `.refine()` 厳格拒否 / read-side `.transform()` dedupe / `.superRefine()` / collectXxx ヘルパー
- [メタデータ registry](zod-patterns/metadata-registry.md) — `.meta()` / `z.registry<T>()` / fieldRegistry / ADR 0018
- [Enum・Literal・型ガード](zod-patterns/enum-and-literals.md) — `z.enum(PrismaEnum)` / isValid* / getValid* / ローカル型ガード禁止
