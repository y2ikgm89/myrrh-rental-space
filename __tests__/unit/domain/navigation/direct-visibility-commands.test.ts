import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockNavigationFindUnique = mock<() => Promise<{ id: string } | null>>(
  () => Promise.resolve({ id: "nav-1" }),
);
const mockNavigationUpdate = mock<
  () => Promise<{ id: string; isActive: boolean }>
>(() => Promise.resolve({ id: "nav-1", isActive: false }));
const mockSocialFindUnique = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve({ id: "social-1" }),
);
const mockSocialUpdate = mock<() => Promise<unknown>>(() =>
  Promise.resolve({ id: "social-1" }),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    navigationItem: {
      findUnique: mockNavigationFindUnique,
      update: mockNavigationUpdate,
    },
    socialLink: {
      findUnique: mockSocialFindUnique,
      update: mockSocialUpdate,
    },
  },
}));

const navigationCommands =
  (await import("@/shared/domain/navigation/commands")) as unknown as {
    updateNavigationItemActive: (
      id: string,
      isActive: boolean,
    ) => Promise<{ id: string; isActive: boolean }>;
    updateSocialLinkActive: (
      id: string,
      isActive: boolean,
    ) => Promise<{ id: string; isActive: boolean }>;
    updateSocialLinkDesktopVisibility: (
      id: string,
      showOnDesktop: boolean,
    ) => Promise<{ id: string; showOnDesktop: boolean }>;
    updateSocialLinkMobileVisibility: (
      id: string,
      showOnMobile: boolean,
    ) => Promise<{ id: string; showOnMobile: boolean }>;
  };

describe("navigation direct visibility commands", () => {
  beforeEach(() => {
    mockNavigationFindUnique.mockReset();
    mockNavigationFindUnique.mockResolvedValue({ id: "nav-1" });
    mockNavigationUpdate.mockReset();
    mockNavigationUpdate.mockResolvedValue({ id: "nav-1", isActive: false });
    mockSocialFindUnique.mockReset();
    mockSocialFindUnique.mockResolvedValue({ id: "social-1" });
    mockSocialUpdate.mockReset();
    mockSocialUpdate.mockResolvedValue({ id: "social-1" });
  });

  test("navigation item active flag is updated without rewriting the full item", async () => {
    const result = await navigationCommands.updateNavigationItemActive(
      "nav-1",
      false,
    );

    expect(result).toEqual({ id: "nav-1", isActive: false });
    expect(mockNavigationUpdate).toHaveBeenCalledWith({
      where: { id: "nav-1" },
      data: { isActive: false },
      select: { id: true, isActive: true },
    });
  });

  test("missing navigation item throws NOT_FOUND before update", async () => {
    mockNavigationFindUnique.mockResolvedValueOnce(null);

    await expect(
      navigationCommands.updateNavigationItemActive("missing-id", true),
    ).rejects.toThrow("ナビゲーションが見つかりません");
    expect(mockNavigationUpdate).not.toHaveBeenCalled();
  });

  test("social link active flag is updated without rewriting URL or platform", async () => {
    mockSocialUpdate.mockResolvedValueOnce({
      id: "social-1",
      isActive: false,
    });

    const result = await navigationCommands.updateSocialLinkActive(
      "social-1",
      false,
    );

    expect(result).toEqual({ id: "social-1", isActive: false });
    expect(mockSocialUpdate).toHaveBeenCalledWith({
      where: { id: "social-1" },
      data: { isActive: false },
      select: { id: true, isActive: true },
    });
  });

  test("social desktop visibility is updated independently", async () => {
    mockSocialUpdate.mockResolvedValueOnce({
      id: "social-1",
      showOnDesktop: false,
    });

    const result = await navigationCommands.updateSocialLinkDesktopVisibility(
      "social-1",
      false,
    );

    expect(result).toEqual({ id: "social-1", showOnDesktop: false });
    expect(mockSocialUpdate).toHaveBeenCalledWith({
      where: { id: "social-1" },
      data: { showOnDesktop: false },
      select: { id: true, showOnDesktop: true },
    });
  });

  test("social mobile visibility is updated independently", async () => {
    mockSocialUpdate.mockResolvedValueOnce({
      id: "social-1",
      showOnMobile: false,
    });

    const result = await navigationCommands.updateSocialLinkMobileVisibility(
      "social-1",
      false,
    );

    expect(result).toEqual({ id: "social-1", showOnMobile: false });
    expect(mockSocialUpdate).toHaveBeenCalledWith({
      where: { id: "social-1" },
      data: { showOnMobile: false },
      select: { id: true, showOnMobile: true },
    });
  });
});
