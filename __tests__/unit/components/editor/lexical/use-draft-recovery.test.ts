/**
 * useDraftRecovery 純粋関数テスト
 *
 * `shouldOfferDraftRestore` のみを対象とする（React hook 本体は LocalStorage /
 * useState に依存するため、判定ロジックを切り出した素の関数で検証する）。
 */

import { describe, test, expect } from "bun:test";
import { shouldOfferDraftRestore } from "@/admin/components/editor/lexical/use-draft-recovery";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";

const VALID_DRAFT_JSON = JSON.stringify({
  root: {
    children: [
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            text: "下書きの本文",
            type: "text",
            version: 1,
          },
        ],
        direction: "ltr",
        format: "",
        indent: 0,
        type: "paragraph",
        version: 1,
      },
    ],
    direction: "ltr",
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
});

const LEGACY_EMPTY_ROOT_ONLY =
  '{"root":{"children":[],"direction":null,"format":"","indent":0,"type":"root","version":1}}';

describe("shouldOfferDraftRestore", () => {
  test("下書きが存在しない場合は false", () => {
    expect(shouldOfferDraftRestore(null, EMPTY_LEXICAL_EDITOR_STATE_JSON)).toBe(
      false,
    );
  });

  test("下書きが現在の初期コンテンツと同一の場合は false", () => {
    const draft = { json: EMPTY_LEXICAL_EDITOR_STATE_JSON, savedAt: "123" };
    expect(
      shouldOfferDraftRestore(draft, EMPTY_LEXICAL_EDITOR_STATE_JSON),
    ).toBe(false);
  });

  test("下書きが初期コンテンツと異なり、有効な EditorState JSON の場合は true", () => {
    const draft = { json: VALID_DRAFT_JSON, savedAt: "123" };
    expect(
      shouldOfferDraftRestore(draft, EMPTY_LEXICAL_EDITOR_STATE_JSON),
    ).toBe(true);
  });

  test("下書きが壊れた JSON（パース不能）の場合は false（黙って無視）", () => {
    const draft = { json: "not-json", savedAt: "123" };
    expect(
      shouldOfferDraftRestore(draft, EMPTY_LEXICAL_EDITOR_STATE_JSON),
    ).toBe(false);
  });

  test("下書きが Composer マウント不可の形式（root の子が空配列）の場合は false", () => {
    const draft = { json: LEGACY_EMPTY_ROOT_ONLY, savedAt: "123" };
    expect(
      shouldOfferDraftRestore(draft, EMPTY_LEXICAL_EDITOR_STATE_JSON),
    ).toBe(false);
  });

  test("初期コンテンツが既存の本文（EMPTY 以外）でも、下書きが異なれば true", () => {
    const existingContentJson = JSON.stringify({
      root: {
        children: [
          {
            children: [],
            direction: null,
            format: "",
            indent: 0,
            type: "paragraph",
            version: 1,
            textFormat: 0,
            textStyle: "",
          },
        ],
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    });
    const draft = { json: VALID_DRAFT_JSON, savedAt: "123" };
    expect(shouldOfferDraftRestore(draft, existingContentJson)).toBe(true);
  });
});
