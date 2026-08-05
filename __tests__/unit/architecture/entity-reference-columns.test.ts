/**
 * 「他レコードの ID を保持する列」が uuid かつ参照整合性を持つことの gate。
 *
 * ## 何を守っていなかったか
 *
 * `entity-id-format-binding.test.ts` は **主キーだけ**を見ている。主キーが uuid で
 * 統一されていることは守られていたが、**その ID を保持する側の列**は誰も検査して
 * いなかった。実際に `reservations.price_overridden_by` が抜けていた:
 *
 *   - `users.id`（uuid）を保持しているのに列は text
 *   - FK が無く、実行者の users 行が消えても ID 文字列だけが残る
 *   - 同じ「誰がやったか」を記録する `created_by` / `deleted_by_id` /
 *     `replied_by_id` は全て uuid + FK + `ON DELETE SET NULL`
 *
 * 壊れるのは KGI「返金額・領収書金額の根拠を後から必ず辿れる」。手動上書き額は
 * 返金計算と領収書に直結するので、実行者が引けなくなると問い合わせに答えられない。
 *
 * ## この gate が見る集合
 *
 * 名前が `Id` / `Ids` / `By` で終わる `String` 列すべて。分類は 4 つで、
 * **既定は「内部参照」**（宣言不要）。宣言が要るのは例外の側だけなので、
 * 新しい列を足したときに黙って例外へ滑り込むことができない。
 *
 *   1. `@db.Uuid` + `@relation` → 内部参照。宣言不要
 *   2. `@db.Uuid` だが `@relation` 無し → `LOGICAL_REFERENCES` に理由が要る
 *      （append-only な証跡・多相参照）
 *   3. `@db.Uuid` でない → `EXTERNAL_IDS`（他システムが値を決める）か
 *      `POLYMORPHIC_IDS`（指す表が複数）に理由が要る
 *   4. どれでもない → 落とす
 *
 * ## 宣言が実態からずれたら落ちる
 *
 * 各リストのエントリは「実在すること」と「まだその状態であること」まで検査する。
 * 例えば `EXTERNAL_IDS` の列に後から `@db.Uuid` が付いたら、その列は内部参照に
 * なったのだから宣言を消せ、という形で落ちる。**理由を書いたまま実態だけが
 * 変わる**のを防ぐ（これが無いと免除リストは書き得になる）。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();

interface Column {
  readonly model: string;
  readonly field: string;
  readonly isUuid: boolean;
  readonly isArray: boolean;
  readonly hasRelation: boolean;
}

/**
 * schema.prisma から `Id` / `Ids` / `By` で終わる String 列を集める。
 *
 * CRLF で checkout されたツリーでも列を取りこぼさないよう `/\r?\n/` で割る
 * （varchar gate で一度これに嵌まっている）。
 */
function readEntityReferenceColumns(): Column[] {
  const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
  const lines = schema.split(/\r?\n/u);

  // `@relation(fields: [x])` は列の宣言行とは別の行にあるので、先に集める。
  const relationFields = new Set<string>();
  let model: string | null = null;
  for (const raw of lines) {
    const line = raw.replace(/\/\/.*$/u, "");
    const open = /^\s*model\s+(\w+)\s*\{/u.exec(line);
    if (open?.[1]) {
      model = open[1];
      continue;
    }
    if (/^\s*\}/u.test(line)) {
      model = null;
      continue;
    }
    if (!model) continue;
    const rel = /@relation\([^)]*fields:\s*\[([^\]]*)\]/u.exec(line);
    if (!rel?.[1]) continue;
    for (const field of rel[1].split(",")) {
      relationFields.add(`${model}.${field.trim()}`);
    }
  }

  const out: Column[] = [];
  model = null;
  for (const raw of lines) {
    const line = raw.replace(/\/\/.*$/u, "");
    const open = /^\s*model\s+(\w+)\s*\{/u.exec(line);
    if (open?.[1]) {
      model = open[1];
      continue;
    }
    if (/^\s*\}/u.test(line)) {
      model = null;
      continue;
    }
    if (!model) continue;

    const decl = /^\s*(\w+)\s+(\w+)(\[\])?\??\s*(.*)$/u.exec(line);
    if (!decl?.[1] || decl[2] !== "String") continue;
    const field = decl[1];
    if (!/(?:Id|Ids|By)$/u.test(field)) continue;

    out.push({
      model,
      field,
      isUuid: /@db\.Uuid\b/u.test(decl[4] ?? ""),
      isArray: decl[3] === "[]",
      hasRelation: relationFields.has(`${model}.${field}`),
    });
  }
  return out;
}

