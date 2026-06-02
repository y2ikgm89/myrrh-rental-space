/**
 * Audio Inspector Panel
 *
 * @description AudioNode のプロパティ編集パネル (Phase 4: MediaPicker 統合)
 */

"use client";

import { useEffect, useState } from "react";
import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { IconMusic, IconTrash } from "@tabler/icons-react";
import {
  $isAudioNode,
  audioUrlState,
  audioTitleState,
  audioArtistState,
} from "../../nodes/AudioNode";
import type { AudioNode } from "../../nodes/AudioNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorFields } from "../InspectorFields";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Button, Input, Label } from "@/admin/components/ui";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";

// =============================================================================
// Types
// =============================================================================

type AudioInspectorPanelProps = {
  nodeKey: string;
  node: AudioNode;
};

// =============================================================================
// Component
// =============================================================================

export function AudioInspectorPanel({
  nodeKey,
  node,
}: AudioInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isAudioNode);

  const [url, setUrl] = useState(() =>
    editor.read(() => $getState(node, audioUrlState)),
  );
  const [title, setTitle] = useState(() =>
    editor.read(() => $getState(node, audioTitleState)),
  );
  const [artist, setArtist] = useState(() =>
    editor.read(() => $getState(node, audioArtistState)),
  );

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        setUrl($getState(node, audioUrlState));
        setTitle($getState(node, audioTitleState));
        setArtist($getState(node, audioArtistState));
      });
    });
  }, [editor, node]);

  const audioPicker = useSingleMediaPicker({
    accept: "audio",
    defaultUsage: "GENERAL",
    showUrlTab: true,
    onSelect: (media) => {
      const selected = media[0];
      if (!selected) return;
      updateNode((n) => {
        $setState(n, audioUrlState, selected.url);
      });
    },
  });

  const handleUrlClear = () => {
    updateNode((n) => {
      $setState(n, audioUrlState, "");
    });
  };

  const handleTitleChange = (value: string) => {
    updateNode((n) => {
      $setState(n, audioTitleState, value);
    });
  };

  const handleArtistChange = (value: string) => {
    updateNode((n) => {
      $setState(n, audioArtistState, value);
    });
  };

  return (
    <div>
      <InspectorHeader title="音声プレイヤー" />

      <InspectorFields title="音声ファイル">
        <div className="space-y-2">
          {url.length > 0 ? (
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="mb-2 flex items-center gap-2">
                <IconMusic
                  className="h-5 w-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="truncate text-xs text-muted-foreground">{url}</p>
              </div>
              <audio src={url} controls preload="metadata" className="w-full" />
            </div>
          ) : (
            <div className="flex aspect-[3/1] w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted text-muted-foreground">
              <IconMusic className="h-8 w-8" aria-hidden="true" />
            </div>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={url.length > 0 ? "outline" : "default"}
              size="sm"
              className="flex-1"
              onClick={() => audioPicker.openPicker()}
            >
              <IconMusic className="mr-2 h-4 w-4" aria-hidden="true" />
              {url.length > 0 ? "音声を差し替え" : "音声を選択"}
            </Button>
            {url.length > 0 && (
              <Button
                type="button"
                variant="destructive-ghost"
                size="sm"
                onClick={handleUrlClear}
                aria-label="音声を削除"
              >
                <IconTrash className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </InspectorFields>

      <InspectorFields title="メタデータ">
        <div className="space-y-2">
          <Label htmlFor="inspector-audio-title" className="text-xs">
            タイトル
          </Label>
          <Input
            id="inspector-audio-title"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="楽曲タイトル"
            className="text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="inspector-audio-artist" className="text-xs">
            アーティスト
          </Label>
          <Input
            id="inspector-audio-artist"
            value={artist}
            onChange={(e) => handleArtistChange(e.target.value)}
            placeholder="アーティスト名"
            className="text-sm"
          />
        </div>
      </InspectorFields>

      {audioPicker.mediaPickerDialog}
    </div>
  );
}
