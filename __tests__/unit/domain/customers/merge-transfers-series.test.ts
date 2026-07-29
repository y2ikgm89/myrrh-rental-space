/**
 * mergeCustomerCommand が tx.customer.delete の前に ReservationSeries も transfer する
 * ことを静的に強制する drift-gate。
 *
 * # 背景
 *
 * Customer FK を持つ model は onDelete: Cascade を宣言している (Reservation,
 * ReservationSeries, SpaceReview) か SetNull (Inquiry, EventRegistration,
 * TermsAgreement)。mergeCustomerCommand は tx.customer.delete で source を消す
 * 前に、Cascade 関係を全部 target に transfer する必要がある。旧実装は
 * Reservation/Inquiry/SpaceReview/EventRegistration の 4 relation のみ transfer し、
 * ReservationSeries が抜けていた (Round-4 audit Finding #3 / high)。
 *
 * source.delete の cascade で ReservationSeries は物理削除され、直前に updateMany
 * された Reservation の seriesId は seriesId FK の onDelete: SetNull で null に
 * 書き換わっていた ── 課金と将来予約の統計が silent に壊れる。
 *
 * # gate
 *
 * mergeCustomerCommand の関数 body 内で:
 *  1. tx.reservationSeries.updateMany が呼ばれること
 *  2. その呼出しが tx.customer.delete より **前** に現れること
 * を regex + 位置比較で強制する。将来 relation が増えて re-audit したときに気付く
 * ためのアンカー。
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");
const SRC = resolve(
  REPO_ROOT,
  "src",
  "shared",
  "domain",
  "customers",
  "customer-lifecycle-commands.ts",
);

describe("mergeCustomerCommand transfers all cascade relations before delete", () => {
  const source = readFileSync(SRC, "utf8");

  // Locate mergeCustomerCommand declaration and take everything from there to EOF.
  // File-wide: `tx.customer.delete` is unique to mergeCustomerCommand (siblings
  // anonymizeCustomerCommand call tx.user.delete, not tx.customer.delete), so the
  // first hit after the declaration is definitively inside mergeCustomerCommand.
  // We deliberately skip strict body-extraction because the function's signature
  // contains a `Promise<{ ... }>` block whose `{` would confuse a naive scanner.
  const mergeStart = source.search(
    /export\s+async\s+function\s+mergeCustomerCommand\s*\(/,
  );

  test("mergeCustomerCommand declaration is present", () => {
    expect(mergeStart).toBeGreaterThanOrEqual(0);
  });

  test("tx.reservationSeries.updateMany appears inside mergeCustomerCommand", () => {
    const rest = source.slice(mergeStart);
    expect(
      rest.search(/tx\.reservationSeries\.updateMany\s*\(/),
    ).toBeGreaterThan(0);
  });

  test("tx.reservationSeries.updateMany appears BEFORE tx.customer.delete", () => {
    const rest = source.slice(mergeStart);
    // regex に `\(` を要求してコメント内の言及 (`tx.customer.delete が …`) を除外
    const seriesIdx = rest.search(/tx\.reservationSeries\.updateMany\s*\(/);
    const deleteIdx = rest.search(/tx\.customer\.delete\s*\(/);
    expect(seriesIdx).toBeGreaterThan(0);
    expect(deleteIdx).toBeGreaterThan(0);
    expect(seriesIdx).toBeLessThan(deleteIdx);
  });

  // InquiryReply.authorCustomerId / InquiryAttachment.uploadedByCustomerId は
  // onDelete: Restrict — transfer しないと source の tx.customer.delete が
  // FK 制約で失敗する (Inquiry Overhaul Phase 1 で追加された Customer FK)。
  test("tx.inquiryReply.updateMany appears BEFORE tx.customer.delete", () => {
    const rest = source.slice(mergeStart);
    const replyIdx = rest.search(/tx\.inquiryReply\.updateMany\s*\(/);
    const deleteIdx = rest.search(/tx\.customer\.delete\s*\(/);
    expect(replyIdx).toBeGreaterThan(0);
    expect(deleteIdx).toBeGreaterThan(0);
    expect(replyIdx).toBeLessThan(deleteIdx);
  });

  test("tx.inquiryAttachment.updateMany appears BEFORE tx.customer.delete", () => {
    const rest = source.slice(mergeStart);
    const attachmentIdx = rest.search(/tx\.inquiryAttachment\.updateMany\s*\(/);
    const deleteIdx = rest.search(/tx\.customer\.delete\s*\(/);
    expect(attachmentIdx).toBeGreaterThan(0);
    expect(deleteIdx).toBeGreaterThan(0);
    expect(attachmentIdx).toBeLessThan(deleteIdx);
  });

  test("return shape declares transferredSeries: number", () => {
    // signature の Promise<{ ... transferredSeries: number; ... }> をチェック
    expect(source).toMatch(/transferredSeries\s*:\s*number/);
  });
});
