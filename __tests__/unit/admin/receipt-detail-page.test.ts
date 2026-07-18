import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

/**
 * RECEIPT-USEDAT-P2 (`/admin/receipts/[serialNo]`) の配線 drift gate。
 *
 * source-text ベースで最小限の invariants を pin する:
 * 1. detail page / dialog / chain 可視化コンポーネントが存在する
 * 2. `Receipt.usedAt` を「使用済み / 未使用」pill として表示している
 * 3. reissue dialog に「acknowledgement checkbox」が組み込まれている
 * 4. Reservation 詳細ページから領収書詳細ページへの link が張られている
 * 5. Guest-side self-serve resend を実装していない (page.tsx コメントで policy を明記)
 */
describe("admin receipt detail page (RECEIPT-USEDAT-P2)", () => {
  const pagePath = join(
    root,
    "src/app/(admin)/admin/(dashboard)/receipts/[serialNo]/page.tsx",
  );
  const viewPath = join(
    root,
    "src/app/(admin)/admin/(dashboard)/receipts/[serialNo]/_components/ReceiptDetailView.tsx",
  );
  const dialogPath = join(
    root,
    "src/app/(admin)/admin/(dashboard)/receipts/[serialNo]/_components/ReceiptReissueDialog.tsx",
  );
  const chainPath = join(
    root,
    "src/app/(admin)/admin/(dashboard)/receipts/[serialNo]/_components/ReceiptRevisionChain.tsx",
  );
  const queryPath = join(
    root,
    "src/app/(admin)/admin/(dashboard)/_shared/queries/receipt.ts",
  );
  const reservationDetailPath = join(
    root,
    "src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail.tsx",
  );

  test("required files exist", () => {
    expect(existsSync(pagePath)).toBe(true);
    expect(existsSync(viewPath)).toBe(true);
    expect(existsSync(dialogPath)).toBe(true);
    expect(existsSync(chainPath)).toBe(true);
    expect(existsSync(queryPath)).toBe(true);
  });

  test("detail page uses AdminDetailLayout + connection() + generateMetadata", () => {
    const source = readFileSync(pagePath, "utf8");
    expect(source).toContain("AdminDetailLayout");
    expect(source).toContain("await connection()");
    expect(source).toContain("generateMetadata");
    expect(source).toContain("getReceiptDetailBySerialNo");
  });

  test("detail view visualizes usedAt pill (used / unused) + revision chain", () => {
    const source = readFileSync(viewPath, "utf8");
    expect(source).toContain("使用済み");
    expect(source).toContain("未使用");
    expect(source).toContain("ReceiptRevisionChain");
    expect(source).toContain("ReceiptReissueDialog");
  });

  test("detail view polymorphically dispatches to reservation or event-registration reissue action", () => {
    const source = readFileSync(viewPath, "utf8");
    expect(source).toContain("reissueReservationReceipt");
    expect(source).toContain("reissueEventRegistrationReceipt");
  });

  test("detail view blocks reissue on orphaned or already-superseded receipts", () => {
    const source = readFileSync(viewPath, "utf8");
    // orphan (both FK null) と down-chain 有り (再発行済) は canReissue = false
    expect(source).toContain("isOrphaned");
    expect(source).toContain("hasDownChain");
    expect(source).toContain("canReissue");
  });

  test("reissue dialog requires acknowledgement checkbox + reason", () => {
    const source = readFileSync(dialogPath, "utf8");
    expect(source).toContain("Checkbox");
    expect(source).toContain("acknowledged");
    // reason min length は 5 (説明責任 + 監査品質)
    expect(source).toContain("REASON_MIN = 5");
  });

  test("reservation detail page links to receipt detail page", () => {
    const source = readFileSync(reservationDetailPath, "utf8");
    // Link from reservation.receipt.serialNo → /admin/receipts/${serialNo}
    expect(source).toContain("/admin/receipts/${reservation.receipt.serialNo}");
  });

  test("page documents guest-side self-serve resend policy (not implemented)", () => {
    const source = readFileSync(pagePath, "utf8");
    // strict single-use を defeat しないため self-serve は実装しない旨を doc comment に記載
    expect(source).toContain("セルフサービス");
    expect(source).toContain("strict single-use");
  });

  test("admin receipt query gates by admin permission (reservation:read)", () => {
    const source = readFileSync(queryPath, "utf8");
    expect(source).toContain("requireAdminPermission");
    expect(source).toContain("reservation");
  });
});
