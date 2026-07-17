import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/shared/db/prisma";
import { parsePrismaInputJson } from "@/shared/db/json";
import { Prisma, type TermsAgreement } from "@generated/prisma/client";
import type {
  TermsScope,
  TermsScopeValue,
} from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import { assertAllowedManagedImageSourcesInJson } from "@/shared/domain/media/managed-image-assertions";
import {
  buildOrderScopeLockSql,
  buildUuidOrderSqlFragments,
} from "@/shared/domain/order-sql";
import { sanitizeContentHtml } from "@/shared/lib/html/sanitize";
import type { TermsFormInput } from "@/shared/lib/validations/terms";

interface SlugOnly {
  id: string;
  slug: string;
}

async function ensureSlugAvailable(
  slug: string,
  currentId?: string,
): Promise<void> {
  const existing = await prisma.termsDocument.findFirst({
    where: { slug, ...(currentId && { id: { not: currentId } }) },
    select: { id: true },
  });
  if (existing) {
    throw new DomainError("このスラッグは既に使用されています", "CONFLICT");
  }
}

/**
 * Lexical client / server が生成した HTML を server-side で sanitize-html により検証する。
 * contentHtml は admin action で contentJson から派生済みであること（TermsAgreement 境界）。
 */
function buildContent(input: TermsFormInput) {
  assertAllowedManagedImageSourcesInJson("規約本文画像", input.contentJson);

  return {
    contentJson: parsePrismaInputJson(
      input.contentJson,
      "contentJson が不正です",
    ),
    contentHtml: sanitizeContentHtml(input.contentHtml),
  };
}

/**
 * 規約作成
 */
export async function createTermsCommand(
  input: TermsFormInput,
): Promise<SlugOnly> {
  await ensureSlugAvailable(input.slug);

  const { contentJson, contentHtml } = buildContent(input);

  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql("terms_documents:active"));

    const maxOrder = await tx.termsDocument.aggregate({
      where: { deletedAt: null },
      _max: { displayOrder: true },
    });

    return tx.termsDocument.create({
      data: {
        type: input.type,
        slug: input.slug,
        title: input.title,
        contentJson,
        contentHtml,
        isPublished: input.isPublished,
        publishedAt: input.isPublished ? new Date() : null,
        scopes: [...input.scopes],
        changelog: input.changelog,
        showInFooter: input.showInFooter,
        // displayOrder はシステム管理（末尾に自動採番、D&D reorder が SSoT）
        displayOrder: (maxOrder._max.displayOrder ?? -1) + 1,
      },
      select: { id: true, slug: true },
    });
  });

  return created;
}

/**
 * 規約更新
 */
export async function updateTermsCommand(
  id: string,
  input: TermsFormInput,
): Promise<SlugOnly & { previousSlug: string }> {
  const existing = await prisma.termsDocument.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, slug: true, isPublished: true, publishedAt: true },
  });
  if (!existing) {
    throw new DomainError("規約が見つかりません", "NOT_FOUND");
  }

  if (input.slug !== existing.slug) {
    await ensureSlugAvailable(input.slug, id);
  }

  const { contentJson, contentHtml } = buildContent(input);

  // 公開状態が false → true に変わった場合のみ publishedAt を更新
  // 既に公開済みなら publishedAt を保持、未公開化なら null
  const publishedAt = (() => {
    if (!input.isPublished) return null;
    if (existing.isPublished && existing.publishedAt)
      return existing.publishedAt;
    return new Date();
  })();

  const updated = await prisma.termsDocument.update({
    where: { id },
    data: {
      type: input.type,
      slug: input.slug,
      title: input.title,
      contentJson,
      contentHtml,
      isPublished: input.isPublished,
      publishedAt,
      scopes: { set: [...input.scopes] },
      changelog: input.changelog,
      showInFooter: input.showInFooter,
      // displayOrder は変更しない（位置は reorderTermsCommand のみが変更）
    },
    select: { id: true, slug: true },
  });

  return { ...updated, previousSlug: existing.slug };
}

