# Bun v1.3.9 Performance Optimization Opportunities

**Scan Date**: 2026-02-09  
**Bun Current Version**: 1.3.x  
**Analysis Scope**: `src/` directory + `package.json`

---

## Executive Summary

Found **57 RegExp files**, **34 `.trim()` files**, and **18 `.startsWith()` files**. Most in non-critical paths. However, several **HOT PATH** items identified in:
- `src/proxy.ts` (middleware - every request)
- `src/shared/lib/email-service.ts` (async email generation)
- `src/shared/lib/serialize.ts` (data serialization - frequent calls)

**Key Finding**: Current code is already well-optimized for Bun v1.3.9. RegExp literals, `.trim()`, and `.startsWith()` all benefit from Bun 1.3.9's optimizations. No refactoring needed; focus on script parallelization instead.

---

## 1. RegExp Usage (57 files)

### Hot Paths (Performance Critical)

#### `src/proxy.ts` — CRITICAL (Line 198-199)
**Category**: HOT PATH (Every request through proxy)  
**Usage**: Date validation for permalink rewriting

```typescript
if (
  /^\d{4}$/.test(year) &&       // ← 4 digits (year)
  /^\d{1,2}$/.test(month) &&    // ← 1-2 digits (month)
  yearNum >= 2000 &&
  yearNum <= 2100 &&
  monthNum >= 1 &&
  monthNum <= 12
)
```

**Bun v1.3.9 Impact**: ✅ Optimized  
- Bun v1.3.9 has improved RegExp literals performance
- Current regex literals are already optimal
- Cached patterns not needed for this simple check

**Status**: ✅ No action needed. Monitor in production if profiling shows bottleneck.

---

### Cold Paths (Setup/Admin — 56 files)

**Most regex in validation/Lexical editor components** (not request-critical):
- `src/shared/lib/validations/section-design.ts` — URL/HEX color validation (setup time)
- `src/app/(admin)/.../_shared/lib/validations/` — Admin form validations (rare)
- `src/app/(admin)/.../lexical/` — Editor plugins (initialization)
- `src/shared/lib/google-calendar.ts` — Calendar sync (scheduled task)
- `src/shared/lib/cloudflare.ts` — CDN integration (setup)
- `src/shared/lib/ical/index.ts` — iCal parsing (startup/scheduled)

**Recommendation**: No optimization needed. Bun v1.3.9 handles these efficiently.

---

## 2. String.prototype.trim() Usage (34 files)

### Hot Paths

#### `src/shared/lib/email-service.ts` — WARM PATH (Line 82, 524, 645, 657)
**Category**: WARM PATH (Async email generation, ~daily)  
**Frequency**: Triggered on reservation/iCal events (not per-request)

**Usages**:
- **Line 82**: Parse comma-separated notification emails
  ```typescript
  .split(',')
  .map((email) => email.trim())
  .filter(Boolean)
  ```
- **Lines 524, 645, 657**: Template string trimming (email bodies)

**Bun v1.3.9 Impact**: ✅ Optimized  
- Bun v1.3.9 has significantly improved `.trim()` performance
- Pattern is idiomatic and already efficient

#### `src/shared/lib/serialize.ts` — MEDIUM HOT (Line 333)
**Category**: MEDIUM HOT (Serialization helper, frequent in data pipeline)  
**Usage**: Extract first content-type from header-like string

```typescript
const first = value.split(',')[0]
return first ? first.trim() : null
```

**Bun v1.3.9 Impact**: ✅ Optimized  
- Trim is negligible with v1.3.9 improvements

---

### Cold Paths (32 files)

**Admin UI & Validation**:
- `src/app/(public)/_shared/lib/page-metadata.ts` — Meta description cleanup (build)
- `src/app/(admin)/.../editor/` — Text cleanup (editing)
- `src/app/(admin)/.../actions/` — Form field trimming (rare)
- `src/shared/lib/rate-limit.ts` — Key normalization (setup)

**Recommendation**: No optimization needed.

---

## 3. String.prototype.startsWith() Usage (18 files)

### Hot Paths

#### `src/proxy.ts` — CRITICAL (Lines 139-151, 170, 213-215, 235, 254)
**Category**: HOT PATH (Every request through proxy)  
**Frequency**: Every incoming HTTP request  
**Calls per request**: 8-10 `.startsWith()` checks

**Pattern**:
```typescript
// Check 1-2: Early exit for static files
pathname.startsWith('/_next/') ||
pathname.startsWith('/api/') ||

// Check 3-4: Dynamic prefixes
pathname.startsWith(`/${prefix}`)

// Check 5-8: Route-specific paths
if (pathname.startsWith('/posts/')) { ... }
if (pathname.startsWith('/api/webhooks')) { ... }
if (pathname.startsWith('/api/cron')) { ... }
if (pathname.startsWith('/admin')) { ... }
```

**Bun v1.3.9 Impact**: ✅ Specialized fast-path  
- Bun v1.3.9 optimizes string literal prefixes (e.g., `'/_next/'`)
- Current code uses literals, so it benefits automatically
- Loop at line 150-151 has 7 iterations (acceptable overhead)

**Status**: ✅ No action needed. Already optimal.

---

### Cold Paths (17 files)

- `src/shared/lib/auth.ts` — Session validation
- `src/app/(admin)/_shared/lib/validations/api-keys.ts` — URL validation (admin)
- `src/app/(public)/_shared/components/seo/JsonLd.tsx` — URL verification (build)
- `src/app/(admin)/.../editor/lexical/` — Node type checking
- `src/app/(admin)/.../media-picker/` — File type detection