const COLUMNS = readEntityReferenceColumns();

function key(c: Column): string {
  return `${c.model}.${c.field}`;
}

/**
 * uuid だが FK を張らない列。**理由は「証跡が対象より長生きする」だけ。**
 *
 * FK を張ると参照先の削除が `ON DELETE` のどれかを強いる。証跡テーブルでは
 * Cascade（記録ごと消える）も SetNull（誰がやったか消える）も間違いなので、
 * 論理参照にして記録側を不変に保つ。
 */
const LOGICAL_REFERENCES: Readonly<Record<string, string>> = {
  "AuditLog.userId":
    "append-only の証跡。entryHash が userId を含むので NULL 化は hash chain を壊す",
  "TermsAgreement.customerId":
    "append-only の証跡。NULL 化は「誰が同意したか」そのものを消す",
  "InquiryStatusHistory.changedById":
    "append-only の証跡。AuditLog.userId と同じ理由",
  "EditorCommentThread.contentId":
    "多相参照（Post / News / Page / FaqItem）。uuid ではあるが指す表が 1 つに決まらない",
};

/**
 * 値を他システムが決める ID。uuid にはできない。
 *
 * ここに載せてよいのは「形式をこちらが選べない」列だけ。自分で採番した ID を
 * ここへ逃がすと gate の意味が無くなるので、理由には**どのシステムが決めるか**を書く。
 */
const EXTERNAL_IDS: Readonly<Record<string, string>> = {
  "Account.accountId": "Better Auth が provider から受け取る account id",
  "Account.providerId": "Better Auth の provider 識別子（'google' 等）",
  "Location.googleBusinessPlaceId": "Google Business Profile の place id",
  "ReservationSeries.googleCalendarMasterEventId":
    "Google Calendar の event id",
  "Reservation.googleCalendarEventId": "Google Calendar の event id",
  "Reservation.stripeCheckoutSessionId": "Stripe の checkout session id",
  "Reservation.stripePaymentIntentId": "Stripe の payment intent id",
  "SettingsAnalytics.googleAnalyticsId": "GA4 の測定 ID",
  "SettingsAnalytics.googleTagManagerId": "GTM のコンテナ ID",
  "SettingsAnalytics.googleSearchConsoleId": "Search Console の検証トークン",
  "SettingsAnalytics.bingWebmasterToolsId": "Bing Webmaster の検証トークン",
  "SettingsAnalytics.gaPropertyId": "GA4 のプロパティ ID",
  "SettingsAnalytics.microsoftClarityId": "Microsoft Clarity のプロジェクト ID",
  "SettingsStripe.stripeAccountId": "Stripe の account id",
  "SettingsGoogleCalendar.googleCalendarId": "Google Calendar の calendar id",
  "SettingsGoogleCalendar.googleCalendarWebhookChannelId":
    "Google Calendar push 通知の channel id",
  "SettingsGoogleCalendar.googleCalendarWebhookResourceId":
    "Google Calendar push 通知の resource id",
  "SettingsInstagram.instagramUserId": "Instagram Graph API の user id",
  "InstagramPost.postId": "Instagram Graph API の media id",
  "EditorCommentThread.markId": "Lexical MarkNode がエディタ内で振る ID",
  "EventTimeSlot.googleCalendarEventId": "Google Calendar の event id",
  "EventRegistration.stripeCheckoutSessionId": "Stripe の checkout session id",
  "EventRegistration.stripePaymentIntentId": "Stripe の payment intent id",
  "Refund.stripeRefundId": "Stripe の refund id",
  "SmartLockDevice.deviceId": "SwitchBot の device id",
  "SmartLockPasscode.switchbotCommandId": "SwitchBot の command id",
  "SmartLockPasscode.switchbotDeleteCommandId": "SwitchBot の command id",
  "SmartLockPasscode.switchbotKeyId": "SwitchBot の passcode key id",
  "AuditLog.hashKeyId": "監査ログ署名鍵の世代 ID（'v1' 等の定数）",
};

/** 指す表が複数あるため FK も uuid 型も選べない列。 */
const POLYMORPHIC_IDS: Readonly<Record<string, string>> = {
  "AuditLog.resourceId":
    "全テーブルの行 ID を受ける。Stripe event id 等の外部 ID も入る",
  "TermsAgreement.resourceId": "Reservation / EventRegistration の ID を受ける",
  "AdminNotification.resourceId": "通知対象の多相参照",
};

/**
 * FK を張れない ID の配列。
 *
 * **PostgreSQL は配列要素に FK を張れない**（`ELEMENT REFERENCES` は SQL 標準に
 * あるが未実装）。したがって参照整合性が構造的に取れない。ここに載っている限り
 * 「消えた行を指したままになる」ことは避けられないので、載せること自体が負債の宣言。
 */