/**
 * 規約の表示順を D&D 並び替えで更新（displayOrder の SSoT）
 *
 * `orderedIds` の並び順で displayOrder を 0 始まりで再採番する。
 */
export async function reorderTermsCommand(
  orderedIds: readonly string[],
): Promise<{ updated: number }> {
  if (orderedIds.length === 0) {
    return { updated: 0 };
  }

  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new DomainError("同じIDを複数指定することはできません", "VALIDATION");
  }

  const existing = await prisma.termsDocument.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((term) => term.id));

  for (const id of orderedIds) {
    if (!existingIds.has(id)) {
      throw new DomainError("規約が見つかりません", "NOT_FOUND");
    }
  }

  if (existing.length !== orderedIds.length) {
    throw new DomainError("規約数が一致しません（過不足）", "VALIDATION");
  }

  const { ids, tempCases, finalCases } = buildUuidOrderSqlFragments(
    orderedIds,
    (id) => id,
    (_id, index) => index,
  );

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql("terms_documents:active"));

    await tx.$executeRaw`
      UPDATE "terms_documents"
      SET "displayOrder" = CASE "id" ${Prisma.join(tempCases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
        AND "deletedAt" IS NULL
    `;

    await tx.$executeRaw`
      UPDATE "terms_documents"
      SET "displayOrder" = CASE "id" ${Prisma.join(finalCases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
        AND "deletedAt" IS NULL
    `;
  });

  return { updated: orderedIds.length };
}

/**
 * 規約の公開状態を直接更新（PublishSwitch 用）
 *
 * 公開化時は publishedAt を新規発行、非公開化時は null にクリアする。
 * 既に公開済みなら publishedAt を保持する（updateTermsCommand と整合）。
 */
export async function updateTermsPublishedCommand(
  id: string,
  isPublished: boolean,
): Promise<SlugOnly & { isPublished: boolean }> {
  const existing = await prisma.termsDocument.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, slug: true, isPublished: true, publishedAt: true },
  });
  if (!existing) {
    throw new DomainError("規約が見つかりません", "NOT_FOUND");
  }

  const publishedAt = (() => {
    if (!isPublished) return null;
    if (existing.isPublished && existing.publishedAt)
      return existing.publishedAt;
    return new Date();
  })();

  const updated = await prisma.termsDocument.update({
    where: { id },
    data: { isPublished, publishedAt },
    select: { id: true, slug: true },
  });

  return { ...updated, isPublished };
}

/**
 * 規約のフッター掲載可否を直接更新（TermsTable の表示面管理用）。
 */
export async function updateTermsFooterVisibilityCommand(
  id: string,
  showInFooter: boolean,
): Promise<SlugOnly & { showInFooter: boolean }> {
  const existing = await prisma.termsDocument.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, slug: true },
  });
  if (!existing) {
    throw new DomainError("規約が見つかりません", "NOT_FOUND");
  }

  const updated = await prisma.termsDocument.update({
    where: { id },
    data: { showInFooter },
    select: { id: true, slug: true, showInFooter: true },
  });

  return updated;
}

/**
 * 規約削除（ソフトデリート）
 */
export async function softDeleteTermsCommand(id: string): Promise<SlugOnly> {
  const existing = await prisma.termsDocument.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, slug: true },
  });
  if (!existing) {
    throw new DomainError("規約が見つかりません", "NOT_FOUND");
  }

  await prisma.termsDocument.update({
    where: { id },
    data: { deletedAt: new Date(), isPublished: false },
  });

  return existing;
}

/**
 * 規約物理削除（ソフトデリート済みのみ・同意記録があれば不可）
 *
 * 同意記録に紐づく規約を物理削除すると `onDelete: Restrict` により Prisma が
 * 生エラーを bubble するため、コマンド層で件数 pre-check し DomainError に
 * 変換する (admin UI 側で適切なメッセージ表示)。
 */