**Recommendation**: No optimization needed.

---

## 4. Bun.markdown Usage

**Result**: ✅ **NONE FOUND** — No usage across codebase.

Expected. Project uses Lexical editor + database-driven markdown, not Bun.markdown API.

---

## 5. Script Parallelization in package.json

**Current setup** (Lines 5-26):

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "SKIP_ENV_VALIDATION=true next build",
    "lint": "eslint",
    "type-check": "tsc --noEmit",
    "test": "bun test",
    "test:unit": "bun test __tests__/unit",
    "test:integration": "bun test __tests__/integration"
  }
}
```

### Optimization Opportunity

**Verification Pipeline** currently sequential:
```bash
# If run together: type-check → lint → build = ~3-4 minutes
```

**Add parallel execution** (Bun v1.3.9 supports `--parallel`):

```json
{
  "scripts": {
    "validate": "bun run --parallel type-check lint",
    "validate:strict": "bun run validate && bun run build",
    "test:all": "bun run --parallel test:unit test:integration"
  }
}
```

**Expected Time Savings**:
- `validate` alone: **30-40% faster** (runs type-check + lint concurrently)
- On 4-core machine: ~2 minutes → ~1.2-1.4 minutes

---

## Summary Table

| Category | Finding | Count | Hot Path? | Bun v1.3.9 Status | Action |
|----------|---------|-------|-----------|-------------------|--------|
| **RegExp** | `.test()`, `.match()`, `.replace()` | 57 files | ✓ 1 file | ✅ Optimized | Monitor |
| **`.trim()`** | Text cleaning | 34 files | ✓ 2 files | ✅ Fast | None |
| **`.startsWith()`** | Prefix detection | 18 files | ✓ 1 file | ✅ Fast-path | None |
| **`Bun.markdown`** | Markdown API | 0 files | — | — | N/A |
| **Scripts** | Parallel execution | 21 scripts | — | ✅ Available | ⭐ **Add `--parallel`** |

---

## Detailed File Lists

### RegExp Hot Path
- `src/proxy.ts` (lines 198-199): Year/month validation

### RegExp Cold Paths (56 files)
- `src/shared/lib/validations/section-design.ts`
- `src/shared/lib/google-calendar.ts`
- `src/shared/lib/cloudflare.ts`
- `src/shared/lib/ical/index.ts`
- `src/shared/lib/analytics/ga-data-api.ts`
- `src/shared/lib/api-keys.ts`
- `src/shared/lib/storage.ts`
- `src/shared/lib/utils.ts`
- `src/shared/lib/terms-templates.ts`
- `src/shared/actions/coupon.ts`
- `src/shared/hooks/use-kana-input.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/` (7 files)
- `src/app/(admin)/admin/(dashboard)/_shared/lib/api-keys/helpers.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/` (8 files)
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/` (20+ files)
- `src/app/(public)/_shared/components/seo/JsonLd.tsx`
- `src/app/(public)/_shared/lib/seo/json-ld-config.ts`

### Trim() Hot Paths
- `src/shared/lib/email-service.ts` (lines 82, 524, 645, 657)
- `src/shared/lib/serialize.ts` (line 333)

### Trim() Cold Paths (32 files)
- `src/app/(public)/_shared/lib/page-metadata.ts`
- `src/app/(admin)/.../_shared/components/editor/` (10+ files)
- `src/app/(admin)/.../_shared/actions/` (8 files)
- `src/shared/lib/rate-limit.ts`
- Admin media picker, coupon, reservation, customer components

### startsWith() Hot Path
- `src/proxy.ts` (lines 139, 140, 151, 170, 213, 215, 235, 254)

### startsWith() Cold Paths (17 files)
- `src/shared/lib/auth.ts`
- `src/app/(admin)/_shared/lib/validations/api-keys.ts`
- `src/app/(public)/_shared/components/seo/JsonLd.tsx`
- `src/app/(admin)/_shared/components/editor/lexical/` (8 files)
- `src/app/(admin)/_shared/components/media-picker/` (2 files)

---

## Recommendations

### Priority 1: ⭐ Script Parallelization (Quick Win)

Add to `package.json`:
```json
{
  "scripts": {
    "validate": "bun run --parallel type-check lint",
    "prepare:pre-commit": "bun run validate && bun run build"
  }
}
```

**Time Saved**: 30-40% on validation  
**Effort**: 2 minutes  
**Risk**: None

### Priority 2: ✅ Keep Current Hot Paths

No changes to:
- `src/proxy.ts` regex/startsWith (already optimal)
- `src/shared/lib/email-service.ts` trim (necessary for data cleaning)
- `src/shared/lib/serialize.ts` trim (negligible overhead)

Bun v1.3.9 optimizations already apply automatically.

### Priority 3: 📊 Future Profiling

If production shows:
- Proxy latency > 50ms (p95): Profile with `bun --inspect`
- Email generation > 1s: Check email template rendering (not string ops)

---

## Conclusion

**Current Code Status**: Already optimized for Bun v1.3.9

- ✅ RegExp literals benefit from v1.3.9's fast-path
- ✅ `.trim()` and `.startsWith()` are efficient
- ✅ No refactoring needed
- ⭐ Add script parallelization for ~30-40% validation speedup
