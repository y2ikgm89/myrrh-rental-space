/**
 * `SettingsSidebar.sidebarWidgets` は **配列**で保存する。
 *
 * かつては `{search: true, recent: true, ...}` のオブジェクトだった。配列にしたのは
 * ウィジェットの**順序**と per-widget の設定（`layout` / `showRanking`）を持たせるため。
 * オブジェクトへ戻ると順序が失われ、管理画面の並び替えが保存できなくなる。
 *
 * ## 検査の置き場
 *
 * 以前はここに「旧 `settings` テーブルの行をオブジェクトから配列へ変換した migration」と
 * 「`settings_sidebars` へコピーした migration」を名指しで検査するテストがあった。
 * どちらも**一度きりの移行操作**で不変条件ではない。移行元の `settings` テーブルは
 * 既に存在せず、migration 履歴を 1 本の baseline へ畳めば文ごと消える。
 *
 * 残すべき保証は 2 つだけ:
 * - schema の既定値が配列であること（新規行が正しい形で始まる）
 * - DB の CHECK が配列以外を拒むこと（Prisma を経由しない書込への最後の壁）
 */

import { describe, expect, test } from "bun:test";

import {
  readDatabaseInvariants,
  readPrismaSchema,
} from "../../support/prisma-sources";

const CANONICAL_DEFAULT =
  '[{\\"type\\":\\"search\\",\\"enabled\\":true},{\\"type\\":\\"recent\\",\\"enabled\\":true,\\"layout\\":\\"compact\\"},{\\"type\\":\\"popular\\",\\"enabled\\":true,\\"layout\\":\\"compact\\",\\"showRanking\\":true},{\\"type\\":\\"categories\\",\\"enabled\\":true},{\\"type\\":\\"tags\\",\\"enabled\\":true}]';

describe("sidebar DB invariants", () => {
  test("Prisma schema stores sidebarWidgets with the canonical array default", () => {
    const schema = readPrismaSchema();

    expect(schema).toContain(
      `sidebarWidgets      Json    @default("${CANONICAL_DEFAULT}")`,
    );
    expect(schema).toContain('@@map("settings_sidebar")');
    // 旧オブジェクト形の既定値に戻っていないこと。
    expect(schema).not.toContain(
      '@default("{\\"search\\":true,\\"recent\\":true,\\"popular\\":true,\\"categories\\":true,\\"tags\\":true}")',
    );
  });

  test("配列以外の sidebarWidgets を DB が拒む", () => {
    const invariants = readDatabaseInvariants();

    // Prisma DSL では表現できないので手書き CHECK として baseline に載せている。
    expect(invariants).toContain("SettingsSidebar_sidebarWidgets_array_check");
    expect(invariants).toContain(
      `CHECK ((jsonb_typeof("sidebarWidgets") = 'array'::text))`,
    );
  });
});
