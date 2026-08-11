import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, ...rel.split("/")), "utf8");
}

describe("deploy packaging contract (Phase 6b clean-break)", () => {
  test("prisma CLI is a production dependency for the migrator image", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["prisma"]).toBeDefined();
    expect(pkg.devDependencies?.["prisma"]).toBeUndefined();
    expect(pkg.dependencies?.["@prisma/client"]).toBeDefined();
  });

  test("deps install never uses --production (migrator needs full node_modules)", () => {
    const bunCi = read("scripts/bun-ci-install.sh");
    expect(bunCi).toContain("bun ci");
    expect(bunCi).not.toContain("--production");
    expect(bunCi).not.toContain("NODE_ENV=production");
  });

  test("Dockerfile migrator is FROM deps and CMD uses prisma migrate deploy", () => {
    const dockerfile = read("Dockerfile");
    expect(dockerfile).toContain("FROM deps AS migrator");
    expect(dockerfile).toContain(
      'CMD ["sh", "-c", "bun scripts/migration-preconditions.ts && bunx --bun prisma migrate deploy"]',
    );
    // 呼べなければ CMD は起動時に落ちる。alias 解決に tsconfig が要る。
    expect(dockerfile).toContain(
      "COPY scripts/migration-preconditions.ts ./scripts/migration-preconditions.ts",
    );
    expect(dockerfile).toContain("COPY tsconfig.json ./");
    expect(dockerfile).toMatch(/FROM node:\d+-alpine AS runner/u);
    // runner must remain last so bare `docker build .` yields the service image
    expect(dockerfile.lastIndexOf("FROM deps AS migrator")).toBeLessThan(
      dockerfile.search(/FROM node:\d+-alpine AS runner/u),
    );
  });

  test("runner は Node で起動する（Bun だと jsdom を読む経路が必ず落ちる）", () => {
    // Next の require-hook が `Module._resolveFilename` を差し替えた状態の Bun では、
    // ESM 内の `createRequire(import.meta.url)` 由来 require が parent 無しで渡り、
    // `css-tree/lib/data-patch.js` の `require('../data/patch.json')` が
    // `Cannot find module '../data/patch.json' from ''` で失敗する
    // （oven-sh/bun#13076）。公開ページの本文が SSR HTML から消え、admin の Lexical
    // 保存が例外になっていた実害がある。
    //
    // **base image と CMD の両方を見る。** `oven/bun` の `node` は bun 本体への
    // symlink なので、base を戻したまま CMD だけ node にしても Bun が動いてしまう。
    const dockerfile = read("Dockerfile");
    const runnerStage = dockerfile.slice(
      dockerfile.search(/FROM node:\d+-alpine AS runner/u),
    );

    expect(runnerStage).toContain('CMD ["node", "server.js"]');
    expect(runnerStage).not.toContain('CMD ["bun"');
    // runner ステージが bun image から派生していないこと
    expect(runnerStage).not.toMatch(/^FROM (base|oven\/bun)/mu);
  });

  test("next build も runner と同じ Node で走る（builder に実 Node を持ち込む）", () => {
    // `oven/bun:*-alpine` の `node` は Bun 本体（`/usr/local/bun-node-fallback-bin/node`）。
    // `next` の bin は `#!/usr/bin/env node` なので、実 Node を置かない限り本番 image の
    // build だけ Bun ランタイムになる。CI は実 Node で build しているため、
    // 「緑になった build」と「出荷される build」が別ランタイムになる。
    // Bun と Node の差は落ちずに出力だけ変わることがある（#2182）。
    const dockerfile = read("Dockerfile");
    const builderStage = dockerfile.slice(
      dockerfile.indexOf("FROM base AS builder-base"),
      dockerfile.search(/FROM node:\d+-alpine AS runner/u),
    );

    const copied = builderStage.match(
      /COPY --from=node:(?<major>\d+)-alpine \/usr\/local\/bin\/node \/usr\/local\/bin\/node/u,
    );
    expect(copied?.groups?.["major"]).toBeString();

    // runner と同じメジャーであること。片方だけ上がると build と実行が食い違う。
    const runner = dockerfile.match(
      /FROM node:(?<major>\d+)-alpine AS runner/u,
    );
    expect(copied?.groups?.["major"]).toBe(runner?.groups?.["major"]);
  });

  test("CI も同じ Node メジャーに固定する（未固定だと runner image 更新で黙って変わる）", () => {
    const dockerfile = read("Dockerfile");
    const runner = dockerfile.match(
      /FROM node:(?<major>\d+)-alpine AS runner/u,
    );
    const major = runner?.groups?.["major"];
    expect(major).toBeString();

    const setup = read(".github/actions/setup-bun-deps/action.yml");
    expect(setup).toContain("actions/setup-node@");
    expect(setup).toContain(`node-version: "${major ?? ""}"`);
  });

  test("Cloud Run Job が適用前チェックを migrate より前に実行する", () => {
    // ここが本番の実体。Cloud Run Job は Dockerfile の CMD を command/args で
    // 上書きするので、Dockerfile だけ直しても本番では走らない。
    const job = read("terraform/cloud_run_migrate_job.tf");
    const args = /args\s*=\s*\[([\s\S]*?)\]/u.exec(job)?.[1] ?? "";
    const check = args.indexOf("scripts/migration-preconditions.ts");
    const migrate = args.indexOf("migrate");

    expect(check).toBeGreaterThanOrEqual(0);
    expect(migrate).toBeGreaterThanOrEqual(0);
    expect(check).toBeLessThan(migrate);
    // `;` で繋ぐと失敗しても migrate が走る。順序ではなく短絡であること。
    expect(args).toContain("&&");
  });

  test("Cloud Build service deploy uses services update --image (not deploy + shape)", () => {
    const cloudBuild = read("cloudbuild.yaml");
    for (const id of ["id: deploy-public", "id: deploy-admin"] as const) {
      const start = cloudBuild.indexOf(id);
      expect(start).toBeGreaterThanOrEqual(0);
      const nextId = cloudBuild.indexOf("\n  - name:", start + 1);
      const step =
        nextId === -1
          ? cloudBuild.slice(start)
          : cloudBuild.slice(start, nextId);
      expect(step).toContain("- services");
      expect(step).toContain("- update");
      expect(step).toContain("--image=");
      expect(step).toContain("--scaling=auto");
      expect(step).not.toContain("--memory=");
      expect(step).not.toContain("--set-secrets=");
    }
  });

  test("SUPPRESSION_HASH_SECRET is Phase-C wired; RESEND stays out of Cloud Run map", () => {
    const variables = read("terraform/variables.tf");
    const secrets = read("terraform/secrets.tf");
    expect(variables).toMatch(/^\s*SUPPRESSION_HASH_SECRET\s*=\s*"1"/m);
    expect(variables).not.toMatch(/^\s*RESEND_WEBHOOK_SECRET\s*=\s*"/m);
    expect(secrets).toMatch(/imported_secrets[\s\S]*"SUPPRESSION_HASH_SECRET"/);
  });

  test("RESEND_WEBHOOK_SECRET is forgotten from TF secret ownership", () => {
    const secrets = read("terraform/secrets.tf");
    // Active list entries only (quoted string), not comments.
    expect(secrets).not.toMatch(/^\s*"RESEND_WEBHOOK_SECRET",?\s*$/m);
    // for_each instance cannot be a removed target; moved → flat → removed.
    expect(secrets).toMatch(
      /moved\s*\{\s*from\s*=\s*google_secret_manager_secret\.secret\["RESEND_WEBHOOK_SECRET"\]\s*to\s*=\s*google_secret_manager_secret\.resend_webhook_secret_forgotten/,
    );
    expect(secrets).toMatch(
      /removed\s*\{\s*from\s*=\s*google_secret_manager_secret\.resend_webhook_secret_forgotten/,
    );
    expect(secrets).toMatch(/destroy\s*=\s*false/);
  });

  test("imported_cron_jobs covers every cron_jobs entry (state-rebuild safety)", () => {
    const scheduler = read("terraform/cloud_scheduler.tf");
    const cronJobsBlock = scheduler.match(
      /cron_jobs\s*=\s*\[([\s\S]*?)\]\s*\n/,
    );
    const importedBlock = scheduler.match(
      /imported_cron_jobs\s*=\s*toset\(\[([\s\S]*?)\]\)/,
    );
    expect(cronJobsBlock).not.toBeNull();
    expect(importedBlock).not.toBeNull();

    const nameRe = /name\s*=\s*"([^"]+)"/g;
    const cronNames = new Set<string>();
    for (const match of cronJobsBlock?.[1]?.matchAll(nameRe) ?? []) {
      cronNames.add(match[1] ?? "");
    }

    // Active list entries only (quoted string on its own line), not comments.
    const importedNames = new Set(
      [...(importedBlock?.[1]?.matchAll(/^\s*"([^"]+)",?\s*$/gm) ?? [])].map(
        (m) => m[1] ?? "",
      ),
    );

    expect(cronNames.size).toBeGreaterThan(0);
    for (const name of cronNames) {
      expect(importedNames.has(name)).toBe(true);
    }
    for (const name of importedNames) {
      expect(cronNames.has(name)).toBe(true);
    }
  });
});
