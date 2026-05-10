---
description: Server Action 実装パターン（executeAdminMutationResult）+ 公開データ取得（safeFetch + toPlainObject）
paths:
  - src/**/_actions/**
  - src/**/actions/**
---

# Server Action — 実装パターン / 公開データ取得

> executeAdminMutationResult SSoT / safeFetch + toPlainObject

> 詳細サブルール（path-scoped auto-load）:
>
> - **Admin Server Action 実装パターン (Promise.all / executeAdminMutationResult / checkPermission API only / 実行順序契約)** — `server-actions/implementation/admin-actions.md`
> - **FormData useActionState + MutationResult + 公開データ ('use cache' + safeFetch) + redirect typedRoutes cast** — `server-actions/implementation/forms-and-public.md`
