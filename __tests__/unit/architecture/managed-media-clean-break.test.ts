import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, ...path.split("/")), "utf8");
}

describe("managed media clean-break boundary", () => {
  test("media picker URL tab is opt-out by default across shared picker APIs", () => {
    expect(
      read(
        "src/app/(admin)/admin/(dashboard)/_shared/components/media-picker/MediaPickerDialog.tsx",
      ),
    ).toContain("showUrlTab = false");
    expect(
      read(
        "src/app/(admin)/admin/(dashboard)/_shared/hooks/use-media-picker.tsx",
      ),
    ).toContain("showUrlTab = false");
    expect(
      read(
        "src/app/(admin)/admin/(dashboard)/_shared/components/gallery-field/GalleryField.tsx",
      ),
    ).toContain("showUrlTab = false");
  });

  test("space media pickers do not expose arbitrary URL entry", () => {
    const spaceForm = read(
      "src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceEditForm.tsx",
    );

    expect(spaceForm).toContain("showUrlTab: false");
    expect(spaceForm).toContain("showUrlTab={false}");
  });

  test("Lexical media controls do not re-enable arbitrary URL entry", () => {
    const lexicalFiles = [
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/CoverPlugin.tsx",
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/ImagePlugin.tsx",
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/InlineImagePlugin.tsx",
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/AudioPlugin.tsx",
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/FilePlugin.tsx",
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/ImageInspectorPanel.tsx",
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/InlineImageInspectorPanel.tsx",
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/GalleryItemInspectorPanel.tsx",
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/CoverInspectorPanel.tsx",
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/TestimonialItemInspectorPanel.tsx",
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/AudioInspectorPanel.tsx",
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/FileInspectorPanel.tsx",
    ];

    for (const file of lexicalFiles) {
      const source = read(file);
      expect(source).not.toContain("showUrlTab: true");
      expect(source).not.toMatch(/\n\s+showUrlTab\s*\n/);
    }
  });

  test("managed defaults and Next image config do not depend on broad external image hosts", () => {
    expect(read("next.config.ts")).not.toContain('hostname: "*.r2.dev"');
    expect(read("next.config.ts")).not.toContain(
      'hostname: "images.unsplash.com"',
    );
    expect(read("src/proxy.ts")).not.toContain("https://*.r2.dev");
    expect(
      read("src/shared/lib/sections/definitions/page-hero/defaults.ts"),
    ).not.toContain("images.unsplash.com");
    expect(read("src/app/(public)/_components/HeroSection.tsx")).not.toContain(
      "images.unsplash.com",
    );
  });

  test("above-the-fold public images use a single priority loading strategy", () => {
    const heroFiles = [
      "src/app/(public)/_components/HeroSection.tsx",
      "src/app/(public)/_components/StandardHeroSection.tsx",
      "src/app/(public)/_shared/components/page-hero/CompactHero.tsx",
      "src/app/(public)/_shared/components/page-hero/MediaHero.tsx",
      "src/app/(public)/_shared/components/page-hero/EditorialSplitHero.tsx",
      "src/app/(public)/_shared/components/page-hero/hero-background-slideshow.tsx",
    ];

    for (const file of heroFiles) {
      expect(read(file)).not.toMatch(/\n\s+preload(?:\s|=)/);
    }
  });

  test("shared Next image wrappers keep preload mutually exclusive with priority props", () => {
    const wrappers = [
      "src/app/(public)/_shared/components/design-system/image-frame.tsx",
      "src/shared/components/media/ImageCarousel.tsx",
    ];

    for (const file of wrappers) {
      const source = read(file);
      expect(source).toContain("readonly preload: true");
      expect(source).toContain("readonly loading?: never");
      expect(source).toContain("readonly fetchPriority?: never");
      expect(source).not.toMatch(/\bpreload=\{preload\b/);
      expect(source).not.toMatch(/\bpreload=\{preload &&/);
    }
  });
});
