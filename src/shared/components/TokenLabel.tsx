/**
 * TokenLabel — ButtonLabelToken[] を順次 render する共有コンポーネント
 *
 * Sanity Portable Text 互換の token 配列を React node に展開する。
 * Server / Client 両方の context で同期描画可能（CuratedIcon は SSR safe）。
 *
 * 利用箇所: Button / MagneticButton (公開) / site-header / site-footer のナビ /
 * SortableNavItem の preview。
 */

import { Fragment, type ReactElement } from "react";
import { CuratedIcon } from "./icon-curation/CuratedIcon";
import {
  isIconToken,
  isTextToken,
  type ButtonLabelToken,
} from "@/shared/lib/sections/definitions/_shared/button-label";

interface TokenLabelProps {
  readonly tokens: ButtonLabelToken[];
  /** icon token の className（呼び出し側で size 指定: "h-3 w-3" / "h-4 w-4" / "h-5 w-5" 等） */
  readonly iconClassName?: string;
}

export function TokenLabel({
  tokens,
  iconClassName,
}: TokenLabelProps): ReactElement {
  return (
    <>
      {tokens.map((token, i) => {
        if (isTextToken(token)) {
          return <Fragment key={i}>{token.value}</Fragment>;
        }
        if (isIconToken(token)) {
          return (
            <CuratedIcon
              key={i}
              name={token.name}
              {...(iconClassName !== undefined && { className: iconClassName })}
              aria-hidden="true"
            />
          );
        }
        return null;
      })}
    </>
  );
}
