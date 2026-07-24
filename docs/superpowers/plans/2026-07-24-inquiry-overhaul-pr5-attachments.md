# Inquiry Overhaul PR5 — Private Attachments

> **For agentic workers:** Use subagent-driven-development.

**Goal:** Inquiry attachments on private R2 + authenticated download; never public Media CDN.

**Depends on:** PR4 optional (can parallel after PR3); schema InquiryAttachment already exists.

**Spec:** §5.2 §6.4

## Scope

1. Terraform: `cloudflare_r2_bucket.myrrh_rental_space_inquiries` (no public domain)
2. Env: `R2_INQUIRIES_BUCKET_NAME` (+ update `.env.example`, server env schema, Cloud Run tf if needed)
3. `STORAGE_PREFIXES.INQUIRIES`; `getObjectStream` in `src/shared/lib/r2/download.ts`
4. Domain: `uploadInquiryAttachmentCommand` / `deleteInquiryAttachmentCommand`
5. Routes: admin `/admin/api/inquiries/attachments/[id]`, customer `/api/mypage/inquiries/attachments/[id]`
6. UI: admin detail upload/list; mypage list+download for own inquiry
7. MIME: JPEG/PNG/WebP/PDF only; image 5MB / PDF 10MB; magic-byte
8. Architecture test: `buildPublicUrl` + inquiries = 0
9. Retention: purgeExpiredInquiries deletes R2 objects before DB cascade

## Stop note

New env var — already approved in design. Document in PR body.

## Soft limit

Split: PR5a infra+lib, PR5b domain+UI if needed.
