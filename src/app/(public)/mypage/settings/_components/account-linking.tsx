"use client";

import { useState, startTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconUnlink } from "@tabler/icons-react";
import { Button } from "@/public/components/design-system/button";
import { PROVIDER_LOGOS } from "@/public/components/ui/social-provider-logos";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/public/components/design-system/dialog";
import { isMutationError } from "@/shared/lib/mutation-result";
import { getErrorMessage } from "@/shared/lib/errors";
import {
  linkSocial,
  unlinkAccount,
  signOut,
} from "@/shared/lib/customer-auth-client";
import { deleteAccountAction } from "../../_shared/actions/account";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/public/components/ui/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";

// ---------------------------------------------------------------------------
// Provider config
// ---------------------------------------------------------------------------

const PROVIDERS = [
  { id: "google", label: "Google", logoClass: "" },
  { id: "line", label: "LINE", logoClass: "text-[#06C755]" },
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccountLinkingProps {
  readonly providers: readonly string[];
  readonly turnstileSiteKey: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AccountLinking({
  providers,
  turnstileSiteKey,
}: AccountLinkingProps) {
  const router = useRouter();
  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTurnstileToken, setDeleteTurnstileToken] = useState("");
  const deleteTurnstileRef = useRef<TurnstileInstance>(null);

  const linkedCount = providers.length;

  const handleLink = (providerId: string) => {
    void linkSocial({
      provider: providerId,
      callbackURL: "/mypage/settings",
    });
  };

  const handleUnlink = (providerId: string) => {
    if (linkedCount <= 1) return;
    setUnlinkingProvider(providerId);
    setError(null);

    startTransition(async () => {
      try {
        await unlinkAccount({ providerId });
        router.refresh();
      } catch (error) {
        console.error("Failed to unlink account", getErrorMessage(error));
        setError("連携解除に失敗しました");
      } finally {
        setUnlinkingProvider(null);
      }
    });
  };

  const handleDeleteAccount = () => {
    setIsDeleting(true);
    setError(null);

    startTransition(async () => {
      try {
        const result = await deleteAccountAction(
          deleteTurnstileToken || undefined,
        );
        if (isMutationError(result)) {
          setError(result.error);
          setIsDeleting(false);
          deleteTurnstileRef.current?.reset();
          return;
        }
        // Server-side user deleted, now sign out client
        await signOut();
        window.location.href = "/login";
      } catch (error) {
        console.error("Failed to delete account", getErrorMessage(error));
        setError("アカウントの削除に失敗しました");
        setIsDeleting(false);
        deleteTurnstileRef.current?.reset();
      }
    });
  };

  return (
    <div className="space-y-6">
      {error != null && (
        <div
          className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="space-y-3">
        {PROVIDERS.map((provider) => {
          const isLinked = providers.includes(provider.id);
          const isUnlinking = unlinkingProvider === provider.id;

          return (
            <div
              key={provider.id}
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border border-border p-4"
            >
              <div className="flex items-center gap-3">
                <span className={provider.logoClass}>
                  {PROVIDER_LOGOS[provider.id]?.()}
                </span>
                <span className="text-sm font-medium">{provider.label}</span>
                {isLinked && (
                  <IconCheck
                    className="ml-1 h-4 w-4 text-accent"
                    aria-hidden="true"
                  />
                )}
              </div>

              {isLinked ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUnlink(provider.id)}
                  disabled={linkedCount <= 1 || isUnlinking}
                >
                  {isUnlinking ? (
                    "解除中..."
                  ) : (
                    <>
                      <IconUnlink
                        className="mr-1.5 h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      解除
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleLink(provider.id)}
                >
                  連携する
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {linkedCount <= 1 && (
        <p className="text-xs text-muted-foreground">
          最低1つのアカウント連携が必要です。解除するには別のアカウントを先に連携してください。
        </p>
      )}

      {/* Account deletion */}
      <div className="pt-6 border-t border-border">
        <p className="text-xs text-muted-foreground mb-3">
          アカウントを削除すると、ログインできなくなります。予約履歴は管理上保持されます。
        </p>
        <Dialog
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            setDeleteDialogOpen(open);
            if (!open) setDeleteTurnstileToken("");
          }}
        >
          <DialogTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/5"
            >
              アカウントを削除する
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>アカウント削除の確認</DialogTitle>
              <DialogDescription>
                この操作は取り消せません。アカウントを削除すると、ソーシャルログインによるアクセスが無効になります。
              </DialogDescription>
            </DialogHeader>
            <TurnstileWidget
              ref={deleteTurnstileRef}
              siteKey={turnstileSiteKey}
              action={TURNSTILE_ACTIONS.mypage_account_delete}
              onVerify={setDeleteTurnstileToken}
              onExpire={() => setDeleteTurnstileToken("")}
            />
            <DialogFooter>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDeleteDialogOpen(false)}
              >
                キャンセル
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90"
              >
                {isDeleting ? "削除中..." : "削除する"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
