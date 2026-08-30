/**
 * Horizontal Rule Plugin
 *
 * @description 区切り線（`<hr>`）を挿入するプラグイン。コマンド登録のみ。
 *
 * `@lexical/react/LexicalHorizontalRulePlugin` の置き換え。あちらは
 * `@deprecated` で「extension API で組むなら `HorizontalRuleExtension` を使え」と
 * 案内するが、このエディタは `LexicalComposer`（JSX で plugin を並べる構成）なので
 * その移行先は当てはまらない。中身は 20 行程度のコマンド登録で、依存する
 * `INSERT_HORIZONTAL_RULE_COMMAND` / `$createHorizontalRuleNode` は
 * `@lexical/extension` に**非推奨マーカー無し**で存在する（`@lexical/react` 側は
 * それを re-export しているだけで、コマンドは同一オブジェクト）。
 * ノードは既に `config/nodes.ts` が `@lexical/extension` から取っている。
 * よってローカルに置き直すのが、アーキテクチャを変えずに非推奨を外す最短経路。
 */

"use client";

import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createHorizontalRuleNode,
  INSERT_HORIZONTAL_RULE_COMMAND,
} from "@lexical/extension";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
} from "lexical";

/**
 * 区切り線を現在の選択位置の最近接 root に挿入する。
 *
 * range 選択でないとき（ノード選択・非選択）は挿入位置が決まらないので `false` を
 * 返して他の handler に委ねる。上流の実装と同じ判定。
 *
 * plugin 本体から切り出してあるのは、headless editor で振る舞いを固定するため
 * （React を立ち上げずに dispatch 相当を検査できる）。
 */
export function $insertHorizontalRuleAtSelection(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return false;
  }
  $insertNodeToNearestRoot($createHorizontalRuleNode());
  return true;
}

export function HorizontalRulePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      INSERT_HORIZONTAL_RULE_COMMAND,
      $insertHorizontalRuleAtSelection,
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);

  return null;
}
