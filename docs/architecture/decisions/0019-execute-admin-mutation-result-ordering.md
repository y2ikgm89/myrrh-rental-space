# 19. executeAdminMutationResult の実行順序契約（監査ログは fire-and-forget）

- **Status**: Accepted
- **Date**: 2026-04-23
- **Deciders**: @y2ikgm89
- **Tags**: server-actions, audit, cache, silent-bug-prevention
- **Supersedes**: (なし)
- **Related**: [0012 executeAdminMutationResult](./0012-execute-admin-mutation-result.md)

## Context and Problem Statement

ADR 0012 で採択した `executeAdminMutationResult` は、書き込み系 Server Action の 7 責務（認証 / 権限 / EDITOR 制限 / DomainError 変換 / 監査ログ / キャッシュ無効化 / レスポンス構築）を集約する。
ただし内部の実行順序は不文律になっており、以下のいずれの並びでも「型的には」動作する:

```
(A) execute → await logAction → await afterSuccess
(B) execute → await afterSuccess → await logAction
(C) execute → await afterSuccess → fireAndForget(logAction)
```

2026-04-23 のセッションで別 AI が (B) パターンに変更し、以下の silent regression を誘発した:

1. `execute` で DB mutation が成功
2. `await logAction` で Prisma `auditLog.create` が transient error（接続切断・タイムアウト等）で throw
3. `executeAdminMutationResult` の catch で `isDomainError(error)` は false → rethrow
4. **`afterSuccess` がスキップされ `updateTag(CACHE_TAGS.*)` が呼ばれない**
5. 呼び出し元 UI では mutation が失敗扱い（500）になるが、DB には変更がコミット済み
6. 再試行すると P2002（unique constraint）等で再度失敗、かつ公開ページキャッシュが stale のまま

監査ログは「コンプライアンス記録」であり「mutation の整合性に必須の副作用」ではない。これをクリティカルパスに入れる設計は、mutation の可用性と監査の可用性を二重に毀損する。

## Decision Drivers

- **cache invalidation の保証**: ADR 0017 で採択した SectionStyle cascade 含め、全ての mutation は `afterSuccess` での `updateTag` に整合性を依存する。afterSuccess のスキップは公開側のキャッシュ破綻を引き起こす
- **監査ログの可用性設計**: 監査 write は非クリティカル副作用。失敗時は observability（`logError` で Cloud Error Reporting）で検出できればよく、ユーザー mutation をブロックすべきでない（業界標準: SOX / GDPR の監査要件も「記録の試行」が主眼で「記録の強整合性」ではない）
- **応答時間**: `prisma.auditLog.create` の p99 遅延を mutation 応答に加算しない（特に list page redirect 後の Route Handler 実行）
- **silent bug の再発防止**: 契約を ADR で明文化 + rules で grep 可能にし、将来の別 AI / 別 session 介入で (A)/(B) に戻る余地を塞ぐ

## Considered Options

### Option 1: (A) `execute → await logAction → await afterSuccess`

監査ログを先に完了させてから cache invalidation する。

- **Pro**: 監査ログが確実に書かれてから response を返せる
- **Con**: 監査失敗で afterSuccess がスキップ（本 ADR の問題そのもの）
- **Con**: 監査 DB が劣化すると全 mutation が impact を受ける

### Option 2: (B) `execute → await afterSuccess → await logAction`

cache invalidation を先、監査を後。

- **Pro**: cache は必ず invalidate される
- **Con**: 監査失敗が依然として 500 → ユーザーには正常 mutation が失敗に見える
- **Con**: 再試行時の二重記録リスク（ユーザーが再度 submit した場合 affected rows は 0 だが監査は 2 回書かれる可能性）

### Option 3: (C) `execute → await afterSuccess → fireAndForget(logAction)` ★採択

監査ログを非ブロッキング化。失敗は `logError` で構造化ログに流す。

- **Pro**: mutation 応答が監査の可用性に非依存
- **Pro**: cache invalidation は必ず完走
- **Pro**: 監査失敗は Cloud Error Reporting で observable（category: `DATABASE`, severity: `MEDIUM`）
- **Con**: 監査 write 成功を await できない（非同期なのでテストの同期検証が難しい）
  - → mitigate: integration test では `logUserAction` の mock が呼ばれた事実のみ assert し、DB への書き込みは別途 smoke test で確認

## Decision

**Option 3 を採択**。`executeAdminMutationResult` 内部の実行順序を以下で固定する:

```typescript
try {
  const data = await options.execute(permissionResult.user);
  await options.afterSuccess?.(data); // クリティカル副作用（cache invalidation / 通知生成）

  fireAndForget(
    logAction(
      permissionResult.user.id,
      options.action,
      options.resource,
      options.resolveAuditResourceId?.(data) ?? options.resourceId,
    ),
    {
      operation: "executeAdminMutationResult.logAction",
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { resource, action, userId },
    },
  );

  return data;
} catch (error) {
  if (isDomainError(error)) return { error: error.message };
  throw error;
}
```

## Consequences

### Positive

- mutation 応答時間が監査 DB 劣化の影響を受けない
- `afterSuccess` の `updateTag` が常に完走 → ADR 0017 SectionStyle cascade 等の cache invalidation 契約が維持される
- 監査失敗は `logError` で Cloud Error Reporting に集約され、別 AI / 別 session の regression を検出可能
- `CLAUDE.md` ハードルール + `.claude/rules/server-actions.md` + 本 ADR で 3 層明文化

### Negative / Trade-offs

- 監査 write の強整合性は諦める（SOX / GDPR 監査要件上は「記録の試行」が主眼のため実害なし）
- integration test で監査書き込みの完了を同期 assert できない（mock 呼び出しのみ検証）

### Neutral

- 既存のテスト（`__tests__/integration/actions/admin/*.test.ts`）は `mock.module("@/admin/lib/audit", ...)` で `logUserAction` を mock しており挙動変更なし

## Detection / Enforcement

### grep ベースのレビュー検出

```bash
# executeAdminMutationResult 内部で await logAction が混入した regression を検出
grep -rnE "await logAction\(" src/app/\(admin\)/admin/\(dashboard\)/_shared/lib/admin-action.ts
# → hit すれば regression
```

`project-reviewer` agent の description に本 ADR を反映し、`await logAction(` パターンを高信頼度で検出する。

### テスト戦略

- `__tests__/integration/actions/admin/*.test.ts` で `mock.module("@/admin/lib/audit", ...)` で `logUserAction` を mock し、`expect(mockLogUserAction).toHaveBeenCalledWith(...)` で呼び出しを検証
- 「監査 write が失敗しても cache invalidation は走る」の smoke test を追加可能（`logUserAction` mock を `.mockRejectedValue(new Error("simulated"))` にして `updateTag` mock が呼ばれたことを検証）

## References

- ADR 0012: executeAdminMutationResult 採択
- `src/app/(admin)/admin/(dashboard)/_shared/lib/admin-action.ts`: 実装正本
- `.claude/rules/server-actions.md` §executeAdminMutationResult 実行順序契約
- `.claude/rules/auth-patterns.md` §監査ログ
- `CLAUDE.md` ハードルール §Validation / Domain
- `src/shared/lib/async-utils.ts`: `fireAndForget` ヘルパー定義
