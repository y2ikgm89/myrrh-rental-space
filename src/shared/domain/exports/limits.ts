import "server-only";

/**
 * 管理画面 CSV / XLSX export の行数上限（SSoT）。
 *
 * ## なぜ 1 箇所に置くのか（監査 A-32）
 *
 * 5 本の export route のうち上限を持っていたのは 2 本だけで、しかもそれぞれが
 * 自前の定数（`AUDIT_LOG_EXPORT_LIMIT` / `MAX_EXPORT_ROWS`）を持っていた。
 * 残り 3 本（customers / reservations / event-registrations）は `take` も
 * truncation も無く、`getCustomersForExport()` に至っては**引数を 1 つも取らない**
 * ので管理者が範囲を狭める手段が UI にも URL にも無かった。
 *
 * admin サービスは `max_instance_count = 1` / `cpu = 1` / `memory = 1Gi`。
 * `csv.ts` は行配列 → spread コピー → 巨大な単一文字列と増幅するので、ピークは
 * CSV 実サイズの数倍になる。OOM はその**唯一の admin インスタンス**を落とし、
 * 同時にログインしている全管理者が 503 を受ける。DB 側の壁は
 * `statement_timeout` 15s で、その値のコメント自身が「正規の管理レポート／
 * エクスポートより十分長い」と述べており、無制限 export はその前提と矛盾する。
 *
 * 超過時は 500 でも部分出力でもなく **409 + 実件数**を返す。管理者が
 * 「絞れば通る」と分かる形にするため。
 */
export const ADMIN_EXPORT_ROW_LIMIT = 10_000;

/** 上限超過を呼出側へ伝える共通の形。 */
export type ExportRowsResult<T> =
  | { readonly truncated: false; readonly rows: T[] }
  | { readonly truncated: true; readonly totalCount: number };

/** 409 応答の本文（route 側で `Response.json` に渡す）。 */
export const EXPORT_TRUNCATED_MESSAGE =
  "該当件数が上限を超えています。期間や条件を絞って再実行してください";