const UNCONSTRAINED_ID_ARRAYS: Readonly<Record<string, string>> = {
  "SettingsNotification.notificationStaffIds":
    "User.id の配列。PostgreSQL は配列要素に FK を張れない",
};

const DECLARED: readonly (readonly [
  string,
  Readonly<Record<string, string>>,
])[] = [
  ["LOGICAL_REFERENCES", LOGICAL_REFERENCES],
  ["EXTERNAL_IDS", EXTERNAL_IDS],
  ["POLYMORPHIC_IDS", POLYMORPHIC_IDS],
  ["UNCONSTRAINED_ID_ARRAYS", UNCONSTRAINED_ID_ARRAYS],
];

function declarationOf(k: string): string | null {
  for (const [name, table] of DECLARED) if (k in table) return name;
  return null;
}

describe("他レコードの ID を保持する列", () => {
  test("gate が空振りしていない（前提の自己検査）", () => {
    // パースが壊れると以降の assertion が全部 vacuous に通る。
    expect(COLUMNS.length).toBeGreaterThan(100);
    // 内部参照の代表。ここが拾えていなければ既定バケットが機能していない。
    expect(COLUMNS.some((c) => key(c) === "Reservation.customerId")).toBe(true);
  });

  test("uuid でない列は外部 ID か多相参照として宣言されている", () => {
    const offenders = COLUMNS.filter((c) => !c.isUuid)
      .filter((c) => declarationOf(key(c)) === null)
      .map(
        (c) =>
          `${key(c)}: uuid でない ID 列。内部参照なら @db.Uuid + @relation、` +
          `そうでなければ EXTERNAL_IDS / POLYMORPHIC_IDS / UNCONSTRAINED_ID_ARRAYS に理由を書く`,
      );

    expect(offenders).toEqual([]);
  });

  test("uuid だが FK を張らない列は理由が宣言されている", () => {
    const offenders = COLUMNS.filter((c) => c.isUuid && !c.hasRelation)
      .filter((c) => !(key(c) in LOGICAL_REFERENCES))
      .map(
        (c) =>
          `${key(c)}: uuid だが @relation が無い。FK を張るか LOGICAL_REFERENCES に理由を書く`,
      );

    expect(offenders).toEqual([]);
  });

  test("宣言したエントリが schema.prisma に実在する", () => {
    const known = new Set(COLUMNS.map(key));
    const stale = DECLARED.flatMap(([name, table]) =>
      Object.keys(table)
        .filter((k) => !known.has(k))
        .map(
          (k) => `${name}: ${k} は schema.prisma に無い（改名・削除された）`,
        ),
    );

    expect(stale).toEqual([]);
  });

  test("宣言が実態とずれていない", () => {
    const byKey = new Map(COLUMNS.map((c) => [key(c), c]));
    const contradictions: string[] = [];

    // 「uuid にできない」と宣言した列に @db.Uuid が付いたら、宣言のほうが古い。
    for (const table of [EXTERNAL_IDS, POLYMORPHIC_IDS]) {
      for (const k of Object.keys(table)) {
        if (byKey.get(k)?.isUuid === true) {
          contradictions.push(`${k}: uuid になったので宣言を外す`);
        }
      }
    }
    // 「FK を張らない」と宣言した列に @relation が付いたら同じく古い。
    for (const k of Object.keys(LOGICAL_REFERENCES)) {
      if (byKey.get(k)?.hasRelation === true) {
        contradictions.push(`${k}: @relation が付いたので宣言を外す`);
      }
    }
    // 配列でなくなったなら「FK を張れない」理由が消えている。
    for (const k of Object.keys(UNCONSTRAINED_ID_ARRAYS)) {
      if (byKey.get(k)?.isArray === false) {
        contradictions.push(`${k}: 配列でなくなったので FK を張れる`);
      }
    }

    expect(contradictions).toEqual([]);
  });

  test("金額の手動上書きは実行者を FK で辿れる", () => {
    // この gate を作るきっかけになった列。既定バケットに入っていること
    // （= uuid + @relation）を名指しで固定する。
    const column = COLUMNS.find(
      (c) => key(c) === "Reservation.priceOverriddenById",
    );

    expect({
      found: column !== undefined,
      isUuid: column?.isUuid,
      hasRelation: column?.hasRelation,
      declaredAsException: declarationOf("Reservation.priceOverriddenById"),
    }).toEqual({
      found: true,
      isUuid: true,
      hasRelation: true,
      declaredAsException: null,
    });
  });
});
