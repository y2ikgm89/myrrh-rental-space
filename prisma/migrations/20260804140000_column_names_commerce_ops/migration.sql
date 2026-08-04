-- squawk-ignore-file renaming-column
--
-- 会計証跡・監査ログ・規約・問い合わせまわりの物理列名を snake_case へ寄せる。
--
-- 免除の根拠・自動生成を使わない理由は 20260804110000（認証と顧客）と同じ。
--
-- append-only の 4 表（audit_logs / terms_agreements / refunds /
-- inquiry_status_history）を含むが、**RENAME COLUMN は行を書き換えないので
-- append-only trigger は発火しない**（trigger は INSERT / UPDATE / DELETE 行イベント）。
-- bypass GUC は要らない。
--
-- `prevent_refunds_mutation` だけは本体がテキストなので作り直す。実 DB の現在の
-- 定義から採っており、bypass GUC 名（myrrh.refund_mutation_bypass）は不変。

BEGIN;

-- 1. 列
ALTER TABLE receipts RENAME COLUMN "serialNo" TO serial_no;
ALTER TABLE receipts RENAME COLUMN "issuedAt" TO issued_at;
ALTER TABLE receipts RENAME COLUMN "reservationId" TO reservation_id;
ALTER TABLE receipts RENAME COLUMN "eventRegistrationId" TO event_registration_id;
ALTER TABLE receipts RENAME COLUMN "recipientName" TO recipient_name;
ALTER TABLE receipts RENAME COLUMN "taxAmount" TO tax_amount;
ALTER TABLE receipts RENAME COLUMN "taxRate" TO tax_rate;
ALTER TABLE receipts RENAME COLUMN "issuerSnapshot" TO issuer_snapshot;
ALTER TABLE receipts RENAME COLUMN "reissuedFromId" TO reissued_from_id;
ALTER TABLE receipts RENAME COLUMN "reissuedReason" TO reissued_reason;
ALTER TABLE receipts RENAME COLUMN "usedAt" TO used_at;
ALTER TABLE receipts RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE receipts RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE receipt_sequences RENAME COLUMN "nextNo" TO next_no;
ALTER TABLE receipt_sequences RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE refunds RENAME COLUMN "reservationId" TO reservation_id;
ALTER TABLE refunds RENAME COLUMN "eventRegistrationId" TO event_registration_id;
ALTER TABLE refunds RENAME COLUMN "stripeRefundId" TO stripe_refund_id;
ALTER TABLE refunds RENAME COLUMN "refundedByType" TO refunded_by_type;
ALTER TABLE refunds RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE stripe_events RENAME COLUMN "receivedAt" TO received_at;
ALTER TABLE stripe_events RENAME COLUMN "processedAt" TO processed_at;
ALTER TABLE transfer_accounts RENAME COLUMN "bankName" TO bank_name;
ALTER TABLE transfer_accounts RENAME COLUMN "branchName" TO branch_name;
ALTER TABLE transfer_accounts RENAME COLUMN "accountType" TO account_type;
ALTER TABLE transfer_accounts RENAME COLUMN "accountNumber" TO account_number;
ALTER TABLE transfer_accounts RENAME COLUMN "accountHolderName" TO account_holder_name;
ALTER TABLE transfer_accounts RENAME COLUMN "sortOrder" TO sort_order;
ALTER TABLE transfer_accounts RENAME COLUMN "isActive" TO is_active;
ALTER TABLE transfer_accounts RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE transfer_accounts RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE audit_logs RENAME COLUMN "previousHash" TO previous_hash;
ALTER TABLE audit_logs RENAME COLUMN "entryHash" TO entry_hash;
ALTER TABLE audit_logs RENAME COLUMN "hashAlgorithm" TO hash_algorithm;
ALTER TABLE audit_logs RENAME COLUMN "hashKeyId" TO hash_key_id;
ALTER TABLE audit_logs RENAME COLUMN "chainVersion" TO chain_version;
ALTER TABLE audit_logs RENAME COLUMN "userId" TO user_id;
ALTER TABLE audit_logs RENAME COLUMN "resourceId" TO resource_id;
ALTER TABLE audit_logs RENAME COLUMN "oldValue" TO old_value;
ALTER TABLE audit_logs RENAME COLUMN "newValue" TO new_value;
ALTER TABLE audit_logs RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE admin_notifications RENAME COLUMN "resourceType" TO resource_type;
ALTER TABLE admin_notifications RENAME COLUMN "resourceId" TO resource_id;
ALTER TABLE admin_notifications RENAME COLUMN "isRead" TO is_read;
ALTER TABLE admin_notifications RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE terms_documents RENAME COLUMN "contentJson" TO content_json;
ALTER TABLE terms_documents RENAME COLUMN "contentHtml" TO content_html;
ALTER TABLE terms_documents RENAME COLUMN "isPublished" TO is_published;
ALTER TABLE terms_documents RENAME COLUMN "publishedAt" TO published_at;
ALTER TABLE terms_documents RENAME COLUMN "showInFooter" TO show_in_footer;
ALTER TABLE terms_documents RENAME COLUMN "displayOrder" TO display_order;
ALTER TABLE terms_documents RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE terms_documents RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE terms_documents RENAME COLUMN "deletedAt" TO deleted_at;
ALTER TABLE terms_agreements RENAME COLUMN "termsId" TO terms_id;
ALTER TABLE terms_agreements RENAME COLUMN "customerId" TO customer_id;
ALTER TABLE terms_agreements RENAME COLUMN "guestEmail" TO guest_email;
ALTER TABLE terms_agreements RENAME COLUMN "contentSnapshot" TO content_snapshot;
ALTER TABLE terms_agreements RENAME COLUMN "contentHash" TO content_hash;
ALTER TABLE terms_agreements RENAME COLUMN "agreedAt" TO agreed_at;
ALTER TABLE terms_agreements RENAME COLUMN "resourceId" TO resource_id;
ALTER TABLE terms_agreements RENAME COLUMN "ipAddress" TO ip_address;
ALTER TABLE terms_agreements RENAME COLUMN "userAgent" TO user_agent;
ALTER TABLE inquiries RENAME COLUMN "receiptNumber" TO receipt_number;
ALTER TABLE inquiries RENAME COLUMN "companyName" TO company_name;
ALTER TABLE inquiries RENAME COLUMN "customerType" TO customer_type;
ALTER TABLE inquiries RENAME COLUMN "phoneNumber" TO phone_number;
ALTER TABLE inquiries RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE inquiries RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE inquiries RENAME COLUMN "assigneeId" TO assignee_id;
ALTER TABLE inquiries RENAME COLUMN "slaExpiresAt" TO sla_expires_at;
ALTER TABLE inquiries RENAME COLUMN "deletedAt" TO deleted_at;
ALTER TABLE inquiries RENAME COLUMN "anonymizedAt" TO anonymized_at;
ALTER TABLE inquiries RENAME COLUMN "anonymizedReason" TO anonymized_reason;
ALTER TABLE inquiries RENAME COLUMN "customerId" TO customer_id;
ALTER TABLE inquiry_replies RENAME COLUMN "inquiryId" TO inquiry_id;
ALTER TABLE inquiry_replies RENAME COLUMN "authorType" TO author_type;
ALTER TABLE inquiry_replies RENAME COLUMN "authorId" TO author_id;
ALTER TABLE inquiry_replies RENAME COLUMN "authorCustomerId" TO author_customer_id;
ALTER TABLE inquiry_replies RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE inquiry_replies RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE inquiry_attachments RENAME COLUMN "inquiryId" TO inquiry_id;
ALTER TABLE inquiry_attachments RENAME COLUMN "replyId" TO reply_id;
ALTER TABLE inquiry_attachments RENAME COLUMN "r2Key" TO r2_key;
ALTER TABLE inquiry_attachments RENAME COLUMN "mimeType" TO mime_type;
ALTER TABLE inquiry_attachments RENAME COLUMN "sizeBytes" TO size_bytes;
ALTER TABLE inquiry_attachments RENAME COLUMN "uploadedById" TO uploaded_by_id;
ALTER TABLE inquiry_attachments RENAME COLUMN "uploadedByCustomerId" TO uploaded_by_customer_id;
ALTER TABLE inquiry_attachments RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE inquiry_internal_notes RENAME COLUMN "inquiryId" TO inquiry_id;
ALTER TABLE inquiry_internal_notes RENAME COLUMN "authorId" TO author_id;
ALTER TABLE inquiry_internal_notes RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE inquiry_internal_notes RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE inquiry_status_history RENAME COLUMN "inquiryId" TO inquiry_id;
ALTER TABLE inquiry_status_history RENAME COLUMN "fromStatus" TO from_status;
ALTER TABLE inquiry_status_history RENAME COLUMN "toStatus" TO to_status;
ALTER TABLE inquiry_status_history RENAME COLUMN "changedById" TO changed_by_id;
ALTER TABLE inquiry_status_history RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE inquiry_tags RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE inquiry_tags RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE inquiry_tag_on_inquiries RENAME COLUMN "inquiryId" TO inquiry_id;
ALTER TABLE inquiry_tag_on_inquiries RENAME COLUMN "tagId" TO tag_id;
ALTER TABLE inquiry_tag_on_inquiries RENAME COLUMN "createdAt" TO created_at;

