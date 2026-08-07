/**
 * すべての `String` 列が**上限を持つか持たないかを明示している**ことの gate。
 *
 * ## 何が抜けていたか
 *
 * Prisma の `String` は PostgreSQL で既定 `text` になる。つまり `@db.` を書かない
 * 列は「上限なしを選んだ」のではなく **何も決めていない**。実測で 216 本がその状態で、
 * `varchar-write-bounds` の母集合（`@db.VarChar` 列）からも外れていたため、
 * **誰も見ていない列**として存在していた。
 *
 * `@db.Text` を明示すれば「上限なしが正しい」という判断が schema に残り、
 * `@db.VarChar(n)` を書けば `varchar-write-bounds` が書込側の上限まで検査する。
 * どちらでもない第三の状態を無くすのがこの gate の役目。
 *
 * ## 同じ値域には同じ答えを
 *
 * 明示するだけでは足りない。値域を 1 つに揃える前、「メールアドレスの長さ」には
 * **254 / 255 / 320 / 上限なし**の 4 つの答えが同居していた。表ごとに独立して
 * 決めた結果で、どれが正しいのかを誰も決めていなかった。
 *
 * 下の `VALUE_DOMAINS` は「同じ値域である」と宣言した列の集合で、その全員が
 * 同じ `@db.VarChar(n)` を持つことを検査する。1 本だけ広げる/狭めると落ちる。
 *
 * ## この gate が証明すること / しないこと
 *
 * **証明する**: 決めていない列が 1 本も無い。宣言した値域の中で列長が揃っている。
 *
 * **証明しない**: その n が書込側の上限以上であること。それは
 * `varchar-write-bounds` が Zod schema を実際に叩いて確かめる。
 */

import { describe, expect, test } from "bun:test";

import { readPrismaSchema } from "../../support/prisma-sources";

interface StringColumn {
  readonly model: string;
  readonly field: string;
  /** `@db.VarChar(n)` の n。`@db.Text` / `@db.Uuid` などは null。 */
  readonly varChar: number | null;
  readonly annotation: string | null;
}

/**
 * schema.prisma の `String` 列を集める。
 *
 * CRLF で checkout されたツリーでも列を取りこぼさないよう `/\r?\n/` で割る
 * （varchar gate で一度これに嵌まっている）。
 */
function readStringColumns(): StringColumn[] {
  const out: StringColumn[] = [];
  let model: string | null = null;

  for (const raw of readPrismaSchema().split(/\r?\n/u)) {
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

    const decl = /^\s*(\w+)\s+String(\[\])?\??\s*(.*)$/u.exec(line);
    if (!decl?.[1]) continue;
    const attrs = decl[3] ?? "";
    const annotation = /@db\.(\w+)/u.exec(attrs)?.[1] ?? null;
    const varChar = /@db\.VarChar\((\d+)\)/u.exec(attrs)?.[1];

    out.push({
      model,
      field: decl[1],
      varChar: varChar === undefined ? null : Number(varChar),
      annotation,
    });
  }
  return out;
}

const COLUMNS = readStringColumns();

function key(c: StringColumn): string {
  return `${c.model}.${c.field}`;
}

/**
 * 「同じ値域」と宣言した列の集合。
 *
 * **列名が同じでも同じ値域とは限らない。** `EventRegistration.name` は氏名を 1 欄で
 * 受け取るもの、`Customer.lastName` は姓だけ — 別の値域なので同じ集合に入れない。
 * ここに載せるのは「同じものを保存している」と言い切れる列だけ。
 */
const VALUE_DOMAINS: Readonly<Record<string, readonly string[]>> = {
  "メールアドレス（RFC 5321 の 254）": [
    "User.email",
    "Location.email",
    "Customer.email",
    "Customer.emailCanonical",
    "Inquiry.email",
    "Reservation.guestEmail",
    "SettingsOrganization.email",
    "SettingsOrganization.senderEmail",
    "SettingsOrganization.replyToEmail",
    "EventRegistration.email",
    "TermsAgreement.guestEmail",
    "PendingCustomerMerge.guestEmail",
    "PendingCustomerEmailChange.newEmail",
    "PendingCustomerEmailChange.newEmailCanonical",
  ],
  電話番号: [
    "Location.phoneNumber",
    "Customer.phoneNumber",
    "Inquiry.phoneNumber",
    "Reservation.guestPhone",
    "SettingsOrganization.phoneNumber",
    "SettingsOrganization.faxNumber",
    "EventRegistration.phone",
  ],
  郵便番号: [
    "Location.postalCode",
    "Customer.postalCode",
    "SettingsOrganization.postalCode",
  ],
  都道府県: [
    "Location.prefecture",
    "Customer.prefecture",
    "SettingsOrganization.prefecture",
  ],
  市区町村: ["Location.city", "Customer.city", "SettingsOrganization.city"],
  町名番地: [
    "Location.streetAddress",
    "Customer.streetAddress",
    "SettingsOrganization.streetAddress",
  ],
  建物名: [
    "Location.buildingName",
    "Customer.building",
    "SettingsOrganization.buildingName",
  ],
  "姓・名（それぞれ）": [
    "Customer.lastName",
    "Customer.firstName",
    "Customer.lastNameKana",
    "Customer.firstNameKana",
    "Reservation.guestLastName",
    "Reservation.guestFirstName",
  ],
  会社名: [
    "Customer.companyName",
    "Reservation.guestCompanyName",
    "Inquiry.companyName",
  ],
};

