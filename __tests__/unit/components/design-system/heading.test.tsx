import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Heading } from "@/public/components/design-system/heading";

describe("Heading", () => {
  it("renders h1 tag for level 1", () => {
    render(<Heading level={1}>Title</Heading>);
    expect(screen.getByRole("heading", { level: 1 })).toBeDefined();
  });

  it("renders h2 tag for level 2", () => {
    render(<Heading level={2}>Subtitle</Heading>);
    expect(screen.getByRole("heading", { level: 2 })).toBeDefined();
  });

  it("renders h3 tag for level 3", () => {
    render(<Heading level={3}>Section</Heading>);
    expect(screen.getByRole("heading", { level: 3 })).toBeDefined();
  });

  it("renders h4 tag for level 4", () => {
    render(<Heading level={4}>Sub-section</Heading>);
    expect(screen.getByRole("heading", { level: 4 })).toBeDefined();
  });

  it("includes font-heading class", () => {
    const { container } = render(<Heading level={1}>T</Heading>);
    expect(container.querySelector("h1")?.className).toContain("font-heading");
  });

  it("includes tracking class", () => {
    const { container } = render(<Heading level={1}>T</Heading>);
    expect(container.querySelector("h1")?.className).toContain(
      "tracking-[var(--tracking-tight)]",
    );
  });

  it("accepts additional className", () => {
    const { container } = render(
      <Heading level={1} className="mb-8">
        T
      </Heading>,
    );
    expect(container.querySelector("h1")?.className).toContain("mb-8");
  });
});
