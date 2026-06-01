"use client";

/**
 * ログインフォーム（Client Component）
 *
 * Better Auth 版
 */

import {
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactElement,
} from "react";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/shared/lib/admin-auth-client";
import { credentialsSchema } from "@/admin/lib/validations/auth";
import { SubmitButton } from "@/admin/components/ui";

const STORAGE_KEY = "myrrh_admin_email";

// 外部ストア（localStorage）用の useSyncExternalStore ハンドラ
// localStorage は変更通知を発火しないため subscribe は no-op
const subscribe = () => () => {};
const readSavedEmail = (): string => {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
};
// getServerSnapshot は参照安定化のためモジュールスコープの定数を返す
const getServerSnapshot = (): string => "";

export function LoginForm(): ReactElement {
  const router = useRouter();

  // 外部ストア（localStorage）から保存済みメールを取得。
  // SSR は "" を返し、hydration 後に client snapshot に切り替わる（hydration mismatch 自動回避）。
  // https://react.dev/reference/react/useSyncExternalStore#subscribing-to-a-browser-api
  const snapshotRef = useRef<string | undefined>(undefined);
  const savedEmail = useSyncExternalStore(
    subscribe,
    () => {
      snapshotRef.current ??= readSavedEmail();
      return snapshotRef.current;
    },
    getServerSnapshot,
  );

  // ユーザー入力 state。savedEmail は hydration 後に "" → 保存値に変わるため、
  // 公式「Adjusting State Directly During Render」パターンで sync する。
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [email, setEmail] = useState(savedEmail);
  const [rememberMe, setRememberMe] = useState(savedEmail !== "");
  const [previousSavedEmail, setPreviousSavedEmail] = useState(savedEmail);
  if (savedEmail !== previousSavedEmail) {
    setPreviousSavedEmail(savedEmail);
    setEmail(savedEmail);
    setRememberMe(savedEmail !== "");
  }

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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

    const { email: validatedEmail, password: validatedPassword } =
      parsedCredentials.data;

    // Better Auth 公式推奨: `callbackURL` で hard navigation + `fetchOptions.onSuccess`
    // で副作用（localStorage 保存）。`router.push` ベースの soft navigation は
    // App Router で `load` event を発火せず、Playwright `page.waitForURL` が timeout
    // する silent bug を起こす（→ `test-quality/e2e.md` §App Router soft navigation Gotcha）。
    // `callbackURL` 指定で Better Auth が Set-Cookie + Location header の hard redirect
    // を発行し、Router Cache + server session が自動同期される。
    // https://better-auth.com/docs/concepts/client#error-handling
    try {
      await signIn.email({
        email: validatedEmail,
        password: validatedPassword,
        callbackURL: "/admin",
        fetchOptions: {
          onSuccess: () => {
            if (rememberMe) {
              localStorage.setItem(STORAGE_KEY, validatedEmail);
            } else {
              localStorage.removeItem(STORAGE_KEY);
            }
            // `callbackURL` が hard navigation で /admin に redirect する。
            // Router Cache 同期のため refresh のみ残す（push は callbackURL に委譲）。
            router.refresh();
          },
          onError: (ctx) => {
            if (ctx.response.status === 429) {
              setError(
                "リクエストが多すぎます。しばらく待ってからお試しください。",
              );
            } else {
              setError("メールアドレスまたはパスワードが正しくありません");
            }
            setIsLoading(false);
          },
        },
      });
    } catch {
      setError(
        "ログインに失敗しました。通信環境を確認して再度お試しください。",
      );
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
          className="w-full min-h-11 px-3 py-2 bg-card border border-input rounded-md shadow-sm text-foreground placeholder:text-muted-foreground transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:border-primary"
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
            className="w-full min-h-11 px-3 py-2 pr-10 bg-card border border-input rounded-md shadow-sm text-foreground placeholder:text-muted-foreground transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:border-primary"
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

      <div className="flex items-center justify-between">
        <label
          htmlFor="remember-me"
          className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors duration-200"
        >
          <input
            id="remember-me"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 rounded border-input text-primary focus-visible:ring-primary/50 cursor-pointer transition-colors duration-200"
          />
          メールアドレスを保存する
        </label>

        <Link
          href="/admin/forgot-password"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          パスワードを忘れた方
        </Link>
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
