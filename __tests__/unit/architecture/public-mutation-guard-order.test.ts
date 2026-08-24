/**
 * 公開 Server Action の mutation guard 順序契約。
 *
 * 最安チェックを先に置く不変契約。順序変更は silent regression（Turnstile
 * トークン消費タイミング・email 第二防壁の迂回）になるため、handler 本体を
 * 静的解析で固定する。
 *
 * 4 段のフル pipeline:
 *   checkActionRateLimit → checkEmailRateLimit → checkBotHeuristics → validateTurnstile
 *
 * 各エントリの `guards` はその handler が満たすべき **順序つき部分列**。
 * 空配列は「この mutation は認証済みフローのため公開 bot/rate/Turnstile
 * pipeline を持たない」ことを明示する（consumeSignupTermsAction）。
 *
 * Reads (`fetch*` / `get*`) は命名規約で検査対象外。その prefix を外した
 * 読み取りは fail-safe（false positive: mutation として登録するまで赤）。
 *
 * ## 走査根は `(public)` 全体（監査 A-58）
 *
 * 以前は `_shared/actions` の **1 ディレクトリ非再帰**だけを見ており、
 * 「公開 mutation の SSoT（このリストが正本）」と宣言しながら
 * claim / ゲストキャンセル / mypage / login 配下の `"use server"` module を
 * **1 本も見ていなかった**。現在は `(public)` を再帰走査し、
 * `"use server"` を含む module の exported async function を全件登録させる。
 *
 * ## `guards: []` の 2 つの意味を分ける
 *
 * 空配列は「この mutation は公開 bot/rate/Turnstile pipeline を持たない」の意。
 * ただし guard が**ラッパに委譲**されている場合は `delegatesTo` でその名前を書く。
 * gate はそのラッパが handler 本体から実際に呼ばれていることを検査するので、
 * 「空だが実は守られている」主張が検査可能になる。
 */

import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";
import { ScriptKind, ScriptTarget, createSourceFile } from "typescript";

import { collectSourceFiles } from "../../helpers/architecture-fs";
import { exportedAsyncDeclarations } from "../../helpers/exported-async-declarations";

const ROOT = process.cwd();
const PUBLIC_ROOT = join(ROOT, "src", "app", "(public)");
const PUBLIC_ACTIONS_DIR = join(PUBLIC_ROOT, "_shared", "actions");

const FOUR_STAGE_GUARDS = [
  "checkActionRateLimit",
  "checkEmailRateLimit",
  "checkBotHeuristics",
  "validateTurnstile",
] as const;

function actionFile(name: string): string {
  return join(PUBLIC_ACTIONS_DIR, name);
}

/** `(public)` 直下からの相対パス。 */
function publicFile(...segments: readonly string[]): string {
  return join(PUBLIC_ROOT, ...segments);
}

