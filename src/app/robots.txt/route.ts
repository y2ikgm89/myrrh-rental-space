import { NextResponse } from "next/server";
import { getPublicRobotsTxtSettings } from "@/shared/domain/settings/queries/site";
import { DEFAULT_ROBOTS_TXT } from "@/shared/domain/settings/robots-txt";

const RESPONSE_HEADERS = {
  "Content-Type": "text/plain",
  "Cache-Control": "public, max-age=3600, s-maxage=3600",
};

export async function GET(): Promise<NextResponse> {
  try {
    const settings = await getPublicRobotsTxtSettings();
    const content =
      settings?.robotsTxtEnabled && settings.robotsTxtCustom
        ? settings.robotsTxtCustom
        : DEFAULT_ROBOTS_TXT;

    return new NextResponse(content, { headers: RESPONSE_HEADERS });
  } catch {
    return new NextResponse(DEFAULT_ROBOTS_TXT, { headers: RESPONSE_HEADERS });
  }
}
