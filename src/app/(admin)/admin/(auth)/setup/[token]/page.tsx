/**
 * スタッフパスワード設定ページ
 *
 * 招待メールのリンクからアクセスし、パスワードを設定
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { validateInvitationToken } from "@/admin/actions/staff-invitation";
import { isActionFailure } from "@/admin/types/server-actions";
import { SetupForm } from "./_components/SetupForm";

export const metadata: Metadata = {
  title: "パスワード設定",
};

type Props = {
  params: Promise<{ token: string }>;
};

export default async function SetupPage({
  params,
}: Props): Promise<ReactElement> {
  const { token } = await params;

  // トークン検証
  const result = await validateInvitationToken(token);

  if (isActionFailure(result)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-lg shadow-lg p-8">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-destructive/10 mb-4">
                <svg
                  className="h-6 w-6 text-destructive"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-foreground mb-2">
                招待リンクが無効です
              </h1>
              <p className="text-muted-foreground mb-6">{result.error}</p>
              <p className="text-sm text-muted-foreground">
                管理者に連絡して、新しい招待を依頼してください。
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground">
              パスワード設定
            </h1>
            <p className="text-muted-foreground mt-2">
              アカウントのパスワードを設定してください
            </p>
          </div>
          <SetupForm invitation={result.data} token={token} />
        </div>
      </div>
    </div>
  );
}
