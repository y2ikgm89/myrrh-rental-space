# Terms audit hardening (clean-break)

Date: 2026-07-25  
Branch: `fix/terms-audit-hardening-clean-break`

## Goal

Close consent / evidence / admin-editor holes found in the terms audit with
official-docs-aligned, clean-break changes. No compatibility shims.

## Decisions

1. **Last published scope guard** — `updateTermsPublishedCommand(false)` and
   `softDeleteTermsCommand` throw `DomainError` when the document is the last
   published, non-deleted document for any of its scopes. To intentionally
   disable a scope, remove that scope from the document first, then unpublish
   or delete.
2. **Publish requires non-empty Lexical body** — publishing (`isPublished:
true` via create/update/publish toggle) rejects empty Lexical content.
3. **Record fail-closed** — `recordTermsAgreements` /
   `recordTermsAgreementsCommand` require `scopes: { has: input.scope }`, and
   throw if any requested id is missing / unpublished / wrong scope (no silent
   skip).
4. **Signup gate** — `setSignupTermsAgreementCookie` and
   `consumeSignupTermsAction` call `assertAllRequiredTermsAgreed({ scope:
LOGIN_SIGNUP })`.
5. **Idempotency ALL-match** — `hasTermsAgreementRecorded` is true only when
   every requested `termsId` has a row.
6. **Inquiry / event / waitlist atomic evidence** — create resource + record
   agreements in the same Prisma transaction (reservation/series pattern).
7. **Reagree on claim + review** — `assertLoginSignupReagreed` on claim
   actions and `submitReview`.
8. **Editor SSoT** — `buildUpdateInput` uses `isPublishedValue` /
   `showInFooterValue`. `handlePublish` saves body+settings first (or single
   `updateTerms` with publish), then refreshes snapshot.
9. **Trash edit** — `deletedAt != null` → `notFound()` on edit page.
10. **returnTo** — reject `..` path segments after normalize.
11. **CDN** — terms invalidation also purges `CDN_CACHE_TAGS.TERMS_FOOTER`
    (or layout co-tag) so footer links are not stale.
12. **Export** — surface truncation (`X-Truncated` / audit metadata) when hit
    at 10_000 rows.

## Non-goals

- Production deploy
- Changing TermsAgreement append-only contract
- Redis / paid infra
