/**
 * useDraftRecovery テスト
 *
 * 2 グループに分かれる:
 * 1. `shouldOfferDraftRestore`（純粋関数）— 復元候補判定 + 有効期限判定
 * 2. `useDraftRecovery` のハイドレーション安全性 — `renderToString`（Next.js の
 *    SSR パスと同じ API）を直接使い、LocalStorage に下書きがあっても SSR 相当の
 *    出力が常にバナー非表示であることを検証する。
 *
 * (2) について: `useDraftRecovery` は `useSyncExternalStore` の
 * `getServerSnapshot` を常に `null` にすることで、SSR 時（LocalStorage 不可）と
 * client hydration 直後の初回レンダーの markup を一致させ、hydration mismatch を
 * 回避している。修正前の実装（`useState` lazy initializer で直接
 * `getDraftJson` を呼ぶ）は、この bun test 環境の LocalStorage は JSDOM が
 * グローバル提供するため `renderToString` 呼び出し中にも読めてしまい、
 * この回帰テストが red になる（= 検出力がある）。
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { installJSDOMForTests } from "../../../../setup-dom";
import {
  shouldOfferDraftRestore,
  useDraftRecovery,
  DRAFT_RECOVERY_EXPIRY_MS,
} from "@/admin/components/editor/lexical/use-draft-recovery";
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

// expiry 判定と無関係なテスト（下書きの存在 / 内容差分 / JSON 妥当性のみを見たい）は
// 「十分に新しい」保存日時を使い、有効期限チェックで意図せず false 化しないようにする。
const RECENT_SAVED_AT = String(Date.now());

describe("shouldOfferDraftRestore", () => {
  test("下書きが存在しない場合は false", () => {
    expect(shouldOfferDraftRestore(null, EMPTY_LEXICAL_EDITOR_STATE_JSON)).toBe(
      false,
    );
  });

  test("下書きが現在の初期コンテンツと同一の場合は false", () => {
    const draft = {
      json: EMPTY_LEXICAL_EDITOR_STATE_JSON,
      savedAt: RECENT_SAVED_AT,
    };
    expect(
      shouldOfferDraftRestore(draft, EMPTY_LEXICAL_EDITOR_STATE_JSON),
    ).toBe(false);
  });

  test("下書きが初期コンテンツと異なり、有効な EditorState JSON の場合は true", () => {
    const draft = { json: VALID_DRAFT_JSON, savedAt: RECENT_SAVED_AT };
    expect(
      shouldOfferDraftRestore(draft, EMPTY_LEXICAL_EDITOR_STATE_JSON),
    ).toBe(true);
  });

  test("下書きが壊れた JSON（パース不能）の場合は false（黙って無視）", () => {
    const draft = { json: "not-json", savedAt: RECENT_SAVED_AT };
    expect(
      shouldOfferDraftRestore(draft, EMPTY_LEXICAL_EDITOR_STATE_JSON),
    ).toBe(false);
  });

  test("下書きが Composer マウント不可の形式（root の子が空配列）の場合は false", () => {
    const draft = { json: LEGACY_EMPTY_ROOT_ONLY, savedAt: RECENT_SAVED_AT };
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
    const draft = { json: VALID_DRAFT_JSON, savedAt: RECENT_SAVED_AT };
    expect(shouldOfferDraftRestore(draft, existingContentJson)).toBe(true);
  });

  describe("有効期限（DRAFT_RECOVERY_EXPIRY_MS）", () => {
    const NOW = 1_700_000_000_000; // 固定基準時刻（2023-11-14T22:13:20.000Z）

    test("保存から有効期限以内なら true", () => {
      const draft = { json: VALID_DRAFT_JSON, savedAt: String(NOW - 1_000) };
      expect(
        shouldOfferDraftRestore(draft, EMPTY_LEXICAL_EDITOR_STATE_JSON, NOW),
      ).toBe(true);
    });

    test("保存からちょうど有効期限（境界）なら true（超過のみ無視）", () => {
      const draft = {
        json: VALID_DRAFT_JSON,
        savedAt: String(NOW - DRAFT_RECOVERY_EXPIRY_MS),
      };
      expect(
        shouldOfferDraftRestore(draft, EMPTY_LEXICAL_EDITOR_STATE_JSON, NOW),
      ).toBe(true);
    });

    test("保存から有効期限を超えて経過した場合は false（黙って無視）", () => {
      const draft = {
        json: VALID_DRAFT_JSON,
        savedAt: String(NOW - DRAFT_RECOVERY_EXPIRY_MS - 1),
      };
      expect(
        shouldOfferDraftRestore(draft, EMPTY_LEXICAL_EDITOR_STATE_JSON, NOW),
      ).toBe(false);
    });

    test("保存日時が数値化できない不正値の場合は false（不正な保存日時は無視）", () => {
      const draft = { json: VALID_DRAFT_JSON, savedAt: "not-a-timestamp" };
      expect(
        shouldOfferDraftRestore(draft, EMPTY_LEXICAL_EDITOR_STATE_JSON, NOW),
      ).toBe(false);
    });

    test("Space の create フォームのような *-new 下書きも、古くなれば復元候補から自然に外れる", () => {
      // createSpaceAction / updateSpaceAction はサーバー側 redirect() のため、
      // クライアント側で保存成功後に確実に clearDraft できない（PR#1341 followup
      // 指摘）。expiry がこのギャップを「時間経過で自然に収束させる」安全弁になる
      // ことをこのテストで固定する。
      const staleDraft = {
        json: VALID_DRAFT_JSON,
        savedAt: String(NOW - DRAFT_RECOVERY_EXPIRY_MS * 2),
      };
      expect(
        shouldOfferDraftRestore(
          staleDraft,
          EMPTY_LEXICAL_EDITOR_STATE_JSON,
          NOW,
        ),
      ).toBe(false);
    });
  });
});

describe("useDraftRecovery のハイドレーション安全性（SSR 出力）", () => {
  beforeEach(() => {
    installJSDOMForTests();
    localStorage.clear();
  });

  function ProbeBanner({ autoSaveKey }: { autoSaveKey: string }) {
    const { isAvailable } = useDraftRecovery({
      autoSaveKey,
      initialContentJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
      onRestore: () => {},
    });
    return isAvailable
      ? createElement("div", { "data-testid": "draft-banner" }, "下書きあり")
      : null;
  }

  test("LocalStorage に有効な下書きがあっても、renderToString（SSR相当）の出力はバナーを含まない", () => {
    localStorage.setItem(
      "lexical-draft:hydration-safety-key",
      VALID_DRAFT_JSON,
    );
    localStorage.setItem(
      "lexical-draft-time:hydration-safety-key",
      String(Date.now()),
    );

    const html = renderToString(
      createElement(ProbeBanner, { autoSaveKey: "hydration-safety-key" }),
    );

    // `useSyncExternalStore` の getServerSnapshot が常に null を返すため、
    // LocalStorage の中身に関わらず SSR 出力は空になる。これが崩れる
    // （＝ 修正前のように useState lazy initializer で直接 LocalStorage を
    // 読む実装に戻る）と、この bun test 環境では JSDOM が LocalStorage を
    // グローバル提供しているため renderToString の時点でバナーが出力されて
    // しまい、このアサーションが red になる。
    expect(html).toBe("");
    expect(html).not.toContain("draft-banner");
  });

  test("下書きが無い場合も renderToString の出力はバナーを含まない（比較対照）", () => {
    const html = renderToString(
      createElement(ProbeBanner, { autoSaveKey: "no-draft-key" }),
    );
    expect(html).toBe("");
  });
});
