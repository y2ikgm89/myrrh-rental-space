/**
 * PortableTextSpans — PortableTextSpan[] を順次 render する共有コンポーネント
 *
 * Sanity Portable Text 公式準拠の Span 配列を React node に展開する。
 * Server / Client 両方の context で同期描画可能（CuratedIcon は SSR safe）。
 */

import { Fragment, type ReactElement } from "react";
import { CuratedIcon } from "../icon-curation/CuratedIcon";
import type { PortableTextSpan } from "@/shared/lib/portable-text";

interface PortableTextSpansProps {
  readonly spans: PortableTextSpan[];
  /** iconInline span の className（呼び出し側で size 指定: "h-3 w-3" / "h-4 w-4" / "h-5 w-5" 等） */
  readonly iconClassName?: string;
}

export function PortableTextSpans({
  spans,
  iconClassName,
}: PortableTextSpansProps): ReactElement {
  return (
    <>
      {spans.map((span) => {
        if (span._type === "span") {
          return <Fragment key={span._key}>{span.text}</Fragment>;
        }
        return (
          <CuratedIcon
            key={span._key}
            name={span.name}
            {...(iconClassName !== undefined && { className: iconClassName })}
            aria-hidden="true"
          />
        );
      })}
    </>
  );
}
