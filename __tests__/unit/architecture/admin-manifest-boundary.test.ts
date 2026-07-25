import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const appRoot = join(process.cwd(), "src", "app");
const rootManifestPath = join(appRoot, "manifest.ts");
const publicLayoutPath = join(appRoot, "(public)", "layout.tsx");
const adminLayoutPath = join(appRoot, "(admin)", "layout.tsx");

describe("PWA manifest boundary", () => {
  test("manifest は公開 root metadata だけで明示リンクし、app root convention に置かない", () => {
    expect(existsSync(rootManifestPath)).toBe(false);

    const publicLayoutSource = readFileSync(publicLayoutPath, "utf8");
    expect(publicLayoutSource).toContain('manifest: "/manifest.webmanifest"');

    const adminLayoutSource = readFileSync(adminLayoutPath, "utf8");
    expect(adminLayoutSource).not.toContain("manifest:");
  });

  test("公開 manifest route は Web App Manifest として配信する", async () => {
    // Unit test は request scope 外で GET を呼ぶため connection / SEO query を stub する。
    mock.module("next/server", () => ({
      connection: async () => undefined,
    }));
    mock.module("@/public/lib/seo/metadata-factory", () => ({
      getSeoSettings: async () => null,
      resolveSiteBranding: () => ({
        siteName: "Test Site",
        description: "Test description",
        ogTitle: "Test Site",
        ogDescription: "Test description",
      }),
    }));
    mock.module("@/shared/domain/settings/queries/display", () => ({
      getFooterSettings: async () => ({
        tagline: null,
        copyright: null,
        navigationLabel: "Navigation",
        contactLabel: "Contact",
        hoursLabel: "Hours",
        showSocialLinks: true,
        themeColor: "#fafafa",
        brand: {
          siteName: "Test Site",
          logoUrl: null,
          useLogo: true,
        },
      }),
    }));

    const { GET } = await import("@/app/(public)/manifest.webmanifest/route");
    const response = await GET();

    expect(response.headers.get("content-type")).toBe(
      "application/manifest+json",
    );

    const manifest = (await response.json()) as {
      readonly name?: string;
      readonly short_name?: string;
      readonly start_url?: string;
      readonly display?: string;
      readonly background_color?: string;
      readonly theme_color?: string;
      readonly icons?: ReadonlyArray<{
        readonly src?: string;
        readonly sizes?: string;
        readonly type?: string;
        readonly purpose?: string;
      }>;
    };

    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBe(manifest.name);
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.background_color).toBe("#fafafa");
    expect(manifest.theme_color).toBe("#fafafa");
    expect(manifest.icons).toEqual([
      {
        src: "/icon-192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ]);
  });

  test("CSP は manifest-src を明示して same-origin manifest だけを許可する", async () => {
    const response = await proxy(new NextRequest("https://example.com/spaces"));
    const csp = response.headers.get("Content-Security-Policy");

    expect(csp).toContain("manifest-src 'self'");
  });
});
