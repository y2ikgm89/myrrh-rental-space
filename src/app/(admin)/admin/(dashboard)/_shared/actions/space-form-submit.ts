"use server";

/**
 * スペース作成・更新フォーム用 Server Action（React 19 `useActionState` + FormData）
 *
 * 認可は `createSpace` / `updateSpace` 内の `executeAdminMutationResult`（`checkPermission`）に委譲。
 * `__spaceId` はクライアント送信値のため改ざん可能だが、既存の「クライアントが ID を渡す」モデルと同じ。
 * EDITOR のリソーススコープは `userHasResourceAccess` が **ページ割当 ID** 前提のため、スペース単位の `checkResourceAccess` は未適用（専用の割当モデルが必要）。
 *
 * @see https://react.dev/reference/react/useActionState
 */

import { extractFieldErrors } from "@/shared/lib/action-helpers";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  parseSpaceFormFromFormData,
  readSpaceFormActionMeta,
} from "@/admin/lib/space-form-data-codec";
import { createSpace, updateSpace } from "./space";
import type { SpaceFormActionState } from "./space-form-submit-types";

export async function submitSpaceFormAction(
  _prev: SpaceFormActionState,
  formData: FormData,
): Promise<SpaceFormActionState> {
  const meta = readSpaceFormActionMeta(formData);

  if (meta.intent === null) {
    return {
      status: "error",
      message: "無効な操作です",
      clientNonce: meta.clientNonce,
    };
  }

  const parsed = parseSpaceFormFromFormData(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "入力内容に誤りがあります",
      clientNonce: meta.clientNonce,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  if (meta.intent === "create") {
    const result = await createSpace(parsed.data);
    if (isMutationError(result)) {
      return {
        status: "error",
        message: result.error,
        clientNonce: meta.clientNonce,
        ...(result.fieldErrors !== undefined
          ? { fieldErrors: result.fieldErrors }
          : {}),
      };
    }
    return {
      status: "success",
      message: "スペースを作成しました",
      clientNonce: meta.clientNonce,
      createdId: result.id,
    };
  }

  if (meta.spaceId === null || meta.spaceId === "") {
    return {
      status: "error",
      message: "スペースIDがありません",
      clientNonce: meta.clientNonce,
    };
  }

  const result = await updateSpace(meta.spaceId, parsed.data);
  if (isMutationError(result)) {
    return {
      status: "error",
      message: result.error,
      clientNonce: meta.clientNonce,
      ...(result.fieldErrors !== undefined
        ? { fieldErrors: result.fieldErrors }
        : {}),
    };
  }

  return {
    status: "success",
    message: "スペースを保存しました",
    clientNonce: meta.clientNonce,
  };
}
