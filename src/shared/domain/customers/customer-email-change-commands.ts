import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";

/** verification token の TTL (1 時間)。email テンプレの文言と揃える。 */
const EMAIL_CHANGE_TOKEN_TTL_MS = 60 * 60 * 1000;

/** URL に載せる raw token の byte 長 → base64url 43 文字。 */
const EMAIL_CHANGE_TOKEN_BYTES = 32;

const EMAIL_ALREADY_SET_MESSAGE =
  "メールアドレスは既に登録済みです。変更するには別の手続きが必要です。";

const EMAIL_TAKEN_MESSAGE =
  "このメールアドレスは他の顧客が使用しているため登録できません。";

const VERIFICATION_INVALID_MESSAGE =
  "確認 URL が無効か有効期限が切れています。再度メールアドレスを入力してください。";

const VERIFICATION_ALREADY_APPLIED_MESSAGE =
  "この確認 URL は既に使用済みです。";

function hashEmailChangeToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * verification token を生成し、PendingCustomerEmailChange 行を差し替え発行する。
 *
 * - Customer.email が既に非空なら VALIDATION (この command は「初回登録」限定)
 * - Better Auth 側 User.email との衝突 → CONFLICT (main SETTINGS-02 の
 *   canonical 認証 identity レベル check を継承)
 * - 同 canonical の別 Customer (guest / linked 問わず) との衝突 → CONFLICT
 *   (SETTINGS-02: 未リンク顧客への「他人 email 横取り」を塞ぐ)
 * - 既存の未消費 pending 行があれば削除して新規発行 (最新の 1 件だけが有効)
 *
 * verification token は raw のまま呼び出し側 (Server Action) に返す。DB には
 * SHA-256 ハッシュのみ保存し、raw は URL クリック時にのみ突合される
 * (メールクライアント・プロキシ経由でも DB 上の値だけでは URL を再構成できない)。
 */
export async function requestCustomerEmailChangeCommand(
  userId: string,
  newEmail: string,
): Promise<{ rawToken: string; expiresAt: Date; customerId: string }> {
  const trimmed = newEmail.trim();
  if (trimmed.length === 0) {
    throw new DomainError("メールアドレスを入力してください", "VALIDATION");
  }
  const canonical = normalizeEmailForIdentity(trimmed);

  const rawToken = randomBytes(EMAIL_CHANGE_TOKEN_BYTES).toString("base64url");
  const tokenHash = hashEmailChangeToken(rawToken);
  const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TOKEN_TTL_MS);

  return prisma.$transaction(async (tx) => {
    const current = await tx.customer.findUniqueOrThrow({
      where: { userId },
      select: { id: true, email: true },
    });

    if (current.email !== null && current.email !== "") {
      throw new DomainError(EMAIL_ALREADY_SET_MESSAGE, "VALIDATION");
    }

    // 1. Better Auth 側 User.email と衝突するなら CONFLICT。
    //    main の SETTINGS-02 (PR #1217) が canonical 認証 identity レベルの
    //    check を要求しているためここでも継続する。case-insensitive で
    //    比較して大文字混在入力による回避も塞ぐ。
    const conflictingUser = await tx.user.findFirst({
      where: {
        email: { equals: canonical, mode: "insensitive" },
        NOT: { id: userId },
      },
      select: { id: true },
    });
    if (conflictingUser) {
      throw new DomainError(EMAIL_TAKEN_MESSAGE, "CONFLICT");
    }

    // 2. 同 canonical の別 Customer と衝突するなら CONFLICT。
    //    リンク済み・未リンク問わず全 Customer が対象 (main SETTINGS-02 と同じスコープ)。
    const conflictingCustomer = await tx.customer.findFirst({
      where: {
        emailCanonical: canonical,
        NOT: { id: current.id },
      },
      select: { id: true },
    });
    if (conflictingCustomer) {
      throw new DomainError(EMAIL_TAKEN_MESSAGE, "CONFLICT");
    }

    // 同一顧客の未消費 pending は上書き (最新の 1 件だけを有効にする)。
    await tx.pendingCustomerEmailChange.deleteMany({
      where: { customerId: current.id, consumedAt: null },
    });

    await tx.pendingCustomerEmailChange.create({
      data: {
        customerId: current.id,
        newEmail: trimmed,
        newEmailCanonical: canonical,
        tokenHash,
        expiresAt,
      },
    });

    return { rawToken, expiresAt, customerId: current.id };
  });
}