/** 公開 mutation の SSoT（このリストが正本） */
const PUBLIC_MUTATION_GUARD_PIPELINES: readonly {
  readonly file: string;
  readonly handler: string;
  readonly guards: readonly string[];
  /** guard を委譲しているラッパ名（`guards: []` の理由を検査可能にする）。 */
  readonly delegatesTo?: string;
}[] = [
  {
    file: actionFile("reservation.ts"),
    handler: "submitReservation",
    guards: FOUR_STAGE_GUARDS,
  },
  {
    file: actionFile("event-registration.ts"),
    handler: "registerForEvent",
    guards: FOUR_STAGE_GUARDS,
  },
  {
    file: actionFile("event-registration.ts"),
    handler: "registerForEventWaitlist",
    guards: FOUR_STAGE_GUARDS,
  },
  {
    file: actionFile("inquiry.ts"),
    handler: "submitInquiry",
    guards: ["checkActionRateLimit", "checkBotHeuristics", "validateTurnstile"],
  },
  {
    file: actionFile("review.ts"),
    handler: "submitReview",
    guards: ["checkActionRateLimit", "validateTurnstile"],
  },
  {
    file: actionFile("event-registration.ts"),
    handler: "cancelEventRegistration",
    guards: ["checkActionRateLimit", "validateTurnstile"],
  },
  {
    file: actionFile("reveal-reservation-passcodes.ts"),
    handler: "revealReservationPasscodesAction",
    guards: ["checkActionRateLimit"],
  },
  // Web Vitals は同意済みブラウザからの計測サンプル。bot 判定も Turnstile も
  // 意味を持たない（人間の操作ではない）が、**無制限に書けてはいけない**
  // ため rate limit だけを要求する（監査 A-49）。
  {
    file: actionFile("web-vital.ts"),
    handler: "reportWebVitalAction",
    guards: ["checkActionRateLimit"],
  },
  // 認証済みフロー（mypage / claim callback）。公開 bot pipeline は持たない。
  {
    file: actionFile("consume-signup-terms.ts"),
    handler: "consumeSignupTermsAction",
    guards: [],
  },

  // --- claim（メールの claim リンク→会員へ紐づけ）-----------------------
  {
    file: publicFile("claim", "reservation", "_actions", "claim.ts"),
    handler: "claimReservationAction",
    guards: ["checkActionRateLimit"],
  },
  {
    file: publicFile("claim", "event-registration", "_actions", "claim.ts"),
    handler: "claimEventRegistrationAction",
    guards: ["checkActionRateLimit"],
  },

  // --- ゲストトークン経路 -----------------------------------------------
  // rate limit と Turnstile は `runGuestTokenMutation` が一括でかける。
  {
    file: publicFile("reservation", "cancel", "_actions", "cancel.ts"),
    handler: "cancelGuestReservationAction",
    guards: [],
    delegatesTo: "runGuestTokenMutation",
  },
  {
    file: publicFile("events", "cancel", "_actions", "cancel.ts"),
    handler: "cancelGuestEventRegistrationAction",
    guards: [],
    delegatesTo: "runGuestTokenMutation",
  },
  {
    file: publicFile("reservation", "status", "edit", "_actions", "update.ts"),
    handler: "updateGuestReservationAction",
    guards: ["checkActionRateLimit", "validateTurnstile"],
  },
  {
    file: publicFile(
      "events",
      "registrations",
      "status",
      "edit",
      "_actions",
      "update.ts",
    ),
    handler: "updateGuestEventRegistrationAction",
    guards: ["checkActionRateLimit", "validateTurnstile"],
  },
  {
    file: publicFile("events", "waitlist", "confirm", "_actions", "confirm.ts"),
    handler: "confirmWaitlistOfferAction",
    guards: ["checkActionRateLimit", "validateTurnstile"],
  },
  // 注: `FOUR_STAGE_GUARDS` と bot / email の順が逆。こちらは
  // 同期の `checkBotHeuristics`（ヘッダ検査だけ）を await する
  // `checkEmailRateLimit` より先に置いており、docstring の「最安チェックを先に」
  // に従えばこの順の方が正しい。既存 3 ハンドラの順を揃えるかどうかは
  // guard 連鎖の振る舞い変更になるので、ここでは実態を固定するに留める。
  {
    file: publicFile("receipts", "reissue-request", "_actions", "resend.ts"),
    handler: "requestReceiptResendAction",
    guards: [
      "checkActionRateLimit",
      "checkBotHeuristics",
      "checkEmailRateLimit",
      "validateTurnstile",
    ],
  },

  // --- login -------------------------------------------------------------
  // 自分のセッションを消すだけ。冗等で、他人に影響しない。
  {
    file: publicFile("login", "_actions", "sign-out.ts"),
    handler: "signOutCustomerAction",
    guards: [],
  },
  // dev / E2E 専用。本番では `NEXT_PUBLIC_ENABLE_E2E_LOGIN` opt-in が無い限り届かない。
  {
    file: publicFile("login", "_components", "dev-login-action.ts"),
    handler: "devCustomerLoginAction",
    guards: [],
  },
  {
    file: publicFile("login", "_components", "signup-terms-action.ts"),
    handler: "setSignupTermsAgreementCookie",
    guards: ["checkActionRateLimit", "validateTurnstile"],
  },

  // --- mypage（セッション必須。bot pipeline は不要だが rate limit はかける）-----
  {
    file: publicFile("mypage", "_shared", "actions", "account.ts"),
    handler: "unlinkAccountAction",
    guards: ["checkActionRateLimit"],
  },
  {
    file: publicFile("mypage", "_shared", "actions", "account.ts"),
    handler: "deleteAccountAction",
    guards: ["checkActionRateLimit", "validateTurnstile"],
  },
  {
    file: publicFile("mypage", "_shared", "actions", "customer-merge.ts"),
    handler: "requestCustomerMergeAction",
    guards: ["checkActionRateLimit", "checkEmailRateLimit"],
  },
  {
    file: publicFile("mypage", "_shared", "actions", "customer-merge.ts"),
    handler: "confirmCustomerMergeAction",
    guards: ["checkActionRateLimit"],
  },
  {
    file: publicFile("mypage", "_shared", "actions", "event-registration.ts"),
    handler: "updateCustomerEventRegistrationAction",
    guards: ["checkActionRateLimit", "validateTurnstile"],
  },
  {
    file: publicFile("mypage", "_shared", "actions", "event-registration.ts"),
    handler: "startEventCheckoutSessionAction",
    guards: ["checkActionRateLimit"],
  },
  {
    file: publicFile("mypage", "_shared", "actions", "inquiry.ts"),
    handler: "replyToInquiryAction",
    guards: ["checkActionRateLimit", "validateTurnstile"],
  },
  // `checkEmailRateLimit` は**メールアドレス変更の枝の中**にあるので、
  // Turnstile より後ろになるのが正しい（変更が無ければそもそも走らない）。
  {
    file: publicFile("mypage", "_shared", "actions", "profile.ts"),
    handler: "updateProfileAction",
    guards: [
      "checkActionRateLimit",
      "validateTurnstile",
      "checkEmailRateLimit",
    ],
  },
  {
    file: publicFile("mypage", "_shared", "actions", "reservation-series.ts"),
    handler: "cancelReservationSeriesCustomerAction",
    guards: ["checkActionRateLimit", "validateTurnstile"],
  },
  {
    file: publicFile("mypage", "_shared", "actions", "reservation.ts"),
    handler: "startCheckoutSessionAction",
    guards: ["checkActionRateLimit"],
  },
  {
    file: publicFile("mypage", "_shared", "actions", "reservation.ts"),
    handler: "cancelReservationAction",
    guards: ["checkActionRateLimit", "validateTurnstile"],
  },
  {
    file: publicFile("mypage", "_shared", "actions", "reservation.ts"),
    handler: "updateReservationAction",
    guards: ["checkActionRateLimit", "validateTurnstile"],
  },
  // 規約の再同意。セッションの本人の同意を 1 行書くだけ。
  {
    file: publicFile("mypage", "terms", "reagree", "_actions.ts"),
    handler: "reagreeAction",
    guards: [],
  },
];

