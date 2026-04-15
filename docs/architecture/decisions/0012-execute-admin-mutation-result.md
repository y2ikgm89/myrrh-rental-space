# 12. 管理画面の書き込み系 Server Actions は executeAdminMutationResult に統一

- **Status**: Accepted
- **Date**: 2026-04-15
- **Deciders**: @y2ikgm89
- **Tags**: server-actions, security, audit

## Context and Problem Statement

管理画面 Server Actions（create / update / delete / publish 等）は以下の責務を同時に満たす必要がある:

1. セッション取得 + 管理者ロール検証
2. リソース × アクション単位の権限チェック（`ROLE_PERMISSIONS`）
3. EDITOR の個別リソースアクセス制限（`userPageAssignment`）
4. ドメイン層の `DomainError` キャッチ → `createFailure()` 変換
5. 監査ログ（`AuditLog` テーブル）への `logAction()` 記録
6. キャッシュ無効化（`updateTag` 呼び出し）
7. 成功時の `createSuccess` / 失敗時の `createFailure` 構築

これらを各 Server Action で個別に書くと、認証漏れ・監査ログ漏れ・エラー変換漏れが発生し、セキュリティ検査の工数が scale しない。

## Decision Drivers

- 認証・権限・監査ログを漏らさない（SOX 的な内部統制要件）
- Server Action の実装者がビジネスロジックに集中できる
- 型安全に `MutationResult<T>` を返す（成功時は `{ data: T }`、失敗時は `{ error, fieldErrors? }`）
- DomainError（ドメイン層の業務例外）を UI フレンドリーなメッセージに変換
- Next.js 16 `updateTag()` は Server Action 内でしか使えないため、`afterSuccess` コールバックで実行

## Considered Options

1. **Option A**: HOF パターン (`withPermission(action)`) でラップ
2. **Option B**: 各 Server Action が `checkPermission` / `logAction` を直接呼ぶ（自前ボイラープレート）
3. **Option C**: `executeAdminMutationResult({ resource, action, execute, afterSuccess, ... })` の宣言的 options オブジェクト API

## Decision Outcome

**Chosen option**: "Option C — executeAdminMutationResult"、なぜなら:

- Turbopack HMR と HOF パターン（Option A）の相性が悪く、`withPermission(...)` でラップした Server Action は一部の dev reload で正しく更新されない事象があった
- options オブジェクト形式は呼び出し側で宣言的に読める（`resource: "post", action: "create"` が自己文書化）
- `resolveAuditResourceId` のようなコールバックで「実行後に確定する ID」を監査ログに渡せる（create 時のリソース ID）
- ジェネリクス `MutationResult<T>` で `execute` の戻り値型がそのまま client に伝播する

実装（`@/admin/lib/admin-action`）:

```typescript
export async function executeAdminMutationResult<TData>(options: {
  resource: Resource;
  action: Action;
  resourceId?: string;
  checkResourceAccess?: boolean;
  execute: (user: AdminUser) => Promise<TData>;
  afterSuccess?: (data: TData) => Promise<void> | void;
  resolveAuditResourceId?: (data: TData) => string | undefined;
}): Promise<MutationResult<TData>> {
  // 1. checkPermission / checkResourceAccess
  // 2. try { const data = await execute(user) } catch DomainError → createFailure
  // 3. logAction(user.id, action, resource, resolveAuditResourceId?.(data))
  // 4. await afterSuccess?.(data)
  // 5. return { data }
}
```

呼び出し側:

```typescript
export const createPost = async (
  input: CreatePostInput,
): Promise<MutationResult<{ id: string }>> => {
  const parsed = createPostSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "post",
    action: "create",
    execute: async () => createPostCommand(parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.POSTS);
    },
    resolveAuditResourceId: (data) => data.id,
  });
};
```

### Consequences

**良い点**:

- 管理画面 Server Action 全 100+ ファイルが同一パターンで実装されており、認証漏れのレビューが grep レベルで可能（`executeAdminMutationResult` を使っていない write 系が唯一の違反）
- `DomainError` → `createFailure(error.message)` の変換を `execute` ラッパーで 1 箇所に集約
- 監査ログの `userId` / `action` / `resource` / `resourceId` は executeAdminMutationResult 側で確実に記録される
- `afterSuccess` が `updateTag` 呼び出しの標準位置になっており、キャッシュ無効化漏れが視認しやすい

**悪い点 / トレードオフ**:

- Server Action 1 つに対して options オブジェクト + クロージャ 2 つ（`execute`, `afterSuccess`）というボイラープレートが必ずつく
- 読み取り系 Server Action（読み取りアクション）は `executeAdminMutationResult` ではなく `verifyAdminSession` + `cache()` でメモ化するパターンになるため、「書き込みは executeAdminMutationResult、読み取りは verifyAdminSession」の使い分けを開発者が理解する必要がある
- API Route Handler では `executeAdminMutationResult` ではなく `checkPermission` を直接呼ぶ（Server Actions 固有の `headers()` / `updateTag()` が使えないため）

### Compliance / Validation

- `.claude/rules/server-actions.md` — executeAdminMutationResult パターンを書き込み系の唯一の正規パターンとして明記
- `.claude/rules/auth-patterns.md` — `checkPermission` の直接呼び出しは API Route 専用と記載
- CI `bun run lint` は `no-restricted-syntax` で `checkPermission` の Server Action 直接呼び出しを警告
- コードレビューでは「write 系 Server Action かつ executeAdminMutationResult を使っていない」パターンをレビュアーが grep で検出

## Pros and Cons of the Options

### Option A: HOF パターン

- ✅ ラップ関数の命名で意図が明確
- ❌ Turbopack HMR との相性問題（実体験）
- ❌ クロージャで user 引数を渡すため型推論が弱い

### Option B: 個別実装

- ✅ 柔軟性最大
- ❌ 認証・監査漏れリスクが大きい
- ❌ 100+ ファイルで同じボイラープレートを繰り返す

### Option C: 宣言的 options オブジェクト ✅ 採用

- ✅ 自己文書化
- ✅ 監査ログ・キャッシュ無効化の標準位置
- ✅ ジェネリクスで型伝播
- ⚠️ 読み取り系との使い分けを文書化する必要あり

## Links / References

- 実装: `src/app/(admin)/admin/(dashboard)/_shared/lib/admin-action.ts`
- 関連 rules: `.claude/rules/server-actions.md`, `.claude/rules/auth-patterns.md`, `.claude/rules/error-handling.md`
- 関連型: `@/shared/lib/mutation-result` の `MutationResult<T>`, `isMutationError()`
