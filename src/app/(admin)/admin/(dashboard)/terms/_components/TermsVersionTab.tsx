"use client";

/**
 * バージョン管理タブ（edit モード専用）
 *
 * バージョン一覧・切替・公開/アーカイブ/削除コントロール
 */

import { TermsStatus } from "@/shared/lib/validations/enums/prisma-types";
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TabsContent,
} from "@/admin/components/ui";
import { versionLabel, statusBadgeVariant, statusLabel } from "./terms-helpers";
import type { TermsVersionSummary } from "./terms-helpers";
import type { TermsVersionDetail } from "@/shared/lib/validations/terms";
import type { Serialized } from "@/shared/lib/serialize";

// =============================================================================
// Types
// =============================================================================

interface TermsVersionTabProps {
  localVersions: TermsVersionSummary[];
  selectedVersionId: string;
  selectedVersionContent: Serialized<TermsVersionDetail> | null;
  hasDraftVersion: boolean;
  isPending: boolean;
  isLoadingVersion: boolean;
  onVersionSwitch: (id: string) => void;
  onCreateNewVersion: () => void;
  onPublishVersion: () => void;
  onArchiveVersion: () => void;
  onDeleteVersion: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function TermsVersionTab({
  localVersions,
  selectedVersionId,
  selectedVersionContent,
  hasDraftVersion,
  isPending,
  isLoadingVersion,
  onVersionSwitch,
  onCreateNewVersion,
  onPublishVersion,
  onArchiveVersion,
  onDeleteVersion,
}: TermsVersionTabProps) {
  return (
    <TabsContent value="version" className="mt-4 space-y-4">
      {localVersions.length > 0 ? (
        <div className="space-y-3">
          {/* 選択中バージョンのバッジ */}
          {selectedVersionContent && (
            <div className="flex items-center gap-2">
              <Badge
                variant={statusBadgeVariant(selectedVersionContent.status)}
              >
                v{selectedVersionContent.version}{" "}
                {statusLabel(selectedVersionContent.status)}
              </Badge>
              {selectedVersionContent.isCurrentVersion && (
                <span className="text-xs text-muted-foreground">現行</span>
              )}
            </div>
          )}

          {/* バージョン選択ドロップダウン */}
          <Select
            value={selectedVersionId}
            onValueChange={(id) => onVersionSwitch(id)}
            disabled={isPending || isLoadingVersion}
          >
            <SelectTrigger>
              <SelectValue placeholder="バージョンを選択" />
            </SelectTrigger>
            <SelectContent>
              {localVersions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {versionLabel(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* バージョン別アクション */}
          {selectedVersionContent?.status === TermsStatus.DRAFT && (
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={onPublishVersion}
                disabled={isPending}
                className="flex-1"
              >
                公開する
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={onDeleteVersion}
                disabled={isPending}
              >
                削除
              </Button>
            </div>
          )}

          {selectedVersionContent?.status === TermsStatus.PUBLISHED &&
            !selectedVersionContent.isCurrentVersion && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onArchiveVersion}
                disabled={isPending}
                className="w-full"
              >
                アーカイブ
              </Button>
            )}

          {selectedVersionContent?.status === TermsStatus.ARCHIVED && (
            <p className="text-xs text-muted-foreground">
              アーカイブ済み（参照のみ）
            </p>
          )}

          {/* 新しいバージョンを作成 */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onCreateNewVersion}
            disabled={isPending || isLoadingVersion || hasDraftVersion}
            title={
              hasDraftVersion
                ? "下書きを先に公開または削除してください"
                : undefined
            }
            className="w-full"
          >
            新しいバージョンを作成
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">バージョンがありません</p>
      )}
    </TabsContent>
  );
}
