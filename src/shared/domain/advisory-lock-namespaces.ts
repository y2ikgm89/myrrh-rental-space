/**
 * **PostgreSQL advisory lock namespace の採番レジストリ（SSoT）。**
 *
 * ## なぜコードに置くか
 *
 * この一覧はかつてエージェント設定側にあり、PR #2076 でその置き場ごと消えた。
 * 消えた後も 4 箇所が番号をリテラルで直書きしたまま残り、**次に採番する人が
 * 「今どこまで使われているか」を知る手段が無い**状態になっていた（衝突しても
 * 何も落ちない — 別ドメインの書込が黙って直列化されるだけで、症状は
 * 「たまに遅い」としか出ない）。
 *
 * 文書に戻すと同じことが起きるので、**定数として置いて全 call site に import
 * させる**。番号が 1 箇所にしか書かれていなければ、一覧は常に正しい。
 * リテラル直書きの再発は
 * `__tests__/unit/architecture/advisory-lock-namespace-registry.test.ts` が落とす。
 *
 * ## 採番規約
 *
 * - `728349` から連番。次に採る番号はこのファイルの最大値 + 1。
 * - 1 namespace = 1 つの「直列化したい単位」。別ドメインで共有しない
 *   （例外は `SPACE_SCHEDULE` — Reservation と EventTimeSlot が**同じ**
 *   スケジュール空間を奪い合うので、意図的に共有する）。
 * - key は `hashtext(<id>)` で second key に載せる。namespace 単体で取ると
 *   ドメイン全体が直列化する。
 *
 * ## 複数取得時の順序（deadlock 予防）
 *
 * 降順に取る。`728357` → `728351` → `728350`。個別の事情は
 * `src/shared/domain/events/waitlist-locks.ts` の docstring が持つ。
 *
 * ## session lock と xact lock
 *
 * `CALENDAR_SYNC` だけが session lock（`pg_try_advisory_lock` +
 * 明示 unlock）。それ以外は全て xact lock で、tx 終了時に自動解放される。
 * session lock は rollback でも解放されないので、取得側が unlock を持つ。
 * waitlist promote は 728354 session lock をやめ、`events.waitlist_promote_leased_until`
 * の row lease に移した。番号は再利用しない。
 */

/** calendar-sync cron の多重起動防止（**session lock**。明示 unlock が要る）。 */
export const CALENDAR_SYNC_LOCK_ID = 728349;

/** イベント申込の定員 TOCTOU 防止。key = eventId。 */
export const EVENT_REGISTRATION_LOCK_NAMESPACE = 728350;

/**
 * Space のスケジュール空間。key = spaceId / order scope。
 *
 * Reservation の書込・EventTimeSlot の書込・並び替えの order scope が
 * **同じ空間**を奪い合うので、3 者で共有する唯一の namespace。
 */
export const SPACE_SCHEDULE_LOCK_NAMESPACE = 728351;

/** Space の locationId / smartLockDeviceId 整合性。key = spaceId。 */
export const SPACE_DEVICE_CONSISTENCY_LOCK_NAMESPACE = 728352;

/** 領収書連番の採番（ReceiptSequence 単一行 + 予約単位）。 */
export const RECEIPT_LOCK_NAMESPACE = 728353;

/**
 * イベントキャンセル待ちの promote。session lock としては使わない
 * （row lease `events.waitlist_promote_leased_until` に移行済み）。
 * 番号は再利用しない。
 */
export const WAITLIST_PROMOTE_LOCK_NAMESPACE = 728354;

/** 予約単位の refund 直列化（over-refund / idempotency 破壊の防止）。 */
export const RESERVATION_REFUND_LOCK_NAMESPACE = 728355;

/** イベント申込単位の refund 直列化（`728355` と同型）。 */
export const EVENT_REGISTRATION_REFUND_LOCK_NAMESPACE = 728356;

/** ReservationSeries 単位。`728351` と併用するときは**先に**取る。 */
export const RESERVATION_SERIES_LOCK_NAMESPACE = 728357;

/** `Customer.flagReasons` の reconcile（複数 cron の lost update 防止）。 */
export const CUSTOMER_FLAG_REASONS_LOCK_NAMESPACE = 728358;

/**
 * 監査ログの hash chain。上の連番とは別系統の int8 単一キー
 * （`pg_advisory_xact_lock(bigint)` の 1 引数形）。
 *
 * `audit-log/hash-chain-core.ts` はこれを re-export するだけで、自前の定義を
 * 持たない。2 箇所に書くと「レジストリが広告している鍵」と「実際に
 * PostgreSQL が掴む鍵」がずれても誰も気づけない。
 */
export const AUDIT_LOG_CHAIN_LOCK_KEY = 6_029_451_381_908_262_157n;

/**
 * 連番 namespace の全件。次の採番は `Math.max(...) + 1`。
 *
 * gate がこの配列を使って「リテラル直書きが無いこと」と
 * 「重複が無いこと」を検査する。
 */
export const ADVISORY_LOCK_NAMESPACES = [
  CALENDAR_SYNC_LOCK_ID,
  EVENT_REGISTRATION_LOCK_NAMESPACE,
  SPACE_SCHEDULE_LOCK_NAMESPACE,
  SPACE_DEVICE_CONSISTENCY_LOCK_NAMESPACE,
  RECEIPT_LOCK_NAMESPACE,
  WAITLIST_PROMOTE_LOCK_NAMESPACE,
  RESERVATION_REFUND_LOCK_NAMESPACE,
  EVENT_REGISTRATION_REFUND_LOCK_NAMESPACE,
  RESERVATION_SERIES_LOCK_NAMESPACE,
  CUSTOMER_FLAG_REASONS_LOCK_NAMESPACE,
] as const;
