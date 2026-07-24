/**
 * お問い合わせ添付ダウンロード API（マイページ）
 *
 * Better Auth session + inquiry.customerId 所有権チェック（`receipts/[serialNo]/pdf`
 * route と同型）。private R2 bucket から server 経由でストリーミング配信し、
 * 公開 URL は一切発行しない（`buildPublicUrl` 0 件、architecture-boundaries.test.ts
 * で強制）。存在しない / 未所有 / 未認証はいずれも 404 で存在自体を隠蔽する。
 */

import { unstable_rethrow } from "next/navigation";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { getInquiryAttachmentForDownload } from "@/shared/domain/inquiries/queries";
import { DomainError } from "@/shared/domain/domain-error";
import {
  buildAttachmentContentDisposition,
  getObjectStream,
} from "@/shared/lib/r2/download";
import { getR2InquiriesBucketName } from "@/shared/lib/r2/client";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  try {
    const session = await getCustomerSession();
    if (!session) {
      return new Response("Not found", { status: 404 });
    }

    const attachment = await getInquiryAttachmentForDownload(id);
    if (!attachment) {
      return new Response("Not found", { status: 404 });
    }

    const customer = await getCustomerByUserId(session.user.id);
    if (
      !customer ||
      attachment.customerId === null ||
      attachment.customerId !== customer.id
    ) {
      return new Response("Not found", { status: 404 });
    }

    try {
      await assertCustomerActive(customer.id);
    } catch (error) {
      if (error instanceof DomainError && error.code === "FORBIDDEN") {
        return new Response("Forbidden", { status: 403 });
      }
      if (!(error instanceof DomainError)) {
        throw error;
      }
      return new Response("Not found", { status: 404 });
    }

    const stream = await getObjectStream(
      getR2InquiriesBucketName(),
      attachment.r2Key,
    );
    if (!stream.success) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(stream.body, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": buildAttachmentContentDisposition(
          attachment.filename,
        ),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error: unknown) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "mypageInquiryAttachmentDownload", id },
    });
    return new Response("Internal server error", { status: 500 });
  }
}
