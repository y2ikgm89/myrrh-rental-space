import { describe, expect, test } from "bun:test";
import {
  extractDescription,
  extractSiteName,
  extractTitle,
} from "@/admin/lib/ogp-parser";

describe("ogp-parser HTML entity decode", () => {
  test("extractTitle decodes &amp;", () => {
    const html =
      '<html><head><meta property="og:title" content="Foo &amp; Bar" /></head></html>';
    expect(extractTitle(html)).toBe("Foo & Bar");
  });

  test("extractDescription decodes entities", () => {
    const html =
      '<html><head><meta property="og:description" content="A &lt; B &gt; C" /></head></html>';
    expect(extractDescription(html)).toBe("A < B > C");
  });

  test("extractSiteName decodes &quot;", () => {
    const html =
      '<html><head><meta property="og:site_name" content="Site &quot;Name&quot;" /></head></html>';
    expect(extractSiteName(html)).toBe('Site "Name"');
  });

  test("extractTitle from title tag decodes numeric entities", () => {
    const html = "<html><head><title>&#65;BC</title></head></html>";
    expect(extractTitle(html)).toBe("ABC");
  });
});
