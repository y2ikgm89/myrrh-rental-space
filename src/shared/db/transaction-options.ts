/** 予約・決済 prepare 等の書込ホットパス向け interactive tx 上限。 */
export const RESERVATION_WRITE_TX_OPTIONS = {
  maxWait: 5000,
  timeout: 10_000,
} as const;
