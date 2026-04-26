#!/usr/bin/env bash
# PostToolUse (Edit|Write): 7 つの軽量パターンチェックを 1 プロセスで実行
# 統合元: check-server-action-hof, settings-field-reminder, import-boundary-check,
#          eslint-disable-audit, soft-delete-guard, auth-client-check, type-alias-guard
#
# 公式仕様: PostToolUse の stdout はモデルのコンテキストに流れない。
# 警告はすべて hookSpecificOutput.additionalContext JSON で返す。

set -euo pipefail

: "${CLAUDE_PROJECT_DIR:=$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0
[ ! -f "$FILE_PATH" ] && exit 0

BASENAME=$(basename "$FILE_PATH")
WARNINGS=()

emit_context() {
  if [ ${#WARNINGS[@]} -eq 0 ]; then
    exit 0
  fi
  local joined
  joined=$(printf '%s\n' "${WARNINGS[@]}")
  jq -n --arg ctx "pattern-guard 警告:\n${joined}" '{
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: $ctx
    }
  }'
  exit 0
}

# =============================================================================
# 1. Schema change guard (settings-field-reminder)
# =============================================================================
if [[ "$BASENAME" == "schema.prisma" ]] && [[ "$FILE_PATH" == *"/prisma/schema.prisma" || "$FILE_PATH" == "prisma/schema.prisma" ]]; then
  if [[ "$TOOL_NAME" == "Edit" ]]; then
    NEW_STRING=$(printf '%s' "$INPUT" | jq -r '.tool_input.new_string // empty' 2>/dev/null || echo "")
    OLD_STRING=$(printf '%s' "$INPUT" | jq -r '.tool_input.old_string // empty' 2>/dev/null || echo "")
    SCHEMA_FILE="$CLAUDE_PROJECT_DIR/prisma/schema.prisma"

    if printf '%s' "$NEW_STRING" | grep -qE '^\s+(String|Boolean|Int|Float|DateTime|Json)'; then
      if [ -f "$SCHEMA_FILE" ] && grep -A 200 'model Settings {' "$SCHEMA_FILE" | grep -q "$(printf '%s' "$OLD_STRING" | head -1)" 2>/dev/null; then
        WARNINGS+=("- Settings モデルにフィールド追加検出。4箇所更新必要: types.ts / queries / commands / schemas+actions。/add-settings-field で一括可能。")
      fi
    fi
  fi
  emit_context
fi

