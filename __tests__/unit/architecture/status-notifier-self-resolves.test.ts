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
 * Issue の開閉そのものは `.github/actions/status-notice` に集約してある。
 * **実装が 1 つしか無いので、4 箇所のうち 1 箇所だけ直し忘れる形の drift は
 * 構造的に起きない。** この gate が見るのは、その前提が崩れていないことと、
 * 呼び出し側にしか書けない 2 点:
 *
 * 1. 共有 action に `gh issue create` と `gh issue close` の両方がある
 *    — 開けるなら閉じられる（実装が 1 つなので 1 回検査すれば足りる）
 * 2. status notifier の job が **その共有 action を使っている**
 *    — 自前で Issue を触り始めたら 1 の保証が効かなくなる
 * 3. job の `if:` に `always()` がある
 *    — 無いと緑の run で job ごと skip され、閉じる経路が消える
 * 4. action へ渡す `title` が run ごとに変わらない
 *    — SHA や日付を混ぜると復旧 run が既存 Issue に辿り着けない
 *
 * status notifier は `toJSON(needs)` で **自 workflow の job 結果を集計する
 * job** として拾う。集計していない job は「いま緑か」を知らないので、閉じる
 * 責務を負わせられない。現時点で該当する job は無い（Issue を立てる job は
 * 4 つとも needs を集計する形に揃えてある）。
 *
 * # 粗さ
 *
 * 検査は YAML の構造に対して行う。共有 action の内部で `gh issue close` が
 * 実際に緑の分岐で呼ばれるか（順序・条件）までは見ていない。呼び出し側が
 * 渡す `report` が正しく「空文字 = 緑」を表しているかも見ていない。
 *
 * # 直し方
 *
 * `.github/workflows/ci.yml` の `post-merge-result` が手本。赤かどうかを決めて
 * `report` を組み立て、`./.github/actions/status-notice` に渡すだけでよい。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

type NotifierJob = {
  readonly source: string;
  readonly job: string;
  readonly condition: string;
  readonly needs: readonly string[];
  readonly usesSharedNotice: boolean;
  readonly title: string | null;
};

const GITHUB_DIR = join(process.cwd(), ".github");
const WORKFLOWS_DIR = join(GITHUB_DIR, "workflows");
const SHARED_NOTICE_PATH = "./.github/actions/status-notice";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function readSteps(job: Record<string, unknown>): Record<string, unknown>[] {
  const steps = job["steps"];
  return Array.isArray(steps) ? steps.filter(isRecord) : [];
}

/** 共有 action を呼ぶ step（無ければ null） */
function findSharedNoticeStep(
  job: Record<string, unknown>,
): Record<string, unknown> | null {
  for (const step of readSteps(job)) {
    if (step["uses"] === SHARED_NOTICE_PATH) return step;
  }
  return null;
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
      const noticeStep = findSharedNoticeStep(job);
      const inputs = noticeStep === null ? null : noticeStep["with"];
      const title = isRecord(inputs) ? inputs["title"] : null;
      notifiers.push({
        source: `.github/workflows/${fileName}`,
        job: name,
        condition: typeof job["if"] === "string" ? job["if"] : "",
        needs: readStringArray(job["needs"]),
        usesSharedNotice: noticeStep !== null,
        title: typeof title === "string" ? title : null,
      });
    }
  }
  return notifiers;
}

/** 自己解消契約を満たさない点を列挙する。空配列 = 契約成立。 */
function findContractViolations(notifier: {
  readonly condition: string;
  readonly usesSharedNotice: boolean;
  readonly title: string | null;
}): string[] {
  const violations: string[] = [];

  if (!/\balways\(\s*\)/u.test(notifier.condition)) {
    violations.push(
      "if: に always() が無い — 緑の run で job ごと skip され、閉じる経路が消える",
    );
  }

  if (!notifier.usesSharedNotice) {
    violations.push(
      `${SHARED_NOTICE_PATH} を使っていない — Issue の開閉を自前で書くと、実装が 1 つであることによる保証が効かなくなる`,
    );
    // action を使っていない以上、title の検査は意味を持たない。
    return violations;
  }

  if (notifier.title === null || notifier.title.length === 0) {
    violations.push("title を渡していない");
  } else if (
    notifier.title.includes("$") ||
    notifier.title.includes("${{") ||
    /\d{4}-\d{2}-\d{2}/u.test(notifier.title)
  ) {
    violations.push(
      `title が run ごとに変わる (${notifier.title}) — 復旧 run が既存 Issue に辿り着けない`,
    );
  }

  return violations;
}

