import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { Stack } from "@/public/components/design-system/stack";

describe("Stack", () => {
  it("renders vertical by default", () => {
    const { container } = render(<Stack>content</Stack>);
    const el = container.firstElementChild;
    expect(el?.className).toContain("flex");
    expect(el?.className).toContain("flex-col");
  });

  it("renders horizontal direction", () => {
    const { container } = render(<Stack direction="horizontal">content</Stack>);
    expect(container.firstElementChild?.className).toContain("flex-row");
  });

  it("renders default gap (md)", () => {
    const { container } = render(<Stack>content</Stack>);
    expect(container.firstElementChild?.className).toContain("gap-4");
  });

  it("renders section gap with CSS variable", () => {
    const { container } = render(<Stack gap="section">content</Stack>);
    expect(container.firstElementChild?.className).toContain(
      "gap-[var(--spacing-section)]",
    );
  });

  it("renders as nav element", () => {
    const { container } = render(<Stack as="nav">content</Stack>);
    expect(container.querySelector("nav")).not.toBeNull();
  });

  it("renders as ul element", () => {
    const { container } = render(<Stack as="ul">content</Stack>);
    expect(container.querySelector("ul")).not.toBeNull();
  });

  it("appends custom className", () => {
    const { container } = render(
      <Stack className="items-center">content</Stack>,
    );
    expect(container.firstElementChild?.className).toContain("items-center");
  });
});
