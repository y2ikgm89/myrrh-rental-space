/**
 * スペース詳細など公開予約 UI の決済説明 copy。
 * `isOnlinePaymentAvailable()` の結果に応じて文言を返す。
 */
export function getReservationPaymentDisplayCopy(
  onlinePaymentAvailable: boolean,
): string {
  return onlinePaymentAvailable
    ? "オンライン決済に対応しています"
    : "事前決済不要";
}
