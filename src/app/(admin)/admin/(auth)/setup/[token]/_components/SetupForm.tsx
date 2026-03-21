"use client";

/**
 * パスワード設定フォーム
 *
 * スタッフ招待メールからアクセスし、パスワードを設定
 */

import { useState, type FormEvent, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { setupPassword } from "@/admin/actions/staff-invitation";
import { signIn } from "@/shared/lib/auth-client";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { InvitationData } from "@/shared/domain/staff-invitations/types";
import { SubmitButton } from "@/admin/components/ui";

type Props = {
  invitation: InvitationData;
  token: string;
};

export function SetupForm({ invitation, token }: Props): ReactElement {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("パスワードは8文字以上で入力してください");
      return;
    }

    if (password !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }

    setIsLoading(true);

    try {
      const result = await setupPassword({
        token,
        password,
        confirmPassword,
      });

      if (isMutationError(result)) {
        setError(result.error);
        setIsLoading(false);
        return;
      }

      // ユーザー作成成功 → 自動ログイン
      const signInResult = await signIn.email({
        email: invitation.email,
        password,
      });

      if (signInResult.error) {
        // ログイン失敗でもユーザーは作成済み → ログインページへ
        router.push("/admin/login");
      } else {
        // ログイン成功 → ダッシュボードへ
        router.push("/admin");
        router.refresh();
      }
    } catch {
      setError("エラーが発生しました。再度お試しください。");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-destructive/10 border border-destructive/50 text-destructive px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <div className="bg-muted/50 rounded-lg p-4">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">メールアドレス</dt>
            <dd className="text-foreground font-medium">{invitation.email}</dd>
          </div>
          {invitation.name && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">お名前</dt>
              <dd className="text-foreground font-medium">{invitation.name}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">権限</dt>
            <dd className="text-foreground font-medium">
              {invitation.role === "SUPER_ADMIN" && "スーパー管理者"}
              {invitation.role === "ADMIN" && "管理者"}
              {invitation.role === "EDITOR" && "編集者"}
              {invitation.role === "VIEWER" && "閲覧者"}
              {invitation.role === "USER" && "ユーザー"}
            </dd>
          </div>
        </dl>
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-muted-foreground mb-1"
        >
          パスワード
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full px-3 py-2 border border-input rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          placeholder="8文字以上"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          8文字以上で設定してください
        </p>
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-sm font-medium text-muted-foreground mb-1"
        >
          パスワード（確認）
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full px-3 py-2 border border-input rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          placeholder="もう一度入力"
        />
      </div>

      <SubmitButton
        isPending={isLoading}
        label="パスワードを設定してログイン"
        pendingLabel="設定中..."
        className="w-full"
      />
    </form>
  );
}
