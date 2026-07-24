/**
 * お問い合わせ添付ダウンロード API（管理画面）
 *
 * private R2 bucket から server 経由でストリーミング配信する。公開 URL は
 * 存在しない（`buildPublicUrl` は一切呼ばない、architecture-boundaries.test.ts
 * で 0 件強制）。認可は `checkPermission("inquiry","read")` のみ — admin は
 * 全件アクセス可（customer 側 route のような所有権チェックは行わない）。
 */

import { unstable_rethrow } from "next/navigation";
import { checkPermission } from "@/admin/lib/action-auth";
import { getInquiryAttachmentForDownload } from "@/shared/domain/inquiries/queries";
import {
  buildAttachmentContentDisposition,
  getObjectStream,
} from "@/shared/lib/r2/download";
import { getR2InquiriesBucketName } from "@/shared/lib/r2/client";
import { getRouteErrorStatus } from "@/shared/lib/route-responses";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  try {
    const auth = await checkPermission("inquiry", "read", request.headers);
    if (!auth.success) {
      return new Response(auth.error.error, {
        status: getRouteErrorStatus(auth.error.error),
      });
    }

    const attachment = await getInquiryAttachmentForDownload(id);
    if (!attachment) {
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
      context: { operation: "adminInquiryAttachmentDownload", id },
    });
    return new Response("Internal server error", { status: 500 });
  }
}
