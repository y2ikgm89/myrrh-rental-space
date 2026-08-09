import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { SPACE_SCHEDULE_LOCK_NAMESPACE } from "@/shared/domain/advisory-lock-namespaces";

/**
 * デモ予約の作り直しが、**served な dev / staging DB でも安全**であることを
 * 機械強制する gate。
 *
 * 「消してから作る」は #1841 で入れた正しい構造だが、そのままでは 3 つの経路で
 * 本物のデータを壊す（いずれも Codex の指摘）:
 *
 * 1. **削除範囲**: 「デモ顧客 × デモスペース」の直積には、開発者やテスターが
 *    UI から作った普通の予約も入る。marker が無いだけで消すと、手動データが
 *    seed のたびに恒久的に消え、レビュー等の子レコードまで cascade する
 * 2. **解錠番号**: `SmartLockPasscode` は `onDelete: Cascade`。予約を消すと
 *    **追跡レコードだけが消えて物理キーパッドの暗証番号は生きたまま残る**
 * 3. **同時実行**: tx の外で消すと削除〜再作成の隙間で枠が空く。その隙間に
 *    入った予約が EXCLUDE 制約と衝突し、半分だけ再構築された DB が残る
 */

const root = process.cwd();
const SEED = join(root, "prisma/seed.ts");

function seedReservationsBody(): string {
  const source = readFileSync(SEED, "utf8");
  const match = /async function seedReservations\(\)[\s\S]*?\n\}/u.exec(source);
  if (!match) {
    throw new Error("seedReservations が見つかりません");
  }
  return match[0];
}

describe("デモ予約の作り直しの安全性", () => {
  test("削除は seed 由来と証明できる行だけを対象にする", () => {
    const body = seedReservationsBody();

    // 「デモ顧客 × デモスペース」だけの直積へ戻っていないこと。marker 導入前の
    // 行を拾う枝には、必ず宣言済み notes の完全一致が並んでいる必要がある。
    expect(body).toContain("notes: { in: declaredDemoNotes }");

    // allowlist を手書きに戻さない（宣言そのものから導出する）。
    expect(body).toMatch(/declaredDemoNotes\s*=\s*\[\s*\.\.\.new Set\(/u);
  });

  test("生きた解錠番号を持つ予約を消さない", () => {
    const body = seedReservationsBody();

    expect(body).toContain("smartLockPasscodes");
    expect(body).toMatch(
      /status:\s*\{\s*in:\s*\["PENDING",\s*"CONFIRMED"\]\s*\}/u,
    );
    // 残した理由を黙らせない。
    expect(body).toContain("live keypad passcode");
  });

  test("削除と再作成を advisory lock 付きの単一 tx で行う", () => {
    const body = seedReservationsBody();

    expect(body).toContain("prisma.$transaction(");
    expect(body).toContain("lockSpaceForSeedTransaction(tx, spaceId)");

    // lock → delete → create の順序が正しさの実体。
    const lockAt = body.indexOf("lockSpaceForSeedTransaction(tx, spaceId)");
    const deleteAt = body.indexOf("tx.reservation.deleteMany(");
    const createAt = body.indexOf("tx.reservation.create(");

    expect(lockAt).toBeGreaterThan(-1);
    expect(lockAt).toBeLessThan(deleteAt);
    expect(deleteAt).toBeLessThan(createAt);

    // 既定の 5 秒では 50 行の作り直しに足りない。
    expect(body).toMatch(/timeout:\s*\d[\d_]*,/u);
  });

  test("advisory lock の namespace が domain 側と一致する", () => {
    const seed = readFileSync(SEED, "utf8");

    const seedNamespace = /const SEED_SPACE_LOCK_NAMESPACE = (\d+);/u.exec(
      seed,
    );
    if (!seedNamespace?.[1]) {
      throw new Error("seed の advisory lock namespace 宣言が見つかりません");
    }

    // ずれると「ロックを取っているのに直列化されない」という最悪の壊れ方をする。
    // seed は `space-locks.ts` を import できない（`import "server-only"`）ので
    // 値の一致はここでしか守れない。突き合わせ先は採番の SSoT。
    expect(Number(seedNamespace[1])).toBe(SPACE_SCHEDULE_LOCK_NAMESPACE);
  });
});
