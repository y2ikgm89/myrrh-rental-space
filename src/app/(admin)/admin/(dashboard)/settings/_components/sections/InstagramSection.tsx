"use client";

/**
 * Instagram設定セクション
 *
 * Instagram連携の設定と管理:
 * - OAuth連携 / 手動トークン入力
 * - フィード表示設定
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { disconnectInstagram } from "@/admin/actions/instagram";
import type { InstagramConfig } from "@/shared/domain/instagram/types";
import { isMutationError } from "@/shared/lib/mutation-result";
import { ConnectionCard } from "./instagram/ConnectionCard";
import { FeedSettingsCard } from "./instagram/FeedSettingsCard";

interface InstagramSectionProps {
  config: InstagramConfig;
}

export function InstagramSection({ config }: InstagramSectionProps) {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const [isPending, startTransition] = useTransition();

  const handleDisconnect = async () => {
    const confirmed = await confirmDialog({
      title: "Instagram連携を解除しますか？",
      description:
        "Instagram連携を解除しますか？キャッシュされた投稿も削除されます。",
      confirmLabel: "解除",
      variant: "destructive",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const result = await disconnectInstagram();
      if (!isMutationError(result)) {
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* 接続設定カード */}
      <ConnectionCard
        config={config}
        isPending={isPending}
        onDisconnect={handleDisconnect}
      />

      {/* フィード設定カード（連携済みの場合のみ表示） */}
      {config.isConnected && (
        <FeedSettingsCard config={config} parentIsPending={isPending} />
      )}
    </div>
  );
}
