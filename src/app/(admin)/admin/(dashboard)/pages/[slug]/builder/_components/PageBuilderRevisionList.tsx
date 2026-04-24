"use client";

import { type ReactElement } from "react";
import {
  IconArrowBackUp,
  IconClock,
  IconWorld,
  IconWriting,
} from "@tabler/icons-react";
import { Badge, Button } from "@/admin/components/ui";
import type { PageBuilderRevisionSummary } from "@/shared/domain/page-builder/types";
import { cn } from "@/shared/lib/cn";

type PageBuilderRevisionListProps = {
  revisions: readonly PageBuilderRevisionSummary[];
  draftVersion: number;
  publishedVersion: number | null;
  isDirty: boolean;
  disabled: boolean;
  onRequestRestore: (revisionId: string) => void;
};

function formatRevisionDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "日時不明";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function PageBuilderRevisionList({
  revisions,
  draftVersion,
  publishedVersion,
  isDirty,
  disabled,
  onRequestRestore,
}: PageBuilderRevisionListProps): ReactElement {
  if (revisions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        revision はまだありません。
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {revisions.map((revision) => {
        const isCurrentDraft =
          revision.kind === "draft" && revision.version === draftVersion;
        const isCurrentPublished =
          revision.kind === "published" &&
          publishedVersion !== null &&
          revision.version === publishedVersion;
        const disableRestore = disabled || (isCurrentDraft && !isDirty);

        return (
          <div
            key={revision.id}
            className={cn(
              "rounded-xl border bg-background p-3",
              isCurrentDraft && "border-primary/40 bg-primary/5",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      revision.kind === "published" ? "default" : "secondary"
                    }
                  >
                    {revision.kind === "published" ? (
                      <IconWorld className="mr-1 h-3.5 w-3.5" />
                    ) : (
                      <IconWriting className="mr-1 h-3.5 w-3.5" />
                    )}
                    {revision.kind === "published" ? "Published" : "Draft"}
                  </Badge>
                  <Badge variant="outline">v{revision.version}</Badge>
                  {isCurrentDraft ? (
                    <Badge variant="secondary">
                      {isDirty ? "最新保存" : "現在の下書き"}
                    </Badge>
                  ) : null}
                  {isCurrentPublished ? (
                    <Badge variant="default">現在の公開版</Badge>
                  ) : null}
                </div>

                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <IconClock className="h-3.5 w-3.5" />
                  {formatRevisionDate(revision.createdAt)}
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onRequestRestore(revision.id)}
                disabled={disableRestore}
              >
                <IconArrowBackUp className="mr-2 h-4 w-4" />
                復元
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
