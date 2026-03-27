"use client";

import { useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, Unlink } from "lucide-react";
import { Button } from "@/public/components/design-system/button";
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
import { Heading } from "@/public/components/design-system/heading";
import { linkSocial, unlinkAccount, signOut } from "@/shared/lib/auth-client";
import { deleteAccountAction } from "../../_shared/actions/account";

// ---------------------------------------------------------------------------
// Provider config
// ---------------------------------------------------------------------------

const PROVIDERS = [
  { id: "google", label: "Google" },
  { id: "line", label: "LINE" },
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccountLinkingProps {
  readonly providers: readonly string[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AccountLinking({ providers }: AccountLinkingProps) {
  const router = useRouter();
  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const result = await deleteAccountAction();
        if (isMutationError(result)) {
          setError(result.error);
          setIsDeleting(false);
          return;
        }
        // Server-side user deleted, now sign out client
        await signOut();
        window.location.href = "/login";
      } catch (error) {
        console.error("Failed to delete account", getErrorMessage(error));
        setError("アカウントの削除に失敗しました");
        setIsDeleting(false);
      }
    });
  };

  return (
    <div className="space-y-6">
      {error != null && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
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
              className="flex items-center justify-between rounded-lg border border-border p-4"
            >
              <div className="flex items-center gap-3">
                {isLinked ? (
                  <Check className="h-4 w-4 text-accent" aria-hidden="true" />
                ) : (
                  <Link2
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                <span className="text-sm font-medium">{provider.label}</span>
                {isLinked && (
                  <span className="text-xs text-muted-foreground">
                    連携済み
                  </span>
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
                      <Unlink
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
        <Heading level={3} className="!text-sm text-destructive mb-2">
          アカウント削除
        </Heading>
        <p className="text-xs text-muted-foreground mb-4">
          アカウントを削除すると、ログインできなくなります。予約履歴は管理上保持されます。
        </p>
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive">
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
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
