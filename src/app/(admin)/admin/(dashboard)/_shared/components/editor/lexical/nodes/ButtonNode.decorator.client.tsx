"use client";

import type { ReactElement } from "react";
import type { NodeKey } from "lexical";
import { $getNodeByKey, $getState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import {
  $isButtonNode,
  buttonAlignmentState,
  buttonColorState,
  buttonHrefState,
  buttonLabelState,
  buttonOpenInNewTabState,
  buttonSizeState,
  buttonVariantState,
} from "./ButtonNode";
import {
  getDecoratorStringProp,
  registerLexicalDecorator,
} from "./decorator-registry";

function ButtonComponent({
  nodeKey,
}: {
  nodeKey: NodeKey;
}): ReactElement | null {
  const [editor] = useLexicalComposerContext();

  const state = editor.read(() => {
    const node = $getNodeByKey(nodeKey);
    if (!$isButtonNode(node)) return null;
    return {
      label: $getState(node, buttonLabelState),
      href: $getState(node, buttonHrefState),
      variant: $getState(node, buttonVariantState),
      size: $getState(node, buttonSizeState),
      alignment: $getState(node, buttonAlignmentState),
      color: $getState(node, buttonColorState),
      openInNewTab: $getState(node, buttonOpenInNewTabState),
    };
  });

  if (!state) return null;

  return (
    <div
      data-lexical-node-key={nodeKey}
      data-button="true"
      data-button-alignment={state.alignment}
      data-button-variant={state.variant}
      data-button-size={state.size}
      {...(state.color !== "default" && { "data-color": state.color })}
    >
      <a
        href={state.href}
        {...(state.openInNewTab && {
          target: "_blank",
          rel: "noreferrer",
        })}
        draggable={false}
        onClick={(e) => e.preventDefault()}
      >
        {state.label.map((span) => {
          if (span._type === "span") {
            return <span key={span._key}>{span.text}</span>;
          }
          return (
            <CuratedIcon key={span._key} name={span.name} aria-hidden="true" />
          );
        })}
      </a>
    </div>
  );
}

registerLexicalDecorator("button", (props) => {
  const nodeKey = getDecoratorStringProp(props, "nodeKey");
  return nodeKey === null ? null : <ButtonComponent nodeKey={nodeKey} />;
});