const notifiers = collectNotifiers();

describe("共有 status-notice action", () => {
  const actionSource = readFileSync(
    join(GITHUB_DIR, "actions", "status-notice", "action.yml"),
    "utf8",
  );

  test("開くだけでなく閉じる", () => {
    // 実装は 1 つしか無いので、ここが契約の本体。
    expect(actionSource).toContain("gh issue create");
    expect(actionSource).toContain("gh issue close");
  });

  test("空の report を緑として扱う入口がある", () => {
    // 呼び出し側は「空文字 = 緑」でしか復旧を伝えられない。
    expect(actionSource).toContain("NOTICE_REPORT");
    expect(actionSource).toContain('if [ -n "$NOTICE_REPORT" ]');
  });
});

describe("status notifier の自己解消契約", () => {
  test("走査が status notifier を実際に見つけている", () => {
    // 走査が壊れて 0 件になると、以降の gate が空振りで緑になる。
    expect(notifiers.length).toBeGreaterThanOrEqual(4);

    const names = notifiers.map(
      (notifier) => `${notifier.source} :: ${notifier.job}`,
    );
    expect(names).toContain(".github/workflows/ci.yml :: post-merge-result");
    expect(names).toContain(
      ".github/workflows/deploy-production.yml :: deploy-result",
    );
    expect(names).toContain(
      ".github/workflows/terraform-drift.yml :: drift-result",
    );
    expect(names).toContain(".github/workflows/uptime.yml :: uptime-result");
  });

  test("共有 action 経由で、緑の run でも走り、run 不変の title を渡す", () => {
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
    usesSharedNotice: true,
    title: "Deploy Production failure",
  };

  test("手本の形は落ちない", () => {
    expect(findContractViolations(sound)).toEqual([]);
  });

  test("共有 action を使わない形は落ちる", () => {
    expect(
      findContractViolations({ ...sound, usesSharedNotice: false }),
    ).toEqual([expect.stringContaining(SHARED_NOTICE_PATH)]);
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
      title:
        "[deploy-broken] terraform-apply failed on main (${{ github.sha }})",
    };

    expect(findContractViolations(perRunTitle)).toEqual([
      expect.stringContaining("run ごとに変わる"),
    ]);
  });

  test("title に日付を混ぜる形は落ちる", () => {
    // 旧 terraform-drift.yml の `Open drift issue` が持っていた形。
    expect(
      findContractViolations({ ...sound, title: "[drift] 2026-08-11 changes" }),
    ).toEqual([expect.stringContaining("run ごとに変わる")]);
  });
});

/**
 * 「notifier が他の全 job を見る」は、**notifier が走る条件下で他の job も走りうる
 * workflow** に課せる要求。
 *
 * ci.yml も 2026-08-26 から対象に入る。それまで `nightly-result` は schedule での
 * 結果しか見ず、schedule で走らない job（`docs` / `bundle-analysis` /
 * `bundle-size-diff`）を意図的に needs から外していた。広域 E2E / Visual を
 * main への push へ移し、notifier も `post-merge-result` として push-main で走る
 * ようになったので、**その 3 つも push-main では走る**（`bundle-size-diff` だけは
 * PR 限定なので skip され、notifier 側の `skipped` 除外が吸収する）。除外してよい
 * job が構造的に無くなったため、ここで全件を要求する。
 *
 * 取りこぼしは実際に起きている（deploy-production.yml で 08-07 と 07-24 x2 の
 * deploy 失敗が無通知だった。通知が terraform-apply job の中にあったため）。
 * job を足したときに needs へ足し忘れる形をここで止める。
 */
describe("全 job が同じ trigger で走る workflow の通知は全 job を見る", () => {
  const workflowFileNames = [
    "ci.yml",
    "deploy-production.yml",
    "terraform-drift.yml",
    "uptime.yml",
  ];

  test.each(workflowFileNames)(
    "%s の notifier が他の全 job を含む",
    (fileName) => {
      const jobs = readWorkflowJobs(fileName);
      expect(jobs.size).toBeGreaterThan(1);

      const notifier = notifiers.find(
        (candidate) => candidate.source === `.github/workflows/${fileName}`,
      );
      expect(notifier).toBeDefined();

      const watched = new Set(notifier?.needs ?? []);
      const unwatched = [...jobs.keys()].filter(
        (name) => name !== notifier?.job && !watched.has(name),
      );

      expect(unwatched).toEqual([]);
    },
  );
});
