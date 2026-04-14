import "server-only";

import { PostStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { omitUndefined } from "@/shared/lib/serialize";
import type {
  CreatePostBackupResult,
  RestorePostVersionResult,
} from "@/shared/domain/posts/types";

export async function createPostBackup(
  id: string,
  userId: string,
): Promise<CreatePostBackupResult> {
  const [post, latestVersion] = await Promise.all([
    prisma.post.findUnique({
      where: { id },
      select: { id: true, contentHtml: true, contentJson: true },
    }),
    prisma.postVersion.findFirst({
      where: { postId: id },
      orderBy: { version: "desc" },
      select: { version: true },
    }),
  ]);

  if (!post) {
    throw new DomainError("投稿記事が見つかりません", "NOT_FOUND");
  }

  const version = (latestVersion?.version ?? 0) + 1;

  await prisma.postVersion.create({
    data: omitUndefined({
      postId: id,
      version,
      contentHtml: post.contentHtml,
      contentJson: post.contentJson ?? undefined,
      createdBy: userId,
    }),
  });

  return { version };
}

export async function restorePostVersion(
  postId: string,
  version: number,
): Promise<RestorePostVersionResult> {
  const [versionData, post] = await Promise.all([
    prisma.postVersion.findUnique({
      where: {
        postId_version: { postId, version },
      },
      select: { contentHtml: true, contentJson: true },
    }),
    prisma.post.findUnique({
      where: { id: postId },
      select: { slug: true },
    }),
  ]);

  if (!versionData) {
    throw new DomainError("バージョンが見つかりません", "NOT_FOUND");
  }

  if (!post) {
    throw new DomainError("投稿記事が見つかりません", "NOT_FOUND");
  }

  await prisma.post.update({
    where: { id: postId },
    data: omitUndefined({
      contentHtml: versionData.contentHtml,
      contentJson: versionData.contentJson ?? undefined,
      status: PostStatus.DRAFT,
    }),
  });

  return {
    slug: post.slug,
  };
}