export async function hardDeleteTermsCommand(
  id: string,
): Promise<{ id: string }> {
  const existing = await prisma.termsDocument.findUnique({
    where: { id },
    select: {
      id: true,
      deletedAt: true,
      _count: { select: { agreements: true } },
    },
  });
  if (!existing) {
    throw new DomainError("規約が見つかりません", "NOT_FOUND");
  }
  if (!existing.deletedAt) {
    throw new DomainError("削除済みの規約のみ物理削除できます", "VALIDATION");
  }
  if (existing._count.agreements > 0) {
    throw new DomainError(
      "この規約には同意記録が残っているため物理削除できません",
      "CONFLICT",
    );
  }

  await prisma.termsDocument.delete({ where: { id } });
  return { id };
}

/**
 * 規約復元（ソフトデリート済みのみ）
 *
 * 復元時は `isPublished: false`（下書き）として戻し、slug 衝突がないか確認する。
 */
export async function restoreTermsCommand(id: string): Promise<SlugOnly> {
  const existing = await prisma.termsDocument.findUnique({
    where: { id },
    select: { id: true, slug: true, deletedAt: true },
  });
  if (!existing) {
    throw new DomainError("規約が見つかりません", "NOT_FOUND");
  }
  if (!existing.deletedAt) {
    throw new DomainError("削除済みの規約のみ復元できます", "VALIDATION");
  }

  // 同一 slug の有効レコードが存在しないか確認（削除中に新規作成された可能性）
  const conflict = await prisma.termsDocument.findFirst({
    where: { slug: existing.slug, deletedAt: null, id: { not: id } },
    select: { id: true },
  });
  if (conflict) {
    throw new DomainError(
      "同一スラッグの規約が既に存在するため復元できません。先にスラッグを変更してください。",
      "CONFLICT",
    );
  }

  const restored = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql("terms_documents:active"));

    const maxOrder = await tx.termsDocument.aggregate({
      where: { deletedAt: null },
      _max: { displayOrder: true },
    });

    return tx.termsDocument.update({
      where: { id },
      data: {
        deletedAt: null,
        isPublished: false,
        publishedAt: null,
        displayOrder: (maxOrder._max.displayOrder ?? -1) + 1,
      },
      select: { id: true, slug: true },
    });
  });

  return restored;
}

/**
 * 同意記録の作成（公開フォーム送信時に呼ぶ）
 *
 * 旧 `context: string` を `scope: TermsScope` enum に置換 (schema 変更)。
 *
 * 呼出側は事前に `assertAllRequiredTermsAgreed({scope, agreedTermsIds})` で
 * server-side gate を通すこと (curl bypass 防止)。
 *
 * 該当 docs が公開されていない / 削除済みなら 0 件 record を返す (本コマンド
 * は append-only の証跡なので silent skip 設計)。
 *
 * @param termsIds 同意した規約 ID 配列
 * @param scope   "RESERVATION"/"INQUIRY"/"LOGIN_SIGNUP"/"EVENT_REGISTRATION"
 * @param resourceId 紐づくリソース ID（予約 / 問い合わせ ID 等）
 */
