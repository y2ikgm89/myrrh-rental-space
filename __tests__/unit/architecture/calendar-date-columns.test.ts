/**
 * 暦日として入力される値が `date` 列に入ることの gate。
 *
 * ## 何が守られていなかったか
 *
 * `settings_organization.established_date` は `<input type="date">` +
 * `z.iso.date()`（**日付だけ**）で受け取るのに `timestamptz(6)` だった。
 * 同じ性質の列（`blocked_dates.start_date` / `space_rate_plans.effective_from`）は
 * 既に `date` で、この 1 本だけが揃っていなかった。
 *
 * timestamptz は「瞬間」なので、同じ行が**読む側のタイムゾーン次第で違う日付**に
 * なる。設立日が 1 日前に見える、というのは JSON-LD（`foundingDate`）にも
 * そのまま出る。往復が今のところ正しいのは「全員が UTC で読む」という
 * **書かれていない約束**のおかげで、型がそれを保証していなかった。
 *
 * ## なぜフィールド名ではなくファイル単位で見るか
 *
 * 最初は `foo: z.iso.date(` をフィールド名ごと正規表現で拾おうとしたが、
 * `space-rate-plan.ts` の `effectiveFrom` は `z.preprocess(emptyToNull, z.iso.date(...))`
 * に包まれていて**取りこぼした**。入れ子の深さは正規表現で追えない。
 *
 * そこで「`z.iso.date(` を含むファイル」という、部分文字列だけで確実に決まる
 * 集合を母集合にし、そのファイルが供給する列を宣言させる。宣言は schema.prisma と
 * 突き合わせるので、嘘を書けば落ちる。
 *
 * ## この gate が証明すること / しないこと
 *
 * **証明する**:
 *   1. `z.iso.date(` を含む src のファイルはすべて宣言済み（新規は宣言するまで赤）
 *   2. 宣言した列は schema.prisma で `@db.Date`
 *   3. `@db.Date` の列はすべて、いずれかの日付入力から供給されている
 *   4. 名前が `Date` で終わる `DateTime` 列は `@db.Date`
 *
 * **証明しない**: 日付入力を使っていない経路（seed / 生 SQL / 外部同期）が
 * その列へ何を書くか。そこは列の型自体が `date` であることで守られる。
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { readPrismaSchema } from "../../support/prisma-sources";

const ROOT = process.cwd();

/**
 * `z.iso.date()`（暦日だけを受け取る入力）が値を供給する `@db.Date` 列。
 *
 * キーは src からの相対パス、値は `Model.field`。**日付入力なのに DB 列へは
 * 行かない**（フィルタ用パラメータ等）場合は空配列を書く — 「宣言しなくてよい」
 * ではなく「行き先が無いと宣言する」形にして、黙って対象外になるのを防ぐ。
 */
const DATE_INPUT_TARGETS: Readonly<Record<string, readonly string[]>> = {
  "src/shared/lib/validations/blocked-date.ts": [
    "BlockedDate.startDate",
    "BlockedDate.endDate",
  ],
  "src/app/(admin)/admin/(dashboard)/_shared/lib/validations/blocked-date.ts": [
    "BlockedDate.startDate",
    "BlockedDate.endDate",
  ],
  "src/app/(admin)/admin/(dashboard)/_shared/lib/validations/space-rate-plan.ts":
    ["SpaceRatePlan.effectiveFrom", "SpaceRatePlan.effectiveTo"],
  "src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/form-schemas-brand-contact.ts":
    ["SettingsOrganization.establishedDate"],
};

interface DateTimeColumn {
  readonly model: string;
  readonly field: string;
  readonly isDate: boolean;
}

/**
 * schema.prisma の `DateTime` 列を `@db.Date` かどうかつきで集める。
 *
 * CRLF で checkout されたツリーでも列を取りこぼさないよう `/\r?\n/` で割る
 * （varchar gate で一度これに嵌まっている）。
 */
function readDateTimeColumns(): DateTimeColumn[] {
  const out: DateTimeColumn[] = [];
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

    const decl = /^\s*(\w+)\s+DateTime(\[\])?\??\s*(.*)$/u.exec(line);
    if (!decl?.[1]) continue;
    out.push({
      model,
      field: decl[1],
      isDate: /@db\.Date\b/u.test(decl[3] ?? ""),
    });
  }
  return out;
}

