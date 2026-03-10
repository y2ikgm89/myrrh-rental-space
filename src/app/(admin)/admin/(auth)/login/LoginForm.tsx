"use client";

/**
 * ログインフォーム（Client Component）
 *
 * Better Auth 版
 */

import { useState, useEffect, type FormEvent, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/shared/lib/auth-client";
import { credentialsSchema } from "@/admin/lib/validations/auth";

const STORAGE_KEY = "myrrh_admin_email";

export function LoginForm(): ReactElement {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // 保存されたメールアドレスを読み込み
  useEffect(() => {
    const savedEmail = localStorage.getItem(STORAGE_KEY);
    if (savedEmail) {
      // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect
      setEmail(savedEmail);
      // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setError("");

    const parsedCredentials = credentialsSchema.safeParse({ email, password });
    if (!parsedCredentials.success) {
      setError("入力内容を確認してください");
      return;
    }

    setIsLoading(true);

    try {
      const { email: validatedEmail, password: validatedPassword } =
        parsedCredentials.data;

      const result = await signIn.email({
        email: validatedEmail,
        password: validatedPassword,
      });

      if (result.error) {
        setError("メールアドレスまたはパスワードが正しくありません");
      } else {
        // メールアドレスを保存/削除
        if (rememberMe) {
          localStorage.setItem(STORAGE_KEY, validatedEmail);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }

        router.push("/admin");
        router.refresh();
      }
    } catch {
      setError("ログイン中にエラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="block text-sm font-medium text-foreground"
        >
          メールアドレス
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="w-full h-10 px-3 py-2 bg-card border border-input rounded-md shadow-sm text-foreground placeholder:text-muted-foreground transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:ring-offset-1 focus:border-primary"
          placeholder="admin@example.com"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-foreground"
        >
          パスワード
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="w-full h-10 px-3 py-2 bg-card border border-input rounded-md shadow-sm text-foreground placeholder:text-muted-foreground transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:ring-offset-1 focus:border-primary"
          placeholder="••••••••"
        />
      </div>

      <div className="flex items-center">
        <input
          id="remember-me"
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="h-4 w-4 rounded border-input text-primary focus:ring-primary/50 cursor-pointer transition-colors duration-200"
        />
        <label
          htmlFor="remember-me"
          className="ml-2 block text-sm text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors duration-200"
        >
          メールアドレスを保存する
        </label>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full h-10 flex items-center justify-center rounded-md shadow-sm text-sm font-medium text-primary-foreground bg-primary transition-all duration-200 hover:bg-primary/90 hover:-translate-y-px hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-sm"
      >
        {isLoading ? "ログイン中..." : "ログイン"}
      </button>
    </form>
  );
}