describe("String 列の宣言", () => {
  test("gate が空振りしていない（前提の自己検査）", () => {
    // パースが壊れると以降の assertion が全部 vacuous に通る。
    expect(COLUMNS.length).toBeGreaterThan(400);
    expect(COLUMNS.some((c) => c.annotation === "Text")).toBe(true);
    expect(COLUMNS.some((c) => c.annotation === "VarChar")).toBe(true);
  });

  test("@db. を書いていない String 列が 1 本も無い", () => {
    const undeclared = COLUMNS.filter((c) => c.annotation === null).map(
      (c) =>
        `${key(c)}: @db. が無い。上限があるなら @db.VarChar(n)、無いなら @db.Text を明示する`,
    );

    expect(undeclared).toEqual([]);
  });

  test("同じ値域の列は同じ列長を持つ", () => {
    const byKey = new Map(COLUMNS.map((c) => [key(c), c]));
    const failures: string[] = [];

    for (const [domain, members] of Object.entries(VALUE_DOMAINS)) {
      const observed = members.map((k) => {
        const column = byKey.get(k);
        if (!column) return { k, length: "列が無い" };
        return {
          k,
          length:
            column.varChar === null
              ? (column.annotation ?? "?")
              : String(column.varChar),
        };
      });
      const distinct = new Set(observed.map((o) => o.length));
      if (distinct.size > 1) {
        failures.push(
          `${domain}: ${observed.map((o) => `${o.k}=${o.length}`).join(" / ")}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  test("値域の宣言に実在しない列が残っていない", () => {
    const known = new Set(COLUMNS.map(key));
    const stale = Object.entries(VALUE_DOMAINS).flatMap(([domain, members]) =>
      members.filter((k) => !known.has(k)).map((k) => `${domain}: ${k}`),
    );

    expect(stale).toEqual([]);
  });

  test("列名から機械的に帰属できる String 列は値域宣言に載っている", () => {
    const membersByDomain = new Map<string, Set<string>>();
    for (const [domain, members] of Object.entries(VALUE_DOMAINS)) {
      membersByDomain.set(domain, new Set(members));
    }

    const COLUMN_NAME_RULES: Readonly<
      Record<
        string,
        {
          readonly fieldPattern: RegExp;
          readonly valueDomain: keyof typeof VALUE_DOMAINS;
        }
      >
    > = {
      email: {
        fieldPattern: /(^|[a-z])[Ee]mail$/u,
        valueDomain: "メールアドレス（RFC 5321 の 254）",
      },
      phone: {
        fieldPattern: /(^|[a-z])(phoneNumber|phone|faxNumber|fax)$/u,
        valueDomain: "電話番号",
      },
      postalCode: {
        fieldPattern: /(^|[a-z])postalCode$/u,
        valueDomain: "郵便番号",
      },
      prefecture: {
        fieldPattern: /(^|[a-z])prefecture$/u,
        valueDomain: "都道府県",
      },
      city: {
        fieldPattern: /(^|[a-z])city$/u,
        valueDomain: "市区町村",
      },
      streetAddress: {
        fieldPattern: /(^|[a-z])streetAddress$/u,
        valueDomain: "町名番地",
      },
      building: {
        fieldPattern: /(^|[a-z])(buildingName|building)$/u,
        valueDomain: "建物名",
      },
    };

    const failures: string[] = [];
    for (const column of COLUMNS) {
      const columnKey = key(column);
      for (const rule of Object.values(COLUMN_NAME_RULES)) {
        if (!rule.fieldPattern.test(column.field)) continue;
        const domainMembers = membersByDomain.get(rule.valueDomain);
        if (domainMembers?.has(columnKey)) continue;
        failures.push(
          `${columnKey}: 列名 ${column.field} は「${rule.valueDomain}」値域に載せる`,
        );
      }
    }

    expect(failures).toEqual([]);
  });
});
