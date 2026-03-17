import { describe, expect, it, mock } from "bun:test";
import { render, screen } from "@testing-library/react";

// next/image は happy-dom 環境で Invalid URL エラーを起こすためモック
mock.module("next/image", () => ({
  default: function MockImage(props: Record<string, unknown>) {
    const { fill, priority, ...rest } = props;
    return <img {...rest} data-fill={fill ? "true" : undefined} />;
  },
}));

import { PageHero } from "../../../../src/app/(public)/_shared/components/layouts/page-hero";

describe("PageHero", () => {
  it("renders compact variant with title", () => {
    render(<PageHero variant="compact" title="スペース一覧" />);
    expect(screen.getByRole("heading", { level: 1 })).toBeDefined();
    expect(screen.getByText("スペース一覧")).toBeDefined();
  });

  it("renders full variant with image and title", () => {
    render(
      <PageHero
        variant="full"
        title="Myrrh"
        subtitle="特別な空間"
        image={{ src: "/hero.jpg", alt: "Hero", width: 1920, height: 1080 }}
      />,
    );
    expect(screen.getByText("Myrrh")).toBeDefined();
    expect(screen.getByText("特別な空間")).toBeDefined();
    expect(screen.getByRole("img")).toBeDefined();
  });

  it("renders CTA button in full variant", () => {
    render(
      <PageHero
        variant="full"
        title="T"
        image={{ src: "/h.jpg", alt: "H", width: 1920, height: 1080 }}
        cta={{ label: "予約する", href: "/reservation", variant: "primary" }}
      />,
    );
    expect(screen.getByRole("link", { name: "予約する" })).toBeDefined();
  });

  it("renders breadcrumb slot in compact variant", () => {
    render(
      <PageHero
        variant="compact"
        title="FAQ"
        breadcrumb={<nav aria-label="パンくず">Home &gt; FAQ</nav>}
      />,
    );
    expect(screen.getByLabelText("パンくず")).toBeDefined();
  });
});
