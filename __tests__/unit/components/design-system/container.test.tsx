import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { Container } from "@/public/components/design-system/container";

describe("Container", () => {
  it("renders with default classes", () => {
    const { container } = render(<Container>content</Container>);
    const el = container.firstElementChild;
    expect(el?.className).toContain("max-w-[var(--container-max)]");
    expect(el?.className).toContain("mx-auto");
    expect(el?.className).toContain("px-[var(--container-padding)]");
  });

  it("renders narrow variant", () => {
    const { container } = render(
      <Container variant="narrow">content</Container>,
    );
    expect(container.firstElementChild?.className).toContain("max-w-3xl");
  });

  it("renders wide variant", () => {
    const { container } = render(<Container variant="wide">content</Container>);
    expect(container.firstElementChild?.className).toContain(
      "max-w-screen-2xl",
    );
  });

  it("renders as section element", () => {
    const { container } = render(<Container as="section">content</Container>);
    expect(container.querySelector("section")).not.toBeNull();
  });

  it("renders as article element", () => {
    const { container } = render(<Container as="article">content</Container>);
    expect(container.querySelector("article")).not.toBeNull();
  });

  it("appends custom className", () => {
    const { container } = render(
      <Container className="mt-8">content</Container>,
    );
    expect(container.firstElementChild?.className).toContain("mt-8");
  });
});
