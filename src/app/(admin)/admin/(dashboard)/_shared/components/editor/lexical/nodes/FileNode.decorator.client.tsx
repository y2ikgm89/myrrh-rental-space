"use client";

import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import type { NodeKey } from "lexical";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { formatFileSize } from "./FileNode";
import { registerLexicalDecorator } from "./decorator-registry";

function getFileIconEmoji(mime: string): string {
  if (mime.includes("pdf")) return "📕";
  if (mime.includes("word") || mime.includes("doc")) return "📘";
  if (mime.includes("sheet") || mime.includes("xls") || mime.includes("csv"))
    return "📗";
  if (
    mime.includes("zip") ||
    mime.includes("archive") ||
    mime.includes("tar") ||
    mime.includes("gz")
  )
    return "📦";
  if (mime.includes("image")) return "🖼️";
  if (mime.includes("video")) return "🎬";
  if (mime.includes("audio")) return "🎵";
  return "📄";
}

function FileComponent({
  url,
  fileName,
  fileSize,
  mime,
  nodeKey,
}: {
  url: string;
  fileName: string;
  fileSize: number;
  mime: string;
  nodeKey: NodeKey;
}): ReactElement {
  const [isSelected, setSelected] = useLexicalNodeSelection(nodeKey);
  const icon = getFileIconEmoji(mime);
  const sizeText = formatFileSize(fileSize);

  return (
    <a
      href={url}
      download
      onClick={(e) => {
        e.preventDefault();
        setSelected(true);
      }}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card p-3 my-2 no-underline hover:bg-accent transition-colors",
        isSelected && "ring-2 ring-ring",
      )}
    >
      <span className="text-2xl flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate text-card-foreground">
          {fileName || url}
        </p>
        {fileSize > 0 && (
          <p className="text-xs text-muted-foreground">{sizeText}</p>
        )}
      </div>
    </a>
  );
}

registerLexicalDecorator("file", FileComponent as never);
