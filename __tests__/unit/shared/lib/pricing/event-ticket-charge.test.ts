/**
 * `EventTicket.unitSize` を金額に効かせる（`price` は unitSize 名分の値段）。
 *
 * バグ: `unitSize` はリポジトリ全体で一度も乗除算されておらず、請求は全経路で
 * `price × 参加人数` だった。一方 schema コメント（「1申込あたりの人数単位
 * (1 = 1名、2 = 2名セット 等)」）・管理フォームのヘルプ（「例: グループ枠なら
 * 4 (4 名で 1 チケット)」）・公開表示（「¥18,000 / 4 名」）は揃って
 * 「price は unitSize 名分」を指していた。
 *
 * 管理画面のプリセットには `price: 18000, unitSize: 4` の「グループ (4名)」が
 * 実在するため、それを選んだイベントに 4 名で申し込むと 72,000 円が請求された。
 *
 * 定員側は変えていない（`quantity` = 人数を 1:1 で消費する）。ここで固定するのは
 * 金額の式だけ。
 */
import { describe, expect, test } from "bun:test";
import {
  eventTicketChargeAmount,
  eventTicketUnitCount,
} from "@/shared/lib/pricing/event-ticket-charge";

const GROUP_TICKET = { price: 18000, unitSize: 4 } as const;
const SOLO_TICKET = { price: 5000, unitSize: 1 } as const;

describe("eventTicketChargeAmount", () => {
  test("unitSize 名ちょうどで申し込んだらチケット 1 枚分（人数倍にしない）", () => {
    // 旧実装は 18000 * 4 = 72000 を請求していた。
    expect(eventTicketChargeAmount(GROUP_TICKET, 4)).toBe(18000);
  });

  test("unitSize に満たない人数でもチケット 1 枚分（端数を割り引かない）", () => {
    expect(eventTicketChargeAmount(GROUP_TICKET, 1)).toBe(18000);
    expect(eventTicketChargeAmount(GROUP_TICKET, 3)).toBe(18000);
  });

  test("unitSize を超えたら切り上げで枚数が増える", () => {
    expect(eventTicketChargeAmount(GROUP_TICKET, 5)).toBe(36000);
    expect(eventTicketChargeAmount(GROUP_TICKET, 8)).toBe(36000);
    expect(eventTicketChargeAmount(GROUP_TICKET, 9)).toBe(54000);
  });

  test("unitSize=1 は従来どおり price × 人数（既存チケットの金額を変えない）", () => {
    expect(eventTicketChargeAmount(SOLO_TICKET, 1)).toBe(5000);
    expect(eventTicketChargeAmount(SOLO_TICKET, 3)).toBe(15000);
    expect(eventTicketChargeAmount(SOLO_TICKET, 10)).toBe(50000);
  });

  test("0 円チケットは枚数によらず 0 円", () => {
    expect(eventTicketChargeAmount({ price: 0, unitSize: 4 }, 7)).toBe(0);
  });
});

describe("eventTicketUnitCount", () => {
  test("Stripe に渡す数量は人数ではなく枚数", () => {
    // line_items.unit_amount が unitSize 名分の単価なので、ここに人数を入れると
    // unitSize 倍の請求になる。
    expect(eventTicketUnitCount(4, 4)).toBe(1);
    expect(eventTicketUnitCount(5, 4)).toBe(2);
    expect(eventTicketUnitCount(3, 1)).toBe(3);
  });
});