const COLUMNS = readDateTimeColumns();
const BY_KEY = new Map(COLUMNS.map((c) => [`${c.model}.${c.field}`, c]));

/** `z.iso.date(` を含む追跡済み src ファイル（部分文字列一致だけで決まる）。 */
function filesUsingDateOnlyInput(): string[] {
  const tracked = execFileSync("git", ["ls-files", "-z", "src"], {
    cwd: ROOT,
    maxBuffer: 32 * 1024 * 1024,
  })
    .toString("utf8")
    .split(String.fromCharCode(0))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

  return tracked.filter((file) => {
    const source = readFileSync(join(ROOT, file), "utf8");
    // `z.iso` と `.date(` の間に改行が入る書き方（prettier が折る）も拾う。
    return /z\s*\.\s*iso\s*\.\s*date\s*\(/u.test(source);
  });
}

const DATE_INPUT_FILES = filesUsingDateOnlyInput();

describe("暦日として入力される列", () => {
  test("gate が空振りしていない（前提の自己検査）", () => {
    // どちらかが 0 になると以降の assertion が全部 vacuous に通る。
    expect(COLUMNS.length).toBeGreaterThan(200);
    expect(DATE_INPUT_FILES.length).toBeGreaterThan(0);
    // 既知の 1 本を名指しで固定する。走査が壊れたらここで落ちる。
    expect(DATE_INPUT_FILES).toContain(
      "src/shared/lib/validations/blocked-date.ts",
    );
  });

  test("日付入力を持つファイルはすべて行き先が宣言されている", () => {
    const undeclared = DATE_INPUT_FILES.filter(
      (file) => !(file in DATE_INPUT_TARGETS),
    ).map(
      (file) =>
        `${file}: z.iso.date() を使っている。書き込む @db.Date 列を DATE_INPUT_TARGETS に宣言する（DB へ行かないなら空配列）`,
    );

    expect(undeclared).toEqual([]);
  });

  test("宣言したファイルは実際に日付入力を使っている", () => {
    // 使わなくなったのに宣言だけ残ると、次に日付入力を足した人が
    // 「もう宣言済み」と読み違える。
    const stale = Object.keys(DATE_INPUT_TARGETS)
      .filter((file) => !DATE_INPUT_FILES.includes(file))
      .map((file) => `${file}: z.iso.date() を使っていない（宣言が古い）`);

    expect(stale).toEqual([]);
  });

  test("日付入力が書き込む列は @db.Date である", () => {
    const wrong = Object.entries(DATE_INPUT_TARGETS).flatMap(([file, keys]) =>
      keys.flatMap((k) => {
        const column = BY_KEY.get(k);
        if (!column) return [`${file}: ${k} は schema.prisma に無い`];
        return column.isDate
          ? []
          : [`${k}: 暦日入力なのに @db.Date でない（${file}）`];
      }),
    );

    expect(wrong).toEqual([]);
  });

  test("@db.Date の列はいずれかの日付入力から供給されている", () => {
    // 逆向き。日付入力が無いのに date 列がある場合、入力側が datetime へ
    // 変わった（= 時刻を捨てている）可能性がある。
    const declared = new Set(Object.values(DATE_INPUT_TARGETS).flat());
    const orphaned = COLUMNS.filter((c) => c.isDate)
      .map((c) => `${c.model}.${c.field}`)
      .filter((k) => !declared.has(k))
      .map((k) => `${k}: @db.Date だが日付入力の行き先として宣言されていない`);

    expect(orphaned).toEqual([]);
  });

  test("名前が Date で終わる DateTime 列は @db.Date である", () => {
    // 命名からも読み取れる分を機械で押さえる。名前だけでは
    // `effectiveFrom` のような列を拾えないので、上の宣言と併用する。
    const mismatched = COLUMNS.filter((c) => c.field.endsWith("Date"))
      .filter((c) => !c.isDate)
      .map((c) => `${c.model}.${c.field}: 名前は暦日だが @db.Date でない`);

    expect(mismatched).toEqual([]);
  });
});
