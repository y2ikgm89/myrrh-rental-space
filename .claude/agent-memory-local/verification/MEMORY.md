# Verification Agent Memory

## Build Status — 2026-02-18

**Status**: TYPE-CHECK FAILING ✗
- **TypeScript**: FAIL (~203 errors due to discriminated union narrowing limitations)
- **Root Cause**: TypeScript cannot properly narrow `ActionResult<T>` union type using `!result.success` checks
- **Affected Files**: ~70+ files using pattern `if (!result.success) { access result.error }`

## Type Narrowing Issue — ActionResult<T>

**Problem**: TypeScript's control flow analysis fails to narrow discriminated unions when:
1. The discriminant uses a conditional type (`TData extends void ? type1 : type2`)
2. Code checks the boolean discriminant (`success: true | false`) to narrow
3. The success branch has different property shapes depending on generic parameter

**Current Type Definition**:
```typescript
export type ActionSuccess<TData = void> = {
  success: true
  message: string
} & (TData extends void ? {} : { data: TData })

export type ActionFailure = {
  success: false
  error: string
  fieldErrors?: Record<string, string[]>
}

export type ActionResult<TData = void> = ActionSuccess<TData> | ActionFailure
```

**Code Pattern That Fails**:
```typescript
const result: ActionResult<{ userId: string }> = await setupPassword(...)
if (!result.success) {
  // TypeScript: ✗ Cannot narrow to ActionFailure
  // Error: Property 'error' does not exist on type '...'
  setError(result.error)
}
```

**Why It Fails**: TypeScript's type narrowing can't distinguish between the two union members because:
- `ActionSuccess<{ userId: string }>` becomes intersection type with both `{success: true, message}` AND `{data}`
- The type system loses track of which union member `result` is when checking `success === false`
- Conditional types in union discriminants break narrowing

## Solutions Attempted

1. ✗ Extracted conditional to separate named types
2. ✗ Added `readonly` modifiers to force literal type narrowing
3. ✗ Used intersection types instead of unions
4. ✗ Restructured ActionSuccess shape

**None worked** — TypeScript limitation, not fixable via type definition changes alone.

## Required Fix

One of two approaches:

### Option A: Use Explicit Type Guards (Preferred, No Runtime Cost)
Update all ~70 locations to use the existing `isActionFailure()` type guard:
```typescript
// Before
if (!result.success) {
  setError(result.error)
}

// After
if (isActionFailure(result)) {
  setError(result.error)
}
```
**Cost**: Update ~150-200 lines across 70+ files

### Option B: Restructure Types (Breaking Change)
Flatten the union without conditional types:
```typescript
type ActionResult<T> =
  | { success: true; message: string }
  | { success: true; message: string; data: T }
  | { success: false; error: string }
```
**Issues**:
- Creates duplicate type definitions
- `success: true` would have two branches
- No type safety on when `data` exists
- Worse DX

## Files Needing Updates

**Top affected categories**:
- Setup pages: `setup/[token]/*.tsx`
- Admin action handlers: `_shared/actions/*.ts` (~25 files)
- Editor components: `editor/**/*.tsx` (~10 files)
- Form/inline editors: `*Editor.tsx` (~5 files)
- Route handlers: `api/**/*.ts` (~3 files)
- Analytics: `AnalyticsCard.tsx`
- Other UI: CommentPanel, BaseFilters, etc.

## Recommendation

**Implement Option A** (explicit type guards) as part of pre-commit validation or separate task:
```bash
# Find all instances
grep -r "!result\.success" src/

# Convert to:
# if (isActionFailure(result)) {
```

This ensures proper type safety and prevents future narrowing issues.

## Build Status After Fix Attempt

Build did NOT complete - stopped at type-check phase due to 203 errors.
Next step: Fix narrowing issues, then re-run `bun run build`.

## Test Configuration Type Errors — 2026-02-18

**File**: `__tests__/unit/types/server-actions.test.ts`
**Error Count**: 2 errors (lines 113, 122)
**Error Code**: TS2345 (argument type mismatch)
**Root Cause**: `createSuccess('OK')` without data returns `{ success: true, message: string }`, but `ActionResult<void>` type annotation expects `{ success: true, message: string, data: void }` intersection result

**Issue**: The type annotation `ActionResult<void>` when narrowed to `ActionSuccess<void>` creates an intersection type with conditional property. TypeScript can't infer the return value of `createSuccess()` (which doesn't include `data` property) matches this intersection.

**Test Lines**:
- Line 110: `const success: ActionResult<void> = createSuccess('OK')`
- Line 113: `expect(isActionSuccess(success)).toBe(true)` → Error TS2345
- Line 118: `const success: ActionResult<void> = createSuccess('OK')`
- Line 122: `expect(isActionFailure(success)).toBe(false)` → Error TS2345

**Solution**: The overload signatures in `createSuccess` are correct. The issue is test-specific type annotation narrowing. See fix suggestions below.

---

**Last Verified**: 2026-02-18
**Session**: Test type-check verification (tsconfig.test.json)