-- 2. Prisma 管理オブジェクト（FK / index）
ALTER TABLE "inquiries" RENAME CONSTRAINT "inquiries_assigneeId_fkey" TO "inquiries_assignee_id_fkey";
ALTER TABLE "inquiries" RENAME CONSTRAINT "inquiries_customerId_fkey" TO "inquiries_customer_id_fkey";
ALTER TABLE "inquiry_attachments" RENAME CONSTRAINT "inquiry_attachments_inquiryId_fkey" TO "inquiry_attachments_inquiry_id_fkey";
ALTER TABLE "inquiry_attachments" RENAME CONSTRAINT "inquiry_attachments_replyId_fkey" TO "inquiry_attachments_reply_id_fkey";
ALTER TABLE "inquiry_attachments" RENAME CONSTRAINT "inquiry_attachments_uploadedByCustomerId_fkey" TO "inquiry_attachments_uploaded_by_customer_id_fkey";
ALTER TABLE "inquiry_attachments" RENAME CONSTRAINT "inquiry_attachments_uploadedById_fkey" TO "inquiry_attachments_uploaded_by_id_fkey";
ALTER TABLE "inquiry_internal_notes" RENAME CONSTRAINT "inquiry_internal_notes_authorId_fkey" TO "inquiry_internal_notes_author_id_fkey";
ALTER TABLE "inquiry_internal_notes" RENAME CONSTRAINT "inquiry_internal_notes_inquiryId_fkey" TO "inquiry_internal_notes_inquiry_id_fkey";
ALTER TABLE "inquiry_replies" RENAME CONSTRAINT "inquiry_replies_authorCustomerId_fkey" TO "inquiry_replies_author_customer_id_fkey";
ALTER TABLE "inquiry_replies" RENAME CONSTRAINT "inquiry_replies_authorId_fkey" TO "inquiry_replies_author_id_fkey";
ALTER TABLE "inquiry_replies" RENAME CONSTRAINT "inquiry_replies_inquiryId_fkey" TO "inquiry_replies_inquiry_id_fkey";
ALTER TABLE "inquiry_status_history" RENAME CONSTRAINT "inquiry_status_history_inquiryId_fkey" TO "inquiry_status_history_inquiry_id_fkey";
ALTER TABLE "inquiry_tag_on_inquiries" RENAME CONSTRAINT "inquiry_tag_on_inquiries_inquiryId_fkey" TO "inquiry_tag_on_inquiries_inquiry_id_fkey";
ALTER TABLE "inquiry_tag_on_inquiries" RENAME CONSTRAINT "inquiry_tag_on_inquiries_tagId_fkey" TO "inquiry_tag_on_inquiries_tag_id_fkey";
ALTER TABLE "receipts" RENAME CONSTRAINT "receipts_eventRegistrationId_fkey" TO "receipts_event_registration_id_fkey";
ALTER TABLE "receipts" RENAME CONSTRAINT "receipts_reissuedFromId_fkey" TO "receipts_reissued_from_id_fkey";
ALTER TABLE "receipts" RENAME CONSTRAINT "receipts_reservationId_fkey" TO "receipts_reservation_id_fkey";
ALTER TABLE "refunds" RENAME CONSTRAINT "refunds_eventRegistrationId_fkey" TO "refunds_event_registration_id_fkey";
ALTER TABLE "refunds" RENAME CONSTRAINT "refunds_reservationId_fkey" TO "refunds_reservation_id_fkey";
ALTER TABLE "terms_agreements" RENAME CONSTRAINT "terms_agreements_termsId_fkey" TO "terms_agreements_terms_id_fkey";
ALTER INDEX "admin_notifications_createdAt_idx" RENAME TO "admin_notifications_created_at_idx";
ALTER INDEX "admin_notifications_isRead_createdAt_idx" RENAME TO "admin_notifications_is_read_created_at_idx";
ALTER INDEX "audit_logs_createdAt_idx" RENAME TO "audit_logs_created_at_idx";
ALTER INDEX "audit_logs_hashKeyId_sequence_idx" RENAME TO "audit_logs_hash_key_id_sequence_idx";
ALTER INDEX "audit_logs_resource_resourceId_idx" RENAME TO "audit_logs_resource_resource_id_idx";
ALTER INDEX "audit_logs_userId_createdAt_idx" RENAME TO "audit_logs_user_id_created_at_idx";
ALTER INDEX "inquiries_anonymizedAt_idx" RENAME TO "inquiries_anonymized_at_idx";
ALTER INDEX "inquiries_assigneeId_idx" RENAME TO "inquiries_assignee_id_idx";
ALTER INDEX "inquiries_createdAt_status_idx" RENAME TO "inquiries_created_at_status_idx";
ALTER INDEX "inquiries_customerId_createdAt_idx" RENAME TO "inquiries_customer_id_created_at_idx";
ALTER INDEX "inquiries_customerId_status_idx" RENAME TO "inquiries_customer_id_status_idx";
ALTER INDEX "inquiries_deletedAt_idx" RENAME TO "inquiries_deleted_at_idx";
ALTER INDEX "inquiries_receiptNumber_key" RENAME TO "inquiries_receipt_number_key";
ALTER INDEX "inquiries_slaExpiresAt_idx" RENAME TO "inquiries_sla_expires_at_idx";
ALTER INDEX "inquiry_attachments_inquiryId_createdAt_idx" RENAME TO "inquiry_attachments_inquiry_id_created_at_idx";
ALTER INDEX "inquiry_attachments_r2Key_key" RENAME TO "inquiry_attachments_r2_key_key";
ALTER INDEX "inquiry_attachments_replyId_idx" RENAME TO "inquiry_attachments_reply_id_idx";
ALTER INDEX "inquiry_internal_notes_authorId_idx" RENAME TO "inquiry_internal_notes_author_id_idx";
ALTER INDEX "inquiry_internal_notes_inquiryId_createdAt_idx" RENAME TO "inquiry_internal_notes_inquiry_id_created_at_idx";
ALTER INDEX "inquiry_replies_authorCustomerId_idx" RENAME TO "inquiry_replies_author_customer_id_idx";
ALTER INDEX "inquiry_replies_authorId_idx" RENAME TO "inquiry_replies_author_id_idx";
ALTER INDEX "inquiry_replies_inquiryId_createdAt_idx" RENAME TO "inquiry_replies_inquiry_id_created_at_idx";
ALTER INDEX "inquiry_status_history_inquiryId_createdAt_idx" RENAME TO "inquiry_status_history_inquiry_id_created_at_idx";
ALTER INDEX "inquiry_tag_on_inquiries_tagId_idx" RENAME TO "inquiry_tag_on_inquiries_tag_id_idx";
ALTER INDEX "receipts_eventRegistrationId_key" RENAME TO "receipts_event_registration_id_key";
ALTER INDEX "receipts_issuedAt_idx" RENAME TO "receipts_issued_at_idx";
ALTER INDEX "receipts_reservationId_key" RENAME TO "receipts_reservation_id_key";
ALTER INDEX "receipts_serialNo_key" RENAME TO "receipts_serial_no_key";
ALTER INDEX "refunds_createdAt_idx" RENAME TO "refunds_created_at_idx";
ALTER INDEX "refunds_eventRegistrationId_idx" RENAME TO "refunds_event_registration_id_idx";
ALTER INDEX "refunds_reservationId_idx" RENAME TO "refunds_reservation_id_idx";
ALTER INDEX "refunds_stripeRefundId_key" RENAME TO "refunds_stripe_refund_id_key";
ALTER INDEX "stripe_events_receivedAt_idx" RENAME TO "stripe_events_received_at_idx";
ALTER INDEX "terms_agreements_agreedAt_idx" RENAME TO "terms_agreements_agreed_at_idx";
ALTER INDEX "terms_agreements_customerId_idx" RENAME TO "terms_agreements_customer_id_idx";
ALTER INDEX "terms_agreements_resourceId_idx" RENAME TO "terms_agreements_resource_id_idx";
ALTER INDEX "terms_agreements_scope_agreedAt_idx" RENAME TO "terms_agreements_scope_agreed_at_idx";
ALTER INDEX "terms_agreements_termsId_idx" RENAME TO "terms_agreements_terms_id_idx";
ALTER INDEX "terms_documents_deletedAt_isPublished_idx" RENAME TO "terms_documents_deleted_at_is_published_idx";
ALTER INDEX "terms_documents_showInFooter_isPublished_displayOrder_idx" RENAME TO "terms_documents_show_in_footer_is_published_display_order_idx";
ALTER INDEX "transfer_accounts_isActive_sortOrder_idx" RENAME TO "transfer_accounts_is_active_sort_order_idx";

-- 3. 手書き CHECK の名前
ALTER TABLE refunds RENAME CONSTRAINT "refunds_refundedByType_check" TO "refunds_refunded_by_type_check";

-- 4. plpgsql 関数の作り直し（本体はテキストなので rename が届かない）

CREATE OR REPLACE FUNCTION public.prevent_refunds_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('myrrh.refund_mutation_bypass', true) = 'seed' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.id = OLD.id
     AND NEW.reservation_id IS NOT DISTINCT FROM OLD.reservation_id
     AND NEW.event_registration_id IS NOT DISTINCT FROM OLD.event_registration_id
     AND NEW.amount = OLD.amount
     AND NEW.reason IS NOT DISTINCT FROM OLD.reason
     AND NEW.stripe_refund_id = OLD.stripe_refund_id
     AND NEW.refunded_by_type = OLD.refunded_by_type
     AND NEW.created_at = OLD.created_at
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'refunds is append-only (status is the only mutable column); % is not allowed', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$
;

COMMIT;
