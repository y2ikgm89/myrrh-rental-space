/**
 * Audio Plugin
 *
 * @description 音声プレイヤー挿入ダイアログを提供するプラグイン
 */

"use client";

import { useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
} from "@/admin/components/ui";
import { $createAudioNode } from "../nodes/AudioNode";
import type { DialogPluginProps } from "../config/dialog-registry";

// =============================================================================
// Component
// =============================================================================

export function AudioPlugin({ isOpen, onClose }: DialogPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");

  const handleInsert = () => {
    if (!url.trim()) return;

    editor.update(() => {
      const audioNode = $createAudioNode({
        url: url.trim(),
        title: title.trim(),
        artist: artist.trim(),
      });
      $insertNodeToNearestRoot(audioNode);
    });

    handleClose();
  };

  const handleClose = () => {
    setUrl("");
    setTitle("");
    setArtist("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>音声プレイヤーを挿入</DialogTitle>
          <DialogDescription>
            音声ファイルのURLを入力してください
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="audio-url">音声URL（必須）</Label>
            <Input
              id="audio-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/audio.mp3"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="audio-title">タイトル（任意）</Label>
            <Input
              id="audio-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="楽曲タイトル"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="audio-artist">アーティスト（任意）</Label>
            <Input
              id="audio-artist"
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="アーティスト名"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              キャンセル
            </Button>
            <Button type="button" onClick={handleInsert} disabled={!url.trim()}>
              挿入
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
