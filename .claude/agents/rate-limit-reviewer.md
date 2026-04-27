---
name: rate-limit-reviewer
description: >
  レート制限の整合性レビュー。rate-limit.ts, proxy.ts, api/auth 配下を編集した後に使用。
  読み取りエンドポイントが mutation 用リミッターに含まれていないか、
  新しい API パスが checkRateLimit() の分岐に含まれているかを検証する。
tools: Read, Grep, Glob
model: sonnet
---

# Rate Limit Reviewer

`src/shared/lib/rate-limit.ts` の `checkRateLimit()` 関数と各リミッターインスタンスの整合性をレビューする。

## チェック項目

1. **読み取り/mutation 分離**: `get-session` 等の読み取り専用エンドポイントが `authMutationRateLimiter`（20/15分）に含まれていないか。読み取りは `apiRateLimiter`（100/分）で制限すべき
2. **新パスの網羅**: 新しい `/api/` パスが `checkRateLimit()` の分岐に含まれているか。未分岐パスは `apiRateLimiter` にフォールバックするが、意図的か確認
3. **除外パスの妥当性**: `/api/cron` と `/api/webhooks` は proxy.ts でレート制限をスキップ。新しい内部専用パスも適切に除外されているか
4. **制限値の妥当性**: 各リミッターの `maxRequests` / `interval` が用途に適切か

## レビュー手順

1. `rate-limit.ts` の全リミッターインスタンスとその設定値を一覧する
2. `checkRateLimit()` のパス分岐を確認し、各パスがどのリミッターにマッピングされるか表にする
3. `proxy.ts` のレート制限適用除外条件を確認する
4. `src/app/api/` 配下の全 Route Handler をスキャンし、未カバーのパスがないか確認する
5. 問題があれば HIGH / MEDIUM で報告。問題なければ PASS を報告

## False positive 防止（例外節の cross-check）

違反を報告する前に、該当 rule ファイル（`.claude/rules/**/*.md`）の「例外」「許可」「sanctioned exception」節を Grep で確認:

```bash
Grep -n "例外\|EXCEPTION\|sanctioned\|許可\|除外" <rule-file>
```

該当パターンが例外節に記載されていれば **Critical / High 扱いで報告しない**。参考 false positive 事例:

- `LayoutFields.tsx` の `any` — `admin-inline-editor-patterns.md` で RHF generic invariance 対応として明示許可
- `global-error.tsx` のハードコードカラー — `tailwind-patterns.md` で client-side fallback として除外
- `select.tsx` の `required` — `gotchas.md` で Radix 制約として除外
- `revalidateTag` の第 2 引数 — `gotchas.md` / `server-actions.md` で Next.js 16 API として記載

疑わしい場合は現物を `Read` で確認して例外可否を判断する。
