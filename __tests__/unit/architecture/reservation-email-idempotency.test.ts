/**
 * `reservation-emails.ts` の全 `sendXxxEmail` / `sendXxxNotification` の
 * `idempotencyKey` は entity id + monotonic version discriminator を含む
 * (Cluster H #16 再発防止)。
 *
 * ## なぜ要るのか
 *
 * `sendEmail` の `idempotencyKey` は同一予約が短時間に複数回同種イベントを
 * 起こすケース (SUPER_ADMIN restore で CANCELLED→CONFIRMED 巻き戻し、
 * PENDING→CONFIRMED への status flip 後の再送、部分返金の連続実行、etc.) で
 * Resend が `invalid_idempotent_request` を返し silent drop してしまうため、
 * 常に **entity id + monotonic version discriminator**
 * (icsSequence / newStatus / action / batchNonce / refundId 等) を含める SSoT
 * 契約。`sendReservationConfirmationEmail` が discriminator を欠いていた回帰
 * (Cluster H #16) の再発防止として、`reservation-emails.ts` の全
 * `sendXxxEmail`/`sendXxxNotification` の `idempotencyKey` template literal が
 * 2 つ以上の `${...}` 補間を持つことを強制する。
 *
 * ## 旧 gate との違い
 *
 * 旧 `architecture-boundaries.test.ts` 版は sender 名の抽出と
 * `idempotencyKey:` 抽出を**ファイル全体で別々の matchAll**にしていたため、
 * 「どの sender がどの idempotencyKey を持つか」を紐付けておらず、
 * sender 数と idempotencyKey 数が一致していれば実質検査になっていなかった
 * （例えば sender が 1 つ discriminator を欠いていても、別の sender が複数
 * 補間を持っていれば偶然 violations に載る場合と載らない場合が sender の
 * 並び順に依存しかねない）。新 gate はメールテンプレの meetingUrl gate
 * (architecture-boundaries.test.ts の "meetingUrl query SSoT" describe) と
 * 同じ **slice-until-next-sender** 方式で、各 sender の本文を個別に切り出し、
 * その本文内の `idempotencyKey:` を検査する。
 *
 * ## この gate が証明すること / しないこと
 *
 * **証明する**: 各 sender 関数の本文が、2 つ以上の `${...}` 補間を持つ
 * `idempotencyKey:` template literal を最低 1 つ持つこと。
 *
 * **証明しない**: 補間されている式が実際に version を単調増加させる
 * discriminator であること（`icsSequence` を渡しているつもりで実は無関係な
 * 定数式を渡していても、補間数が 2 以上であれば通る）。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();
const RESERVATION_EMAILS_FILE = join(
  ROOT,
  "src",
  "shared",
  "lib",
  "email",
  "reservation-emails.ts",
);

const SENDER_RE =
  /export\s+async\s+function\s+(send[A-Za-z]+Email|send[A-Za-z]+Notification)\s*\(/g;
const IDEMPOTENCY_RE = /idempotencyKey:\s*`([^`]+)`/g;

interface SenderBody {
  readonly name: string;
  readonly body: string;
}

/** ファイル内の全 sender 関数を名前 → その本文（次 sender or EOF まで）に分割する。 */
function sliceSenders(source: string): SenderBody[] {
  const matches = [...source.matchAll(SENDER_RE)];
  const out: SenderBody[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const name = match?.[1];
    const start = match?.index;
    if (!name || start === undefined) continue;
    const end = matches[i + 1]?.index ?? source.length;
    out.push({ name, body: source.slice(start, end) });
  }
  return out;
}

