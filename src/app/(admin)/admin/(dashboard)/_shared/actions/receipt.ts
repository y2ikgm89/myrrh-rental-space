/**
 * 領収書再発行 Server Action の barrel (RECEIPT-USEDAT-P2)。
 *
 * `/admin/receipts/[serialNo]` から polymorphic に呼び出すための thin re-export。
 * 実装は下記 2 本に分かれている:
 *
 * - `reissueReservationReceipt` (`_shared/actions/reservation/receipt.ts`)
 *   Reservation 起点の領収書再発行 (advisor lock は Space namespace + Receipt namespace)
 * - `reissueEventRegistrationReceipt` (`_shared/actions/event-registration-receipt.ts`)
 *   EventRegistration 起点の領収書再発行
 *
 * どちらも `reissueReceiptCommand` (domain 側) を呼び出し、binding check
 * (`expectedReservationId` / `expectedEventRegistrationId`) で他方の receipt を
 * 誤って触るのを FORBIDDEN reject する。UI 側で receipt の由来を見て振り分ける。
 */
export { reissueReservationReceipt } from "./reservation/receipt";
export { reissueEventRegistrationReceipt } from "./event-registration-receipt";
