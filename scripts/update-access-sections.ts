/**
 * アクセスページのセクション構成を更新する一回限りのスクリプト
 * - hero セクションを削除
 * - location-list のタイトルを「アクセス」に変更
 * - location-list の order を 0 に変更
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { createAppPrismaClient } from "@/shared/db/create-app-prisma-client";
import { isRecord } from "@/shared/lib/serialize";
import { asPrismaInputJsonValue } from "@/shared/db/prisma-input-json";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const baseClient = new PrismaClient({ adapter });
const prisma = createAppPrismaClient(baseClient);

async function main() {
  const page = await prisma.page.findFirst({
    where: { slug: "access" },
    select: { id: true },
  });

  if (!page) {
    console.log(
      "Access page not found in DB — using defaults, nothing to update.",
    );
    return;
  }

  const { count: deletedCount } = await prisma.section.deleteMany({
    where: { pageId: page.id, type: "hero" },
  });
  console.log(`Deleted ${deletedCount} hero section(s)`);

  const locationList = await prisma.section.findFirst({
    where: { pageId: page.id, type: "location-list" },
    select: { id: true, config: true },
  });

  if (locationList) {
    const rawConfig = locationList.config;
    if (!isRecord(rawConfig))
      throw new Error("location-list config is not a record");
    await prisma.section.update({
      where: { id: locationList.id },
      data: {
        order: 0,
        config: asPrismaInputJsonValue(
          {
            ...rawConfig,
            title: [
              { _key: crypto.randomUUID(), _type: "span", text: "アクセス" },
            ],
          },
          "section config must be valid JSON",
        ),
      },
    });
    console.log("Updated location-list: title → アクセス, order → 0");
  } else {
    console.log("location-list section not found");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => baseClient.$disconnect());
