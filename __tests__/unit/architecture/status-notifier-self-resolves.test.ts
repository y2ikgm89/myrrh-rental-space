/**
 * # なぜ
 *
 * 「失敗したら Issue を立て、復旧したら閉じる」通知は、**閉じる経路が無いと
 * 嘘をつく**。開きっぱなしの Issue が残るので「open Issue がある = いま赤」と
 * いう読み方が成立せず、次に本当に壊れたときの信号がその山に埋もれる。
 *
 * 実際に起きた欠陥（2026-08-11 実測）。`deploy-production.yml` の旧
 * `Open apply failure issue` step は open しかしなかった:
 *
 * - `[deploy-broken] ...` の open Issue が 7 件、closed が 0 件。7 件とも
 *   08-08 の success で復旧済みで、現状を 1 件も表していなかった。
 * - title に SHA を埋めていたため、復旧 run は別 title になり既存 Issue に
 *   辿り着けない。失敗のたびに Issue が増えるだけだった（07-19 に 6 件）。
 * - 通知が terraform-apply job の中にあったため、**deploy job の失敗は一切
 *   通知されなかった**（08-07 / 07-24 x2 の failure に対応する Issue が無い）。
 *
 * # 何を見るか
 *
 * `toJSON(needs)` で **自 workflow の job 結果を集計する job**（= status
 * notifier）を全 workflow から拾い、次を検査する:
 *
 * 1. `if:` に `always()` がある — 無いと緑の run で job ごと skip され、
 *    閉じる経路が消える
 * 2. `gh issue create` と `gh issue close` の両方がある — 開けるなら閉じられる
 * 3. `gh issue create --title` に渡る値が run ごとに変わらない — SHA や run id
 *    を混ぜると復旧 run が既存 Issue に辿り着けない
 *
 * `toJSON(needs)` を持たない通知は対象外。例えば `terraform-drift.yml` は
 * plan の exit code だけを見る単独 job で、「いま緑か」を知らない。集計して
 * いない job に閉じる責務は負わせられない。
 *
 * # 粗さ
 *
 * 検査は job の YAML 構造と `run:` の**文字列**に対して行う。`gh issue close`
 * が実際に緑の分岐で呼ばれるか（順序・条件）までは見ていない。既存 Issue の
 * 突き合わせが marker で行われているかも見ていない。そこは手本の
 * `ci.yml` の `nightly-result` を読んで揃えること。
 *
 * # 直し方
 *
 * `.github/workflows/ci.yml` の `nightly-result` が手本。失敗したら Issue を
 * 立て（既に開いていればコメントを足し）、復旧したら同じ Issue に復旧を記録
 * して閉じる。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

type NotifierJob = {
  readonly source: string;
  readonly job: string;
  readonly condition: string;
  readonly needs: readonly string[];
  readonly script: string;
};

const WORKFLOWS_DIR = join(process.cwd(), ".github", "workflows");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/** job 配下の `run:` を全部つないだもの。 */
function readScript(job: Record<string, unknown>): string {
  const steps = job["steps"];
  if (!Array.isArray(steps)) return "";
  return steps
    .filter(isRecord)
    .map((step) => (typeof step["run"] === "string" ? step["run"] : ""))
    .join("\n");
}

function readWorkflowJobs(
  fileName: string,
): ReadonlyMap<string, Record<string, unknown>> {
  const document = Bun.YAML.parse(
    readFileSync(join(WORKFLOWS_DIR, fileName), "utf8"),
  );
  const jobs = isRecord(document) ? document["jobs"] : null;
  if (!isRecord(jobs)) return new Map();
  return new Map(
    Object.entries(jobs).filter(
      (entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]),
    ),
  );
}

function listWorkflowFileNames(): string[] {
  return readdirSync(WORKFLOWS_DIR).filter(
    (entry) => entry.endsWith(".yml") || entry.endsWith(".yaml"),
  );
}

/**
 * status notifier = `toJSON(needs)` で自 workflow の job 結果を集計する job。
 * `env` でも `with` でも拾えるよう job 全体を走査する。
 */
function isStatusNotifier(job: Record<string, unknown>): boolean {
  return /toJSON\(\s*needs\s*\)/u.test(JSON.stringify(job));
}

function collectNotifiers(): NotifierJob[] {
  const notifiers: NotifierJob[] = [];
  for (const fileName of listWorkflowFileNames()) {
    for (const [name, job] of readWorkflowJobs(fileName)) {
      if (!isStatusNotifier(job)) continue;
      notifiers.push({
        source: `.github/workflows/${fileName}`,
        job: name,
        condition: typeof job["if"] === "string" ? job["if"] : "",
        needs: readStringArray(job["needs"]),
        script: readScript(job),
      });
    }
  }
  return notifiers;
}

/**
 * `gh issue create --title <arg>` に渡る値を、単純な `VAR="literal"` 代入まで
 * 遡って解決する。解決できない形（env 経由など）は raw のまま返すので、展開を
 * 含んだままなら判定は違反側へ倒れる（fail-closed）。
 */
