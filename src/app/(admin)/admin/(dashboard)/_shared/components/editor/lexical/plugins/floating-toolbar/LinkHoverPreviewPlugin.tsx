"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { IconExternalLink } from "@tabler/icons-react";

type LinkPreviewState = {
  url: string;
  position: { top: number; left: number };
};

function getElementFromTarget(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target : null;
}

function LinkHoverPreview({ url, position }: LinkPreviewState) {
  let domain = "";
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = url;
  }
  const isExternal = !url.startsWith("/");

  return (
    <div
      className="fixed z-50 rounded-lg border bg-popover px-3 py-2 text-sm shadow-md flex items-center gap-2 pointer-events-none"
      style={{ top: position.top, left: position.left }}
    >
      {isExternal && (
        <IconExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
      )}
      <span className="text-muted-foreground text-xs">{domain}</span>
      <span className="max-w-[200px] truncate text-xs">{url}</span>
    </div>
  );
}

export function LinkHoverPreviewPlugin() {
  const [editor] = useLexicalComposerContext();
  const [previewState, setPreviewState] = useState<LinkPreviewState | null>(
    null,
  );

  useEffect(() => {
    const rootElement = editor.getRootElement();
    if (!rootElement) return;

    function handleMouseOver(e: MouseEvent) {
      const target = getElementFromTarget(e.target);
      const linkEl = target?.closest("a[href]");
      if (!(linkEl instanceof HTMLAnchorElement)) return;
      const url = linkEl.getAttribute("href") ?? linkEl.href;
      if (!url) return;
      const rect = linkEl.getBoundingClientRect();
      setPreviewState({
        url,
        position: { top: rect.bottom + 6, left: rect.left },
      });
    }

    function handleMouseOut(e: MouseEvent) {
      const relatedTarget = getElementFromTarget(e.relatedTarget);
      if (!relatedTarget?.closest("a[href]")) {
        setPreviewState(null);
      }
    }

    rootElement.addEventListener("mouseover", handleMouseOver);
    rootElement.addEventListener("mouseout", handleMouseOut);

    return () => {
      rootElement.removeEventListener("mouseover", handleMouseOver);
      rootElement.removeEventListener("mouseout", handleMouseOut);
    };
  }, [editor]);

  if (!previewState) return null;

  return createPortal(<LinkHoverPreview {...previewState} />, document.body);
}