const GUARD_CALL_PATTERNS: Readonly<Record<string, RegExp>> = {
  checkActionRateLimit: /\bcheckActionRateLimit\s*\(/u,
  checkEmailRateLimit: /\bcheckEmailRateLimit\s*\(/u,
  checkBotHeuristics: /\bcheckBotHeuristics\s*\(/u,
  validateTurnstile: /\bvalidateTurnstile\s*\(/u,
};

function parseModule(file: string, source: string) {
  return createSourceFile(
    file,
    source,
    ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ScriptKind.TSX : ScriptKind.TS,
  );
}

/**
 * handler の本体ソースを **AST の範囲**で切り出す。
 *
 * 以前は「`export async function <handler>` から次の
 * `export async function` まで」を文字列で切っていた。これは 2 通りに壊れる:
 *
 * - アロー形の export（`export const foo = async () => {}`）が間に挟まると
 *   その本体まで飲み込み、**隣の関数の guard 呼び出しを自分のものとして数える**
 * - ファイル末尾の handler は残り全部を取る
 *
 * ノードの範囲で切れば、どちらも起きない。
 */
function extractExportedFunctionSource(
  file: string,
  source: string,
  handler: string,
): string {
  const declaration = exportedAsyncDeclarations(parseModule(file, source)).find(
    ({ name }) => name === handler,
  );
  if (declaration === undefined) {
    throw new Error(`exported async ${handler} not found in ${file}`);
  }
  return declaration.node.getText();
}

function findGuardCallIndices(
  handlerSource: string,
  guards: readonly string[],
) {
  return guards.map((name) => {
    const pattern = GUARD_CALL_PATTERNS[name];
    if (!pattern) {
      return { name, index: -1 };
    }
    const match = pattern.exec(handlerSource);
    return { name, index: match?.index ?? -1 };
  });
}

function discoverPublicMutations(): readonly {
  readonly file: string;
  readonly handler: string;
}[] {
  // `(public)` 全体を再帰し、`"use server"` を含む module だけを見る（監査 A-58）。
  // 1 ディレクトリ固定だと claim / ゲストキャンセル / mypage / login が丸ごと落ちる。
  const actionFiles = collectSourceFiles(PUBLIC_ROOT).filter((file) =>
    readFileSync(file, "utf8").includes('"use server"'),
  );

  const mutations: { file: string; handler: string }[] = [];
  for (const file of actionFiles) {
    const source = readFileSync(file, "utf8");
    // 宣言形とアロー形の両方を見る。正規表現だった頃は
    // `export const foo = async () => {}` を 1 件も検出せず、その形の公開
    // mutation は SSoT への登録を求められなかった。
    for (const { name } of exportedAsyncDeclarations(
      parseModule(file, source),
    )) {
      if (name.startsWith("fetch") || name.startsWith("get")) {
        continue;
      }
      mutations.push({ file, handler: name });
    }
  }
  return mutations;
}

describe("public mutation guard order", () => {
  /**
   * 発見と本体切り出しの見本。
   *
   * この gate は docstring で「exported async function を**全件**登録させる」と
   * 宣言しているのに、実装は `/^export async function (\w+)/` の正規表現だった。
   * アロー形の公開 mutation は SSoT への登録を求められず、Turnstile も
   * rate limit も無いまま素通りできた。
   */
  test("発見はアロー形も拾い、async でないものは拾わない（見本）", () => {
    const source = [
      `"use server";`,
      `export async function fnFormAction() {}`,
      `export const arrowFormAction = async () => {};`,
      `export const fnExprAction = async function () {};`,
      `export const notAsync = () => {};`,
      `const notExported = async () => {};`,
    ].join("\n");
    expect(
      exportedAsyncDeclarations(parseModule("fixture.ts", source)).map(
        ({ name }) => name,
      ),
    ).toEqual(["fnFormAction", "arrowFormAction", "fnExprAction"]);
  });

  /**
   * 本体の切り出しが隣の宣言へ漏れない。
   *
   * 旧実装は「次の `export async function` まで」を文字列で切っていたので、
   * **後続がアロー形だと最後まで飲み込み**、隣の関数の guard 呼び出しを
   * 自分のものとして数えていた。順序契約の判定が静かに狂う形。
   */
  test("本体の切り出しが隣の宣言へ漏れない（見本）", () => {
    const source = [
      `export async function first() { return 1; }`,
      `export const second = async () => { await validateTurnstile(); };`,
    ].join("\n");
    const firstSource = extractExportedFunctionSource(
      "fixture.ts",
      source,
      "first",
    );
    expect(firstSource).toContain("return 1");
    expect(firstSource).not.toContain("validateTurnstile");
  });

  test("SSoT action files exist", () => {
    const uniqueFiles = [
      ...new Set(PUBLIC_MUTATION_GUARD_PIPELINES.map(({ file }) => file)),
    ];
    for (const file of uniqueFiles) {
      expect(existsSync(file)).toBe(true);
    }
  });

  test("each handler's guards appear as an ordered subsequence", () => {
    const violations: string[] = [];

    for (const {
      file,
      handler,
      guards,
      delegatesTo,
    } of PUBLIC_MUTATION_GUARD_PIPELINES) {
      const label = `${relative(ROOT, file).replaceAll("\\", "/")}#${handler}`;
      const source = readFileSync(file, "utf8");
      const handlerSource = extractExportedFunctionSource(
        file,
        source,
        handler,
      );
      const indices = findGuardCallIndices(handlerSource, guards);

      // `guards: []` + `delegatesTo` は「guard はラッパにある」という主張。
      // 主張しただけで通さない — そのラッパを実際に呼んでいることを見る。
      // `[<(]` は型引数付きの呼出（`runGuestTokenMutation<T>({...})`）を拾うため。
      // `(` だけだと events/cancel を取りこぼす（監査 A-97 と同じ形）。
      if (
        delegatesTo !== undefined &&
        !new RegExp(String.raw`\b${delegatesTo}\s*[<(]`, "u").test(
          handlerSource,
        )
      ) {
        violations.push(`${label}: does not call ${delegatesTo}`);
      }

      const listed = new Set(guards);
      const undeclared = Object.keys(GUARD_CALL_PATTERNS).filter((name) => {
        if (listed.has(name)) {
          return false;
        }
        const pattern = GUARD_CALL_PATTERNS[name];
        return pattern !== undefined && pattern.test(handlerSource);
      });
      if (undeclared.length > 0) {
        violations.push(
          `${label}: undeclared guards: ${undeclared.join(", ")}`,
        );
      }

      const missing = indices
        .filter(({ index }) => index < 0)
        .map(({ name }) => name);
      if (missing.length > 0) {
        violations.push(`${label}: missing guards: ${missing.join(", ")}`);
        continue;
      }

      for (let i = 0; i < indices.length - 1; i += 1) {
        const current = indices[i];
        const next = indices[i + 1];
        if (current === undefined || next === undefined) {
          continue;
        }
        if (current.index >= next.index) {
          violations.push(
            `${label}: ${current.name} must precede ${next.name} (found at ${current.index} vs ${next.index})`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  /**
   * Reads (`fetch*` / `get*`) are excluded by naming convention. Renaming a
   * read away from that prefix fails safe (false positive: it must be
   * registered as a mutation until renamed back or added here).
   */
  test("every public mutation is registered and every registry handler exists", () => {
    const discovered = discoverPublicMutations();
    // 走査が 0 件だと「違反なし」と区別できない（local/gate-scan-must-not-be-silently-empty）。
    expect(discovered.length).toBeGreaterThan(25);
    const registeredHandlers = new Set(
      PUBLIC_MUTATION_GUARD_PIPELINES.map(({ handler }) => handler),
    );
    const discoveredHandlers = new Set(
      discovered.map(({ handler }) => handler),
    );

    const unregistered = discovered
      .filter(({ handler }) => !registeredHandlers.has(handler))
      .map(
        ({ file, handler }) =>
          `${relative(ROOT, file).replaceAll("\\", "/")}#${handler}`,
      );
    const stale = PUBLIC_MUTATION_GUARD_PIPELINES.filter(
      ({ handler }) => !discoveredHandlers.has(handler),
    ).map(({ handler }) => handler);

    expect({ unregistered, stale }).toEqual({ unregistered: [], stale: [] });
  });
});
