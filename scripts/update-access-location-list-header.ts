/**
 * アクセスページの location-list セクションからタイトル・ラベルを削除する一回限りのスクリプト
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

  const locationList = await prisma.section.findFirst({
    where: { pageId: page.id, type: "location-list" },
    select: { id: true, config: true },
  });

  if (!locationList) {
    console.log("location-list section not found");
    return;
  }

  const rawConfig = locationList.config;
  if (!isRecord(rawConfig))
    throw new Error("location-list config is not a record");

  await prisma.section.update({
    where: { id: locationList.id },
    data: {
      config: asPrismaInputJsonValue(
        { ...rawConfig, sectionLabel: "", title: [] },
        "section config must be valid JSON",
      ),
    },
  });
  console.log("Updated location-list: sectionLabel → '', title → []");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => baseClient.$disconnect());