/**
 * 確認ページ (GET) 用: token を read-only で検証する。Customer.email は更新しない。
 *
 * consume 前の link scanner 対策 (HTTP-02) で、メールリンク着地時に
 * token の存在・期限・未消費のみを確認する。email 衝突チェックは POST consume 時。
 */
export async function validateCustomerEmailChangeTokenCommand(
  rawToken: string,
): Promise<void> {
  const tokenHash = hashEmailChangeToken(rawToken);
  const pending = await prisma.pendingCustomerEmailChange.findUnique({
    where: { tokenHash },
    select: {
      expiresAt: true,
      consumedAt: true,
    },
  });

  if (!pending) {
    throw new DomainError(VERIFICATION_INVALID_MESSAGE, "VALIDATION");
  }

  if (pending.consumedAt !== null) {
    throw new DomainError(VERIFICATION_ALREADY_APPLIED_MESSAGE, "VALIDATION");
  }

  if (pending.expiresAt.getTime() <= Date.now()) {
    throw new DomainError(VERIFICATION_INVALID_MESSAGE, "VALIDATION");
  }
}

/**
 * verification URL クリック時: token を突合して Customer.email に反映する。
 *
 * - token 不一致・期限切れ → VALIDATION (`VERIFICATION_INVALID_MESSAGE`)
 * - 既に consumed → VALIDATION (`VERIFICATION_ALREADY_APPLIED_MESSAGE`)
 * - 期間中に他の未リンク顧客がその email を使い始めていた → CONFLICT
 *
 * consumedAt は single-use を強制するため必ずマークする (期限切れ判定より先に
 * トークンを見つけたら再検証は不可 = 期限内 1 回のみ有効)。
 */
export async function consumeCustomerEmailChangeCommand(
  rawToken: string,
): Promise<{ customerId: string; newEmail: string }> {
  const tokenHash = hashEmailChangeToken(rawToken);

  return prisma.$transaction(async (tx) => {
    const pending = await tx.pendingCustomerEmailChange.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        customerId: true,
        newEmail: true,
        newEmailCanonical: true,
        expiresAt: true,
        consumedAt: true,
      },
    });

    if (!pending) {
      throw new DomainError(VERIFICATION_INVALID_MESSAGE, "VALIDATION");
    }

    if (pending.consumedAt !== null) {
      throw new DomainError(VERIFICATION_ALREADY_APPLIED_MESSAGE, "VALIDATION");
    }

    if (pending.expiresAt.getTime() <= Date.now()) {
      throw new DomainError(VERIFICATION_INVALID_MESSAGE, "VALIDATION");
    }

    // 現行 Customer 情報 (userId 除外用) を取得。
    const currentCustomer = await tx.customer.findUniqueOrThrow({
      where: { id: pending.customerId },
      select: { userId: true },
    });

    // request 時点で uniqueness を通していても、click までの間に別の Customer /
    // User がその email を使い始める可能性があるため、consume 時に再チェック。
    // scope は request 時と同じ (Better Auth User.email + 全 Customer.emailCanonical)。
    // 自 Customer に紐づく User は self 除外する (LINE OAuth 経由で account link 済みの
    // ケースで自 User.email が偶然一致するのを false-positive にしないため)。
    const userExclusion = currentCustomer.userId
      ? { NOT: { id: currentCustomer.userId } }
      : {};
    const conflictingUser = await tx.user.findFirst({
      where: {
        email: { equals: pending.newEmailCanonical, mode: "insensitive" },
        ...userExclusion,
      },
      select: { id: true },
    });
    if (conflictingUser) {
      throw new DomainError(EMAIL_TAKEN_MESSAGE, "CONFLICT");
    }

    const conflictingCustomer = await tx.customer.findFirst({
      where: {
        emailCanonical: pending.newEmailCanonical,
        NOT: { id: pending.customerId },
      },
      select: { id: true },
    });
    if (conflictingCustomer) {
      throw new DomainError(EMAIL_TAKEN_MESSAGE, "CONFLICT");
    }

    // single-use を先にマーク (Customer.update が失敗しても再クリックは無効化)
    await tx.pendingCustomerEmailChange.update({
      where: { id: pending.id },
      data: { consumedAt: new Date() },
    });

    await tx.customer.update({
      where: { id: pending.customerId },
      data: {
        email: pending.newEmail,
        emailCanonical: pending.newEmailCanonical,
      },
    });

    return { customerId: pending.customerId, newEmail: pending.newEmail };
  });
}
