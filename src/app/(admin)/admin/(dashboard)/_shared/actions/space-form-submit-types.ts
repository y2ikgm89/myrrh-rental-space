/**
 * スペース作成・更新フォーム Server Action の共有型・定数
 *
 * `"use server"` ファイルは async 関数のみを export 可能という Next.js 仕様に従い、
 * 型と定数はこの非 server-action ファイルに分離する。
 */

export type SpaceFormActionState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      clientNonce: number;
      fieldErrors?: Record<string, string[]>;
    }
  | {
      status: "success";
      message: string;
      clientNonce: number;
      /** 作成直後の詳細ページへ遷移するために返す */
      createdId?: string;
    };

export const SPACE_FORM_ACTION_INITIAL_STATE: SpaceFormActionState = {
  status: "idle",
};
