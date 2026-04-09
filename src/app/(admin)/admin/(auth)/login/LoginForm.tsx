"use client";

/**
 * ログインフォーム（Client Component）
 *
 * Better Auth 版
 */

import { useState, useEffect, type FormEvent, type ReactElement } from "react";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { signIn } from "@/shared/lib/admin-auth-client";
import { credentialsSchema } from "@/admin/lib/validations/auth";
import { SubmitButton } from "@/admin/components/ui";

const STORAGE_KEY = "myrrh_admin_email";

export function LoginForm(): ReactElement {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // 保存されたメールアドレスを読み込み
  useEffect(() => {
    const savedEmail = localStorage.getItem(STORAGE_KEY);
    if (savedEmail) {
      // eslint-disable-next-line @eslint-react/set-state-in-effect
      setEmail(savedEmail);
      // eslint-disable-next-line @eslint-react/set-state-in-effect
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
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full h-10 px-3 py-2 pr-10 bg-card border border-input rounded-md shadow-sm text-foreground placeholder:text-muted-foreground transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:ring-offset-1 focus:border-primary"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
          >
            {showPassword ? (
              <IconEyeOff className="h-4 w-4" />
            ) : (
              <IconEye className="h-4 w-4" />
            )}
          </button>
        </div>
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

      <SubmitButton
        isPending={isLoading}
        label="ログイン"
        pendingLabel="ログイン中..."
        className="w-full"
        size="lg"
      />
    </form>
  );
}