# 以降は .ts/.tsx ファイルのみ
case "$FILE_PATH" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# テスト・生成ファイルは除外
case "$FILE_PATH" in
  *__tests__/*|*generated/*|*.test.*|*.spec.*|*.d.ts) exit 0 ;;
esac

# =============================================================================
# 2. Import boundary check
# =============================================================================
if [[ "$FILE_PATH" == *"(public)"* ]]; then
  if grep -qE 'from\s+["'"'"']@/admin/' "$FILE_PATH" 2>/dev/null; then
    WARNINGS+=("- Import 境界違反: public 側から @/admin/* を import。共有コードは @/shared/* に配置。")
  fi
elif [[ "$FILE_PATH" == *"(admin)"* ]] && [[ "$FILE_PATH" != *"register-admin-sections"* ]]; then
  if grep -qE 'from\s+["'"'"']@/public/' "$FILE_PATH" 2>/dev/null; then
    WARNINGS+=("- Import 境界違反: admin 側から @/public/* を import。共有コードは @/shared/* に配置。")
  fi
fi

# =============================================================================
# 3. Server Action HOF check
# =============================================================================
if [[ "$FILE_PATH" == *"actions"* ]]; then
  if grep -qE '^"use server"|^'"'"'use server'"'" "$FILE_PATH" 2>/dev/null; then
    if ! grep -qE "executeAdminMutation|executeAdminMutationResult|checkPermission|checkAdminAuth|checkResourceAccess" "$FILE_PATH" 2>/dev/null; then
      if grep -qE "^export (async function|const )" "$FILE_PATH" 2>/dev/null; then
        WARNINGS+=("- Server Action に認証パターン未使用。書き込み系: executeAdminMutationResult、API Route: checkPermission。")
      fi
    fi
  fi
fi

# =============================================================================
# 4. ESLint disable audit (stale rule names)
# =============================================================================
for pattern in "@eslint-react/hooks-extra/" "@eslint-react/debug/" "@eslint-react/dom/" "@eslint-react/web-api/" "@eslint-react/rsc/" "@eslint-react/naming-convention/"; do
  if grep -q "eslint-disable.*${pattern}" "$FILE_PATH" 2>/dev/null; then
    WARNINGS+=("- 廃止 eslint ルール名検出: ${pattern}* — v4 ではスラッシュがハイフンに変更。")
    break
  fi
done

# =============================================================================
# 5. Soft-delete guard
# =============================================================================
case "$FILE_PATH" in
  *domain/reservations/*|*domain/events/*|*domain/reviews/*)
    HAS_RESTORE=$(grep -c 'restore' "$FILE_PATH" 2>/dev/null | tr -d '[:space:]' || echo "0")
    if [ "$HAS_RESTORE" -eq 0 ]; then
      for MODEL in reservation event spaceReview; do
        HAS_QUERIES=$(grep -cE "${MODEL}\.(findUnique|findFirst|findMany|update)\(" "$FILE_PATH" 2>/dev/null | tr -d '[:space:]' || echo "0")
        [ "$HAS_QUERIES" -eq 0 ] && continue
        HAS_DELETED_AT=$(grep -c 'deletedAt' "$FILE_PATH" 2>/dev/null | tr -d '[:space:]' || echo "0")
        if [ "$HAS_DELETED_AT" -eq 0 ]; then
          WARNINGS+=("- ソフトデリート警告: ${MODEL} クエリ ${HAS_QUERIES} 件に deletedAt: null が未設定。")
        fi
      done
      for PARENT in event reservation; do
        HAS_PARENT_REF=$(grep -cE "${PARENT}Id" "$FILE_PATH" 2>/dev/null | tr -d '[:space:]' || echo "0")
        [ "$HAS_PARENT_REF" -eq 0 ] && continue
        HAS_NESTED_GUARD=$(grep -cE "${PARENT}:\s*\{[^}]*deletedAt" "$FILE_PATH" 2>/dev/null | tr -d '[:space:]' || echo "0")
        HAS_PARENT_DA=$(grep -c 'deletedAt' "$FILE_PATH" 2>/dev/null | tr -d '[:space:]' || echo "0")
        if [ "$HAS_NESTED_GUARD" -eq 0 ] && [ "$HAS_PARENT_DA" -eq 0 ]; then
          HAS_ANY_Q=$(grep -cE '(findUnique|findFirst|findMany|update|count|aggregate)\(' "$FILE_PATH" 2>/dev/null | tr -d '[:space:]' || echo "0")
          if [ "$HAS_ANY_Q" -gt 0 ]; then
            WARNINGS+=("- リレーション経由ソフトデリート警告: ${PARENT}Id 参照に ${PARENT}: { deletedAt: null } ガード未設定。")
          fi
        fi
      done
    fi
    ;;
esac

# =============================================================================
# 6. Auth client check (signIn.social without fetchOptions)
# =============================================================================
if grep -qE 'from.*auth-client' "$FILE_PATH" 2>/dev/null; then
  if grep -qE 'signIn\.social\(' "$FILE_PATH" && ! grep -qE 'fetchOptions' "$FILE_PATH"; then
    WARNINGS+=("- signIn.social() に fetchOptions.onError がありません（HTTP エラーがサイレント失敗）。")
  fi
fi

# =============================================================================
# 7. Type alias guard (zero-value type aliases)
# =============================================================================
if grep -nE '^export type [A-Z]\w+ = [A-Z]\w+;$' "$FILE_PATH" >/dev/null 2>&1; then
  WARNINGS+=("- ゼロ値型エイリアス検出: $(basename "$FILE_PATH") — 元の型を直接使用してください。")
fi

# =============================================================================
# 8. "use server" export contract（async 関数のみ export 可、Turbopack silent bug 防止）
# =============================================================================
if head -1 "$FILE_PATH" 2>/dev/null | grep -qE '^"use server"|^'"'"'use server'"'"; then
  # 型 / interface / class / let / var の export
  if grep -nE '^export (type |interface |class |let |var )' "$FILE_PATH" >/dev/null 2>&1; then
    WARNINGS+=("- \"use server\" ファイルから type/interface/class/let/var を export 検出 — Turbopack silent bug。型は <file>-types.ts に退避してください（参照: server-actions.md §export 契約）。")
  fi
  # 非 async const export（async ... で始まらないもの）
  if grep -nE '^export const [A-Za-z_]+\s*=' "$FILE_PATH" 2>/dev/null | grep -vE '=\s*async ' >/dev/null 2>&1; then
    WARNINGS+=("- \"use server\" ファイルに非-async const export 検出 — async 関数のみ export 可。定数・helper は別 module（import \"server-only\"）に分離してください。")
  fi
fi

emit_context
