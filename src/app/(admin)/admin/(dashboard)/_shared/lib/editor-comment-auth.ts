import "server-only";

import type { AdminAuthUser } from "@/shared/domain/admin-auth/session";
import {
  getEditorCommentContentRefFromCommentId,
  getEditorCommentThreadContentRef,
} from "@/shared/domain/editor-comments/queries";
import type { CommentableContentType } from "@/shared/domain/editor-comments/types";
import { isDomainError } from "@/shared/domain/domain-error";
import {
  authorizeResourceAccess,
  checkAdminAuth,
  logAction,
} from "@/admin/lib/action-auth";
import { fireAndForget } from "@/shared/lib/async-utils";
import { withPurgeBatch } from "@/shared/lib/cache/batcher";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/server";
import type { MutationResult } from "@/shared/lib/mutation-result";
import type { Action, Resource } from "@/shared/lib/admin-resources";

/** Commentable CMS entity → admin RBAC resource（EDITOR の page assignment 等と整合）。 */
export function commentableContentTypeToResource(
  contentType: CommentableContentType,
): Resource {
  switch (contentType) {
    case "post":
      return "post";
    case "news":
      return "news";
    case "page":
      return "page";
    case "faq":
      return "faq";
    default: {
      const _exhaustive: never = contentType;
      throw new Error(`Unhandled contentType: ${String(_exhaustive)}`);
    }
  }
}

/**
 * 認証済み user に対して commentable コンテンツへの認可を行う。
 *
 * contentRef を DB から解決しないと resource が決まらない経路（thread / comment）は、
 * 先に `checkAdminAuth()` を通してからこちらを呼ぶ（監査 A-57）。
 */
export async function authorizeEditorCommentContentAccess(
  user: AdminAuthUser,
  contentType: CommentableContentType,
  contentId: string,
  action: Action,
) {
  const resource = commentableContentTypeToResource(contentType);
  return authorizeResourceAccess(user, resource, action, contentId);
}

/** contentType / contentId が呼出前に確定している経路用（認証 → 認可）。 */
export async function checkEditorCommentContentAccess(
  contentType: CommentableContentType,
  contentId: string,
  action: Action,
  requestHeaders?: Headers,
) {
  const auth = await checkAdminAuth(requestHeaders);
  if (!auth.success) return auth;

  return authorizeEditorCommentContentAccess(
    auth.user,
    contentType,
    contentId,
    action,
  );
}

type EditorCommentContentRef =
  | {
      kind: "content";
      contentType: CommentableContentType;
      contentId: string;
    }
  | { kind: "thread"; threadId: string }
  | { kind: "comment"; commentId: string };

async function resolveEditorCommentAuthTarget(
  contentRef: EditorCommentContentRef,
): Promise<
  { resource: Resource; resourceId: string } | { error: MutationResult<never> }
> {
  if (contentRef.kind === "content") {
    return {
      resource: commentableContentTypeToResource(contentRef.contentType),
      resourceId: contentRef.contentId,
    };
  }

  const ref =
    contentRef.kind === "thread"
      ? await getEditorCommentThreadContentRef(contentRef.threadId)
      : await getEditorCommentContentRefFromCommentId(contentRef.commentId);

  if (!ref) {
    return {
      error: {
        error: "コメントスレッドが見つかりません",
        code: "NOT_FOUND",
      },
    };
  }

  return {
    resource: commentableContentTypeToResource(ref.contentType),
    resourceId: ref.contentId,
  };
}

/** editor-comment Server Action 用: contentType / threadId から RBAC resource を解決して実行。 */
export async function executeEditorCommentMutationResult<TData>(options: {
  action: Action;
  contentRef: EditorCommentContentRef;
  execute: (user: AdminAuthUser) => Promise<TData>;
  resolveAuditResourceId?: (data: TData) => string | undefined;
}): Promise<MutationResult<TData>> {
  // `admin-action.ts` の実行順序契約（不変）と同じ: 1. 認証 → 2. 解決 → 3. 認可。
  //
  // 旧実装は 2 を先頭に置いていたため、**未認証の相手のために**
  // `getEditorCommentThreadContentRef` の Prisma クエリを実行し、さらに戻り値が
  // NOT_FOUND / 認証エラー で分かれて threadId の存否が認証前に見えていた（監査 A-57）。
  // Server Action はページ path への POST なので proxy の rate limit 対象外でもある。
  const authResult = await checkAdminAuth();
  if (!authResult.success) {
    return { error: authResult.error.error };
  }

  const target = await resolveEditorCommentAuthTarget(options.contentRef);
  if ("error" in target) {
    return target.error;
  }

  const auth = await authorizeResourceAccess(
    authResult.user,
    target.resource,
    options.action,
    target.resourceId,
  );
  if (!auth.success) {
    return {
      error: auth.error.error,
      ...(auth.error.code ? { code: auth.error.code } : {}),
    };
  }

  const { user } = auth;

  return withPurgeBatch(async () => {
    try {
      const data = await options.execute(user);
      fireAndForget(
        logAction(
          user.id,
          options.action,
          target.resource,
          options.resolveAuditResourceId?.(data) ?? target.resourceId,
        ),
        {
          operation: "executeEditorCommentMutationResult.logAction",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
          context: {
            resource: target.resource,
            action: options.action,
            userId: user.id,
          },
        },
      );
      return data;
    } catch (error) {
      if (isDomainError(error)) {
        return {
          error: error.message,
          code: error.code,
        };
      }
      throw error;
    }
  });
}