export async function recordTermsAgreementsCommand(input: {
  termsIds: readonly string[];
  scope: TermsScope;
  resourceId?: string | null;
  customerId?: string | null;
  guestEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ count: number }> {
  if (input.termsIds.length === 0) return { count: 0 };

  const docs = await prisma.termsDocument.findMany({
    where: {
      id: { in: [...input.termsIds] },
      deletedAt: null,
      isPublished: true,
    },
    select: { id: true, contentHtml: true },
  });

  if (docs.length === 0) return { count: 0 };

  const data = docs.map((doc) => ({
    termsId: doc.id,
    contentSnapshot: doc.contentHtml,
    contentHash: createHash("sha256").update(doc.contentHtml).digest("hex"),
    scope: input.scope,
    ...(input.resourceId !== undefined &&
      input.resourceId !== null && { resourceId: input.resourceId }),
    ...(input.customerId !== undefined &&
      input.customerId !== null && { customerId: input.customerId }),
    ...(input.guestEmail !== undefined &&
      input.guestEmail !== null && { guestEmail: input.guestEmail }),
    ...(input.ipAddress !== undefined &&
      input.ipAddress !== null && { ipAddress: input.ipAddress }),
    ...(input.userAgent !== undefined &&
      input.userAgent !== null && { userAgent: input.userAgent }),
  }));

  const result = await prisma.termsAgreement.createMany({ data });
  return { count: result.count };
}

/**
 * `recordTermsAgreements` 専用の最小 tx クライアント型。
 * 型互換性の理由は `src/shared/domain/terms/queries.ts` の
 * `TermsDocumentGateClient` コメント参照。
 */
type TermsAgreementWriteClient = {
  termsDocument: {
    findMany: (args: {
      where: Prisma.TermsDocumentWhereInput;
      select?: Prisma.TermsDocumentSelect;
    }) => Promise<{ id: string; contentHtml: string }[]>;
  };
  termsAgreement: {
    createMany: (args: {
      data: Prisma.TermsAgreementCreateManyInput[];
    }) => Promise<{ count: number }>;
  };
};

export type RecordTermsAgreementsInput = {
  readonly scope: TermsScopeValue;
  readonly agreements: readonly { termsId: string }[];
  readonly customerId?: string | null;
  readonly resourceId?: string | null;
  readonly guestEmail?: string | null;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly tx?: TermsAgreementWriteClient;
};

/**
 * 同意記録の作成（tx 対応・scope 汎用版、Phase B.2 task 10）
 *
 * `recordTermsAgreementsCommand`（既存、`termsIds: string[]` ベース・tx 非対応・
 * `Promise<{count}>` 返却）と同じ「1 required doc につき 1 TermsAgreement row」
 * パターンを踏襲する（Codex fix 3599414654: series 全体で 1 行にまとめない）。
 * 既存 consumer（signup/reservation/inquiry/event-registration の各 action）は
 * 既存関数を使い続ける（非破壊）。
 *
 * `createReservationSeriesCommand`（Task 13）が interactive tx 内から呼び、
 * 作成した TermsAgreement 行を `ReservationSeries.agreementSnapshot` 構築に
 * 使う想定のため、`count` ではなく作成行そのものを返す。`termsAgreement.createMany`
 * は作成行を返さないので、id/agreedAt を呼出前に生成し、その同一オブジェクトを
 * createMany の data と戻り値の双方に使う（挿入内容と返却値が必ず一致する）。
 *
 * 該当 docs が公開されていない/削除済みなら silent skip（既存パターンと同様、
 * 本コマンドは append-only の証跡なので該当なしは空配列を返す）。
 */
export async function recordTermsAgreements(
  input: RecordTermsAgreementsInput,
): Promise<TermsAgreement[]> {
  if (input.agreements.length === 0) return [];

  const client = input.tx ?? prisma;
  const termsIds = input.agreements.map((a) => a.termsId);

  const docs = await client.termsDocument.findMany({
    where: {
      id: { in: termsIds },
      deletedAt: null,
      isPublished: true,
    },
    select: { id: true, contentHtml: true },
  });

  if (docs.length === 0) return [];

  const agreedAt = new Date();
  const records: TermsAgreement[] = docs.map((doc) => ({
    id: randomUUID(),
    termsId: doc.id,
    customerId: input.customerId ?? null,
    guestEmail: input.guestEmail ?? null,
    contentSnapshot: doc.contentHtml,
    contentHash: createHash("sha256").update(doc.contentHtml).digest("hex"),
    agreedAt,
    scope: input.scope,
    resourceId: input.resourceId ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  }));

  await client.termsAgreement.createMany({ data: records });

  return records;
}
