"use client";

import Image from "next/image";
import { type ReactElement } from "react";
import {
  IconPhoto,
  IconPhotoOff,
  IconPhotoPlus,
  IconTrash,
} from "@tabler/icons-react";
import { Badge, Button } from "@/admin/components/ui";
import type { PageBuilderResolvedMediaMap } from "@/shared/lib/page-builder/media";
import type { PageBuilderNode } from "@/shared/lib/page-builder/schema";
import { cn } from "@/shared/lib/cn";

type PageBuilderImageNode = Extract<PageBuilderNode, { type: "image" }>;

type PageBuilderAssetsPanelProps = {
  imageNodes: readonly PageBuilderImageNode[];
  mediaById: PageBuilderResolvedMediaMap;
  selectedNodeId: string;
  disabled: boolean;
  onSelectNode: (nodeId: string) => void;
  onOpenImagePicker: (nodeId: string) => void;
  onClearImage: (nodeId: string) => void;
};

export function PageBuilderAssetsPanel({
  imageNodes,
  mediaById,
  selectedNodeId,
  disabled,
  onSelectNode,
  onOpenImagePicker,
  onClearImage,
}: PageBuilderAssetsPanelProps): ReactElement {
  if (imageNodes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        画像ノードはまだありません。Insert から Image を追加してください。
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {imageNodes.map((node) => {
        const media =
          node.content.mediaId === null
            ? null
            : (mediaById[node.content.mediaId] ?? null);
        const isSelected = selectedNodeId === node.id;
        const hasMissingReference =
          node.content.mediaId !== null && media === null;
        const imageAlt =
          media?.alt ??
          (node.content.alt.length > 0 ? node.content.alt : node.name);

        return (
          <article
            key={node.id}
            className={cn(
              "rounded-xl border bg-background p-3 transition-colors",
              isSelected && "border-primary/40 bg-primary/5",
            )}
          >
            <div className="flex gap-3">
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground">
                {media ? (
                  <Image
                    src={media.url}
                    alt={imageAlt}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : hasMissingReference ? (
                  <IconPhotoOff className="h-5 w-5" />
                ) : (
                  <IconPhoto className="h-5 w-5" />
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="min-w-0 text-left text-sm font-medium text-foreground hover:underline"
                      onClick={() => onSelectNode(node.id)}
                    >
                      <span className="block truncate">{node.name}</span>
                    </button>
                    {hasMissingReference ? (
                      <Badge variant="destructive">参照切れ</Badge>
                    ) : media ? (
                      <Badge variant="secondary">設定済み</Badge>
                    ) : (
                      <Badge variant="outline">未設定</Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {media?.filename ?? node.id}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => onSelectNode(node.id)}
                  >
                    選択
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenImagePicker(node.id)}
                    disabled={disabled}
                  >
                    <IconPhotoPlus className="mr-2 h-4 w-4" />
                    変更
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => onClearImage(node.id)}
                    disabled={disabled || node.content.mediaId === null}
                  >
                    <IconTrash className="mr-2 h-4 w-4" />
                    解除
                  </Button>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
