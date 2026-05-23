/**
 * File Inspector Panel
 *
 * @description FileNode のプロパティ編集パネル (Phase 5: MediaPicker 統合)
 */

"use client";

import { useEffect, useState } from "react";
import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { IconFileText, IconTrash } from "@tabler/icons-react";
import {
  $isFileNode,
  fileUrlState,
  fileNameState,
  fileSizeState,
  fileMimeState,
  formatFileSize,
} from "../../nodes/FileNode";
import type { FileNode } from "../../nodes/FileNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorFields } from "../InspectorFields";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Button, Input, Label } from "@/admin/components/ui";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";

// =============================================================================
// Types
// =============================================================================

type FileInspectorPanelProps = {
  nodeKey: string;
  node: FileNode;
};

// =============================================================================
// Component
// =============================================================================

export function FileInspectorPanel({ nodeKey, node }: FileInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isFileNode);

  const [url, setUrl] = useState(() =>
    editor.read(() => $getState(node, fileUrlState)),
  );
  const [fileName, setFileName] = useState(() =>
    editor.read(() => $getState(node, fileNameState)),
  );
  const [fileSize, setFileSize] = useState(() =>
    editor.read(() => $getState(node, fileSizeState)),
  );
  const [mime, setMime] = useState(() =>
    editor.read(() => $getState(node, fileMimeState)),
  );

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        setUrl($getState(node, fileUrlState));
        setFileName($getState(node, fileNameState));
        setFileSize($getState(node, fileSizeState));
        setMime($getState(node, fileMimeState));
      });
    });
  }, [editor, node]);

  const filePicker = useSingleMediaPicker({
    accept: "file",
    defaultUsage: "GENERAL",
    showUrlTab: true,
    onSelect: (media) => {
      const selected = media[0];
      if (!selected) return;
      const inferredName =
        selected.filename ??
        selected.alt ??
        extractFilenameFromUrl(selected.url);
      updateNode((n) => {
        $setState(n, fileUrlState, selected.url);
        if (inferredName.length > 0) {
          $setState(n, fileNameState, inferredName);
        }
      });
    },
  });

  const handleUrlClear = () => {
    updateNode((n) => {
      $setState(n, fileUrlState, "");
      $setState(n, fileNameState, "");
      $setState(n, fileSizeState, 0);
      $setState(n, fileMimeState, "");
    });
  };

  const handleFileNameChange = (value: string) => {
    updateNode((n) => {
      $setState(n, fileNameState, value);
    });
  };

  return (
    <div>
      <InspectorHeader title="ファイル添付" />

      <InspectorFields title="ファイル">
        <div className="space-y-2">
          {url.length > 0 ? (
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start gap-2">
                <IconFileText
                  className="h-6 w-6 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-card-foreground">
                    {fileName.length > 0 ? fileName : url}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {url}
                  </p>
                  {(fileSize > 0 || mime.length > 0) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[
                        fileSize > 0 ? formatFileSize(fileSize) : null,
                        mime.length > 0 ? mime : null,
                      ]
                        .filter((v): v is string => v !== null)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex aspect-[3/1] w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted text-muted-foreground">
              <IconFileText className="h-8 w-8" aria-hidden="true" />
            </div>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={url.length > 0 ? "outline" : "default"}
              size="sm"
              className="flex-1"
              onClick={() => filePicker.openPicker()}
            >
              <IconFileText className="mr-2 h-4 w-4" aria-hidden="true" />
              {url.length > 0 ? "ファイルを差し替え" : "ファイルを選択"}
            </Button>
            {url.length > 0 && (
              <Button
                type="button"
                variant="destructive-ghost"
                size="sm"
                onClick={handleUrlClear}
                aria-label="ファイルを削除"
              >
                <IconTrash className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </InspectorFields>

      {url.length > 0 && (
        <InspectorFields title="メタデータ">
          <div className="space-y-2">
            <Label htmlFor="inspector-file-name" className="text-xs">
              ファイル名
            </Label>
            <Input
              id="inspector-file-name"
              value={fileName}
              onChange={(e) => handleFileNameChange(e.target.value)}
              placeholder="document.pdf"
              className="h-8 text-sm"
            />
          </div>
        </InspectorFields>
      )}

      {filePicker.mediaPickerDialog}
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function extractFilenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split("/").filter(Boolean).pop() ?? "");
  } catch {
    return "";
  }
}