/** sender 本文内の idempotencyKey が entity id 単独か（discriminator を欠くか）。 */
function senderViolation(sender: SenderBody): string | null {
  const keys = [...sender.body.matchAll(IDEMPOTENCY_RE)];
  if (keys.length === 0) {
    return `${sender.name}: idempotencyKey が見つからない`;
  }
  const insufficient = keys.filter((match) => {
    const template = match[1] ?? "";
    const interpolations = template.match(/\$\{[^}]+\}/g) ?? [];
    return interpolations.length < 2;
  });
  if (insufficient.length > 0) {
    return `${sender.name}: ${insufficient.map((m) => `\`${m[1]}\``).join(", ")}`;
  }
  return null;
}

describe("reservation-emails.ts idempotencyKey drift gate (Cluster H #16)", () => {
  test("走査対象と母集合が空でない（gate 自体が空振りしていない）", () => {
    const source = readFileSync(RESERVATION_EMAILS_FILE, "utf8");
    const senders = sliceSenders(source);
    expect(senders.length).toBeGreaterThan(0);
    expect(senders.map((s) => s.name)).toContain(
      "sendReservationConfirmationEmail",
    );
  });

  test("通ってはいけない書き方が実際に落ちる（fixture）", () => {
    // discriminator を欠く（entity id 単独）。
    const singleInterpolation = sliceSenders(
      `export async function sendFooEmail(data) {
        return sendEmail({
          idempotencyKey: \`foo/\${data.id}\`,
        });
      }`,
    );
    expect(singleInterpolation).toHaveLength(1);
    expect(senderViolation(singleInterpolation[0]!)).not.toBeNull();

    // idempotencyKey が 1 つも無い。
    const missingKey = sliceSenders(
      `export async function sendBarEmail(data) {
        return sendEmail({ operation: "sendBarEmail" });
      }`,
    );
    expect(missingKey).toHaveLength(1);
    expect(senderViolation(missingKey[0]!)).not.toBeNull();

    // 複数 sender があり、片方だけ discriminator を欠く場合、その sender だけ
    // 落ちる（slice が sender 単位で正しく分離されていることの証明）。
    const mixed = sliceSenders(
      `export async function sendGoodEmail(data) {
        return sendEmail({ idempotencyKey: \`good/\${data.id}/\${data.version}\` });
      }
      export async function sendBadEmail(data) {
        return sendEmail({ idempotencyKey: \`bad/\${data.id}\` });
      }`,
    );
    expect(mixed).toHaveLength(2);
    expect(senderViolation(mixed[0]!)).toBeNull();
    expect(senderViolation(mixed[1]!)).not.toBeNull();
  });

  test("通ってよい書き方は落ちない（fixture）", () => {
    const twoInterpolations = sliceSenders(
      `export async function sendFooEmail(data) {
        return sendEmail({
          idempotencyKey: \`foo/\${data.id}/\${data.icsSequence}\`,
        });
      }`,
    );
    expect(twoInterpolations).toHaveLength(1);
    expect(senderViolation(twoInterpolations[0]!)).toBeNull();

    const threeInterpolations = sliceSenders(
      `export async function sendBarNotification(data) {
        return sendEmail({
          idempotencyKey: \`bar/\${data.id}/\${data.action}/\${data.icsSequence}\`,
        });
      }`,
    );
    expect(threeInterpolations).toHaveLength(1);
    expect(senderViolation(threeInterpolations[0]!)).toBeNull();
  });

  test("reservation-emails.ts の全 sendXxxEmail idempotencyKey は entity id + version discriminator を含む", () => {
    const source = readFileSync(RESERVATION_EMAILS_FILE, "utf8");
    const senders = sliceSenders(source);
    expect(senders.length).toBeGreaterThan(0);

    const violations = senders
      .map((sender) => senderViolation(sender))
      .filter((v): v is string => v !== null);

    expect(
      violations,
      `reservation-emails.ts に idempotencyKey が entity id 単独 (\`prefix/\${id}\` 形式) の sender が残っています: ${violations.join("; ")}. icsSequence / newStatus / action / batchNonce / refundId 等の monotonic discriminator を追加してください (Cluster H #16 再発防止)。`,
    ).toEqual([]);
  });
});
