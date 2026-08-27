import { describe, expect, test } from "bun:test";
import { SPACE_SCHEDULE_LOCK_NAMESPACE } from "@/shared/domain/advisory-lock-namespaces";

import {
  collectNowRelativeReservationSeeders,
  readSeedSource,
  type SeedReservationSeeder,
} from "../../helpers/seed-reservation-seeders";

/**
 * 予約 seed の作り直しが、**served な dev / staging DB でも安全**であることを
 * 機械強制する gate。
 *
 * 「消してから作る」は #1841 で入れた正しい構造だが、そのままでは 3 つの経路で
 * 本物のデータを壊す（いずれも Codex の指摘）:
 *
 * 1. **削除範囲**: 顧客 × スペースの直積には、開発者やテスターが UI から作った
 *    普通の予約も入る。marker が無いだけで消すと、手動データが seed のたびに
 *    恒久的に消え、レビュー等の子レコードまで cascade する
 * 2. **解錠番号**: `SmartLockPasscode` は `onDelete: Cascade`。予約を消すと
 *    **追跡レコードだけが消えて物理キーパッドの暗証番号は生きたまま残る**
 * 3. **同時実行**: tx の外で消すと削除〜再作成の隙間で枠が空く。その隙間に
 *    入った予約が EXCLUDE 制約と衝突し、半分だけ再構築された DB が残る
 *
 * 対象は「now 相対で予約を作る seed 関数」全部（監査 A-47）。`seedReservations`
 * 固定にしていたため、`seedDevCustomerAndReservations` がこの 3 点を満たさない
 * まま残っても緑だった。
 */

/**
 * 消せない行（会計証跡 / 生きた解錠番号）を retain する seeder は、その行を
 * `update` で宣言値へ揃える経路を持つ。
 *
 * retain したうえで宣言を `create` し直すと、**同じ notes の行が 2 件並ぶ**。
 * 実測: `[E2E] 過去・決済済み予約` が 2 件になり、`findFirst` が付ける
 * SpaceReview は片方にしか付かないため、`reviews.spec.ts` が invocation 単位で
 * 10/10 通ったり 10/10 落ちたりしていた。
 */
function refreshesRetainedRows(body: string): boolean {
  if (!/receipt\s*!==\s*null/u.test(body)) return true;
  return /reservation\.update\(/u.test(body);
}

function seeders(): SeedReservationSeeder[] {
  const found = collectNowRelativeReservationSeeders();
  // 走査規模の下限。切り出しが壊れて 0 件になったら全 assertion が空振りする。
  expect(found.length).toBeGreaterThan(1);
  return found;
}

describe("予約 seed の作り直しの安全性", () => {
  test("削除は seed 由来と証明できる行だけを対象にする", () => {
    for (const { name, body } of seeders()) {
      expect({
        name,
        // 顧客 × スペースだけの直積へ戻っていないこと。削除条件には必ず
        // 宣言済み notes の完全一致が並んでいる必要がある。
        exactNotes: /notes:\s*\{\s*in:\s*declared\w*Notes\s*\}/u.test(body),
        // allowlist を手書きに戻さない（宣言そのものから導出する）。
        derived: /declared\w*Notes\s*=\s*\[\s*\.\.\.new Set\(/u.test(body),
      }).toEqual({ name, exactNotes: true, derived: true });
    }
  });

  test("生きた解錠番号を持つ予約を消さない", () => {
    for (const { name, body } of seeders()) {
      expect({
        name,
        passcodes: body.includes("smartLockPasscodes"),
        activeOnly:
          /status:\s*\{\s*in:\s*\["PENDING",\s*"CONFIRMED"\]\s*\}/u.test(body),
        // 残した理由を黙らせない。
        reason: body.includes("live keypad passcode"),
      }).toEqual({ name, passcodes: true, activeOnly: true, reason: true });
    }
  });

  test("削除と再作成を advisory lock 付きの単一 tx で行う", () => {
    const LOCK = /lockSpaceForSeedTransaction\(tx, [\w.]+\)/u;

    for (const { name, body } of seeders()) {
      expect({
        name,
        tx: body.includes("prisma.$transaction("),
        lock: LOCK.test(body),
        // 既定の 5 秒では作り直しに足りない。
        timeout: /timeout:\s*\d[\d_]*,/u.test(body),
      }).toEqual({ name, tx: true, lock: true, timeout: true });

      // lock → delete → create の順序が正しさの実体。
      const lockAt = body.search(LOCK);
      const deleteAt = body.indexOf("tx.reservation.deleteMany(");
      const createAt = body.indexOf("tx.reservation.create(");

      expect(lockAt).toBeGreaterThan(-1);
      expect(lockAt).toBeLessThan(deleteAt);
      expect(deleteAt).toBeLessThan(createAt);
    }
  });

  test("消せなかった行は作り直さずその場で更新する", () => {
    for (const { name, body } of seeders()) {
      expect({ name, refreshes: refreshesRetainedRows(body) }).toEqual({
        name,
        refreshes: true,
      });
    }
  });

  test("retain したまま create し直す形を落とす", () => {
    const retainThenCreate = `
      const retained = existing.filter((r) => r.receipt !== null);
      await tx.reservation.deleteMany({ where: { id: { in: disposable } } });
      await tx.reservation.create({ data });
    `;
    const retainThenUpdate = `
      const retained = existing.filter((r) => r.receipt !== null);
      await tx.reservation.update({ where: { id: retainedId }, data });
      await tx.reservation.create({ data });
    `;
    // retain しない seeder には要求しない。
    const deleteAllThenCreate = `
      await tx.reservation.deleteMany({ where: { id: { in: disposable } } });
      await tx.reservation.create({ data });
    `;

    expect({
      retainThenCreate: refreshesRetainedRows(retainThenCreate),
      retainThenUpdate: refreshesRetainedRows(retainThenUpdate),
      deleteAllThenCreate: refreshesRetainedRows(deleteAllThenCreate),
    }).toEqual({
      retainThenCreate: false,
      retainThenUpdate: true,
      deleteAllThenCreate: true,
    });
  });

  test("advisory lock の namespace が domain 側と一致する", () => {
    const seedNamespace = /const SEED_SPACE_LOCK_NAMESPACE = (\d+);/u.exec(
      readSeedSource(),
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