function resolveIssueTitles(script: string): string[] {
  const assignments = new Map<string, string>();
  for (const match of script.matchAll(
    /^\s*([A-Za-z_][A-Za-z0-9_]*)=("[^"\n]*"|'[^'\n]*')\s*$/gmu,
  )) {
    assignments.set(match[1] ?? "", (match[2] ?? "").slice(1, -1));
  }

  const titles: string[] = [];
  for (const match of script.matchAll(
    /--title\s+("[^"\n]*"|'[^'\n]*'|\S+)/gu,
  )) {
    const raw = (match[1] ?? "").replace(/^["']|["']$/gu, "");
    const name = /^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/u.exec(raw)?.[1];
    titles.push(name === undefined ? raw : (assignments.get(name) ?? raw));
  }
  return titles;
}

/** 自己解消契約を満たさない点を列挙する。空配列 = 契約成立。 */
function findContractViolations(notifier: {
  readonly condition: string;
  readonly script: string;
}): string[] {
  const violations: string[] = [];

  if (!/\balways\(\s*\)/u.test(notifier.condition)) {
    violations.push(
      "if: に always() が無い — 緑の run で job ごと skip され、閉じる経路が消える",
    );
  }
  if (!notifier.script.includes("gh issue create")) {
    violations.push("gh issue create が無い — 失敗が可視化されない");
  }
  if (!notifier.script.includes("gh issue close")) {
    violations.push("gh issue close が無い — 一度開いた Issue が永久に残る");
  }
  for (const title of resolveIssueTitles(notifier.script)) {
    if (title.includes("$")) {
      violations.push(
        `Issue title が run ごとに変わる (${title}) — 復旧 run が既存 Issue に辿り着けない`,
      );
    }
  }

  return violations;
}

const notifiers = collectNotifiers();

describe("status notifier の自己解消契約", () => {
  test("走査が status notifier を実際に見つけている", () => {
    // 走査が壊れて 0 件になると、以降の gate が空振りで緑になる。
    expect(notifiers.length).toBeGreaterThanOrEqual(2);

    const names = notifiers.map(
      (notifier) => `${notifier.source} :: ${notifier.job}`,
    );
    expect(names).toContain(".github/workflows/ci.yml :: nightly-result");
    expect(names).toContain(
      ".github/workflows/deploy-production.yml :: deploy-result",
    );
  });

  test("失敗で開いた Issue を復旧時に自分で閉じる", () => {
    const offenders = notifiers.flatMap((notifier) =>
      findContractViolations(notifier).map(
        (violation) => `${notifier.source} :: ${notifier.job} — ${violation}`,
      ),
    );

    expect(offenders).toEqual([]);
  });
});

describe("契約判定の見本", () => {
  const sound = {
    condition: "always() && github.repository == 'y2ikgm89/myrrh-rental-space'",
    script: [
      'title="Deploy Production failure"',
      'gh issue create --title "$title" --body "$marker"',
      'gh issue close "$existing"',
    ].join("\n"),
  };

  test("手本の形は落ちない", () => {
    expect(findContractViolations(sound)).toEqual([]);
  });

  test("復旧時に閉じない形は落ちる", () => {
    const openOnly = {
      ...sound,
      script: sound.script.replace(/^gh issue close.*$/mu, ""),
    };

    expect(findContractViolations(openOnly)).toEqual([
      expect.stringContaining("gh issue close"),
    ]);
  });

  test("緑の run で走らない形は落ちる", () => {
    expect(
      findContractViolations({ ...sound, condition: "failure()" }),
    ).toEqual([expect.stringContaining("always()")]);
  });

  test("title に SHA を混ぜる形は落ちる", () => {
    // 旧 deploy-production.yml の `Open apply failure issue` が持っていた形。
    const perRunTitle = {
      ...sound,
      script: sound.script.replace(
        'title="Deploy Production failure"',
        'title="[deploy-broken] terraform-apply failed on main (${GITHUB_SHA:0:8})"',
      ),
    };

    expect(findContractViolations(perRunTitle)).toEqual([
      expect.stringContaining("run ごとに変わる"),
    ]);
  });
});

/**
 * 「notifier が他の全 job を見る」は **deploy-production.yml 限定**の要求。
 * ci.yml の `nightly-result` は schedule での結果だけを見るので、schedule では
 * 走らない job（`docs` / `bundle-analysis` / `lighthouse-ci` /
 * `bundle-size-diff`）を意図的に needs から外している。全 workflow へ一般化
 * すると、その正しい除外を落としてしまう。
 *
 * deploy-production.yml は全 job が同じ workflow_dispatch で走るため、除外の
 * 余地が無い。取りこぼしは実際に起きている（08-07 / 07-24 x2 の deploy 失敗が
 * 無通知だった）ので、job を足したときに needs へ足し忘れる形をここで止める。
 */
describe("deploy-production.yml の通知は全 job を見る", () => {
  test("notifier の needs が他の全 job を含む", () => {
    const jobs = readWorkflowJobs("deploy-production.yml");
    expect(jobs.size).toBeGreaterThan(1);

    const notifier = notifiers.find(
      (candidate) =>
        candidate.source === ".github/workflows/deploy-production.yml",
    );
    expect(notifier).toBeDefined();

    const watched = new Set(notifier?.needs ?? []);
    const unwatched = [...jobs.keys()].filter(
      (name) => name !== notifier?.job && !watched.has(name),
    );

    expect(unwatched).toEqual([]);
  });
});
