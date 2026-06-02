/**
 * Testimonial Item Inspector Panel
 *
 * @description TestimonialItemNodeのプロパティ編集パネル
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isTestimonialItemNode,
  type TestimonialItemNode,
  type TestimonialRating,
  testimonialAuthorNameState,
  testimonialAuthorTitleState,
  testimonialAvatarUrlState,
  testimonialRatingState,
  testimonialDateState,
} from "../../nodes/TestimonialNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Input, Label } from "@/admin/components/ui";
import { Button } from "@/admin/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
import { IconPhoto, IconUser, IconTrash } from "@tabler/icons-react";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";

// =============================================================================
// Constants
// =============================================================================

const RATING_OPTIONS: readonly { value: TestimonialRating; label: string }[] = [
  { value: 1, label: "★☆☆☆☆ (1)" },
  { value: 2, label: "★★☆☆☆ (2)" },
  { value: 3, label: "★★★☆☆ (3)" },
  { value: 4, label: "★★★★☆ (4)" },
  { value: 5, label: "★★★★★ (5)" },
];

// =============================================================================
// Types
// =============================================================================

type TestimonialItemInspectorPanelProps = {
  nodeKey: string;
  node: TestimonialItemNode;
};

// =============================================================================
// Component
// =============================================================================

export function TestimonialItemInspectorPanel({
  nodeKey,
  node,
}: TestimonialItemInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isTestimonialItemNode);

  const { authorName, authorTitle, avatarUrl, rating, date } = editor.read(
    () => ({
      authorName: $getState(node, testimonialAuthorNameState),
      authorTitle: $getState(node, testimonialAuthorTitleState),
      avatarUrl: $getState(node, testimonialAvatarUrlState),
      rating: $getState(node, testimonialRatingState),
      date: $getState(node, testimonialDateState),
    }),
  );

  const handleAuthorNameChange = (value: string) => {
    updateNode((n) => {
      $setState(n, testimonialAuthorNameState, value);
    });
  };

  const handleAuthorTitleChange = (value: string) => {
    updateNode((n) => {
      $setState(n, testimonialAuthorTitleState, value);
    });
  };

  const imagePicker = useSingleMediaPicker({
    defaultUsage: "POST",
    showUrlTab: true,
    onSelect: (media) => {
      const selected = media[0];
      if (!selected) return;
      updateNode((n) => {
        $setState(n, testimonialAvatarUrlState, selected.url);
      });
    },
  });

  const handleAvatarClear = () => {
    updateNode((n) => {
      $setState(n, testimonialAvatarUrlState, "");
    });
  };

  const handleRatingChange = (value: string) => {
    const parsed = parseInt(value, 10);
    if (
      parsed === 1 ||
      parsed === 2 ||
      parsed === 3 ||
      parsed === 4 ||
      parsed === 5
    ) {
      updateNode((n) => {
        $setState(n, testimonialRatingState, parsed);
      });
    }
  };

  const handleDateChange = (value: string) => {
    updateNode((n) => {
      $setState(n, testimonialDateState, value);
    });
  };

  return (
    <div>
      <InspectorHeader title="口コミアイテム" />

      <InspectorSection title="投稿者情報">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">名前</Label>
            <Input
              value={authorName}
              onChange={(e) => handleAuthorNameChange(e.target.value)}
              placeholder="山田太郎"
              className="text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">肩書き・役職</Label>
            <Input
              value={authorTitle}
              onChange={(e) => handleAuthorTitleChange(e.target.value)}
              placeholder="CEO / 会社名"
              className="text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">アバター画像</Label>
            <div className="flex items-center gap-3">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border bg-checker">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <IconUser className="h-6 w-6" />
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Button
                  type="button"
                  variant={avatarUrl ? "outline" : "default"}
                  size="sm"
                  className="w-full"
                  onClick={() => imagePicker.openPicker()}
                >
                  <IconPhoto className="mr-2 h-4 w-4" />
                  {avatarUrl ? "差し替え" : "画像を選択"}
                </Button>
                {avatarUrl && (
                  <Button
                    type="button"
                    variant="destructive-ghost"
                    size="sm"
                    className="w-full"
                    onClick={handleAvatarClear}
                  >
                    <IconTrash className="mr-2 h-4 w-4" />
                    削除
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="評価">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">評価（星）</Label>
            <Select value={String(rating)} onValueChange={handleRatingChange}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RATING_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">投稿日</Label>
            <Input
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              placeholder="2024-01-01"
              className="text-sm"
            />
          </div>
        </div>
      </InspectorSection>

      {imagePicker.mediaPickerDialog}
    </div>
  );
}
