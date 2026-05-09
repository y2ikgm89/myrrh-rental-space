/**
 * PortableText — PortableTextBlock[] を順次 render する共有コンポーネント
 *
 * Sanity Portable Text 公式準拠の Block 配列を React node に展開する。
 * 各 block を `<p>` で wrap し、内部 children spans を `<PortableTextSpans>` 経由で描画。
 * Server / Client 両方の context で同期描画可能（CuratedIcon は SSR safe）。
 */

import { type ReactElement } from "react";
import { PortableTextSpans } from "./PortableTextSpans";
import type { PortableTextBlock } from "@/shared/lib/portable-text";

interface PortableTextProps {
  readonly blocks: PortableTextBlock[];
  /** 各 `<p>` に適用する className */
  readonly className?: string;
  /** iconInline span の className（`<PortableTextSpans>` に伝播） */
  readonly iconClassName?: string;
}

export function PortableText({
  blocks,
  className,
  iconClassName,
}: PortableTextProps): ReactElement | null {
  if (blocks.length === 0) return null;
  return (
    <>
      {blocks.map((block) => (
        <p key={block._key} {...(className !== undefined && { className })}>
          <PortableTextSpans
            spans={block.children}
            {...(iconClassName !== undefined && { iconClassName })}
          />
        </p>
      ))}
    </>
  );
}
