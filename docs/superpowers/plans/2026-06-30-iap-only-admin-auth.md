# IAP-only Admin Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace admin email/password authentication with Google Cloud IAP-only
authentication, while keeping DB-backed staff roles and a simple staff access
guide email.

**Architecture:** IAP is the only admin entry gate. The application verifies the
signed IAP JWT, maps the authenticated email to a live `User` row, and uses the
existing RBAC matrix for authorization. Admin staff records no longer have app
passwords or setup tokens.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7, PostgreSQL, Google
Cloud IAP, `google-auth-library`, Bun tests, Playwright.

---

## File Structure

- Create `src/shared/lib/iap/admin-iap-jwt.ts`: Google IAP JWT verification.
- Create `src/shared/lib/iap/admin-iap-auth.ts`: request header to admin user
  resolution.
- Modify `src/shared/lib/admin-auth.ts`: remove Better Auth, keep the admin auth
  helper API backed by IAP.
- Modify `src/proxy.ts`: remove admin session cookie gate, keep public surface
  404 and admin API rate limiting.
- Modify `src/shared/lib/env/server.ts`: add IAP and initial admin env vars.
- Modify `cloudbuild.yaml`: set `IAP_JWT_AUDIENCE` on the admin service.
- Create `src/app/(admin)/admin/(auth)/access-denied/page.tsx`: clear denied
  state after IAP.
- Replace `src/app/(admin)/admin/(auth)/login/page.tsx` with redirect-only
  behavior; delete admin forgot/reset/setup UI.
- Delete admin Better Auth route `src/app/api/auth/[...all]/route.ts`.
- Modify staff domain/actions/forms under
  `src/shared/domain/users/*` and `src/app/(admin)/admin/(dashboard)/staff/*`
  to remove password fields and invitation-token UI.
- Replace staff invitation email with staff access guide email under
  `src/shared/emails/*` and `src/shared/lib/email/*`.
- Modify `prisma/schema.prisma` and add a new migration dropping
  `staff_invitations`.
- Create `src/shared/lib/bootstrap/initial-admin.ts` and call it from
  `src/instrumentation.ts`.
- Update unit, integration, architecture, and E2E helpers/tests.

---

### Task 1: Add IAP JWT Verification Boundary

**Files:**

- Modify: `package.json`
- Create: `src/shared/lib/iap/admin-iap-jwt.ts`
- Create: `src/shared/lib/iap/admin-iap-auth.ts`
- Test: `__tests__/unit/lib/iap/admin-iap-auth.test.ts`

- [ ] **Step 1: Add direct dependency**

Run:

```powershell
bun add google-auth-library
```

Expected: `package.json` and `bun.lock` include `google-auth-library`.

- [ ] **Step 2: Write failing auth-boundary tests**

Create `__tests__/unit/lib/iap/admin-iap-auth.test.ts` with cases for:

```ts
import { describe, expect, test } from "bun:test";
import {
  normalizeIapEmail,
  resolveIapIdentity,
} from "@/shared/lib/iap/admin-iap-auth";

describe("normalizeIapEmail", () => {
  test("strips IAP account namespace and normalizes case", () => {
    expect(normalizeIapEmail("accounts.google.com:Staff@Example.COM")).toBe(
      "staff@example.com",
    );
  });
});

describe("resolveIapIdentity", () => {
  test("verifies the signed IAP assertion and returns normalized identity", async () => {
    const headers = new Headers({
      "x-goog-iap-jwt-assertion": "signed.jwt",
    });
    const result = await resolveIapIdentity(headers, {
      verifyJwt: async () => ({
        email: "accounts.google.com:Staff@Example.COM",
        subject: "subject-123",
      }),
    });
    expect(result).toEqual({
      email: "staff@example.com",
      subject: "subject-123",
    });
  });

  test("returns null when the assertion is missing", async () => {
    const result = await resolveIapIdentity(new Headers(), {
      verifyJwt: async () => {
        throw new Error("must not be called");
      },
    });
    expect(result).toBeNull();
  });

  test("rejects invalid verified payloads", async () => {
    const headers = new Headers({
      "x-goog-iap-jwt-assertion": "signed.jwt",
    });
    await expect(
      resolveIapIdentity(headers, {
        verifyJwt: async () => ({ email: "", subject: "subject-123" }),
      }),
    ).rejects.toThrow("IAP identity email is missing");
  });
});
```

Run:

```powershell
bun scripts/run-tests.ts __tests__/unit/lib/iap/admin-iap-auth.test.ts
```

Expected: FAIL because the new modules do not exist.

- [ ] **Step 3: Implement `admin-iap-jwt.ts`**

Create:

```ts
import "server-only";

import { OAuth2Client } from "google-auth-library";
import { serverEnv } from "@/shared/lib/env/server";

export type VerifiedIapJwt = {
  email: string;
  subject: string;
};

const IAP_ISSUER = "https://cloud.google.com/iap";

let oauthClient: OAuth2Client | null = null;

function getOAuthClient(): OAuth2Client {
  oauthClient ??= new OAuth2Client();
  return oauthClient;
}

export async function verifyIapJwt(jwt: string): Promise<VerifiedIapJwt> {
  const audience = serverEnv.IAP_JWT_AUDIENCE;
  if (!audience) {
    throw new Error("IAP_JWT_AUDIENCE is not configured");
  }

  const client = getOAuthClient();
  const keys = await client.getIapPublicKeys();
  const ticket = await client.verifySignedJwtWithCertsAsync(
    jwt,
    keys.pubkeys,
    audience,
    [IAP_ISSUER],
  );
  const payload = ticket.getPayload();
  const email = payload?.email;
  const subject = payload?.sub;

  if (!email) throw new Error("IAP JWT email claim is missing");
  if (!subject) throw new Error("IAP JWT subject claim is missing");

  return { email, subject };
}
```

- [ ] **Step 4: Implement `admin-iap-auth.ts`**

Create:

```ts
import "server-only";

import { verifyIapJwt, type VerifiedIapJwt } from "./admin-iap-jwt";

export type IapIdentity = {
  email: string;
  subject: string;
};

export type ResolveIapIdentityOptions = {
  verifyJwt?: (jwt: string) => Promise<VerifiedIapJwt>;
};

export function normalizeIapEmail(value: string): string {
  return value
    .replace(/^accounts\.google\.com:/u, "")
    .trim()
    .toLowerCase();
}

export async function resolveIapIdentity(
  headers: Headers,
  options: ResolveIapIdentityOptions = {},
): Promise<IapIdentity | null> {
  const assertion = headers.get("x-goog-iap-jwt-assertion");
  if (!assertion) return null;

  const verified = await (options.verifyJwt ?? verifyIapJwt)(assertion);
  const email = normalizeIapEmail(verified.email);
  if (!email) throw new Error("IAP identity email is missing");

  return {
    email,
    subject: verified.subject,
  };
}
```

- [ ] **Step 5: Verify Task 1**

Run:

```powershell
bun scripts/run-tests.ts __tests__/unit/lib/iap/admin-iap-auth.test.ts
```

Expected: PASS.

Commit:

```powershell
git add package.json bun.lock src/shared/lib/iap __tests__/unit/lib/iap
git commit -m "feat: add IAP admin identity verifier"
```

---

### Task 2: Replace Admin Auth Helpers With IAP-backed User Resolution

**Files:**

- Modify: `src/shared/lib/admin-auth.ts`
- Modify: `src/shared/lib/env/server.ts`
- Create: `__tests__/unit/lib/admin-auth-iap.test.ts`

- [ ] **Step 1: Write failing tests for admin helper behavior**

Create `__tests__/unit/lib/admin-auth-iap.test.ts` that mocks:

- `next/headers`
- `next/navigation`
- `@/shared/db/prisma`
- `@/shared/lib/iap/admin-iap-auth`

Required cases:

```ts
test("getCurrentAdminUser returns dashboard user matched by IAP email", async () => {
  mockResolveIapIdentity.mockResolvedValue({
    email: "admin@example.com",
    subject: "subject-1",
  });
  mockFindUnique.mockResolvedValue({
    id: "user-1",
    email: "admin@example.com",
    name: "Admin",
    image: null,
    role: "ADMIN",
    emailVerified: true,
  });

  const user = await getCurrentAdminUser(new Headers());

  expect(user?.email).toBe("admin@example.com");
  expect(user?.role).toBe("ADMIN");
});

test("verifyAdminSession redirects to access denied for unknown IAP user", async () => {
  mockResolveIapIdentity.mockResolvedValue({
    email: "missing@example.com",
    subject: "subject-1",
  });
  mockFindUnique.mockResolvedValue(null);

  await verifyAdminSession(new Headers());

  expect(mockRedirect).toHaveBeenCalledWith("/admin/access-denied");
});
```

Run:

```powershell
bun scripts/run-tests.ts __tests__/unit/lib/admin-auth-iap.test.ts
```

Expected: FAIL under current Better Auth implementation.

- [ ] **Step 2: Add env variables**

In `src/shared/lib/env/server.ts`, add:

```ts
IAP_JWT_AUDIENCE: z.string().min(1).optional(),
INITIAL_ADMIN_EMAIL: z.email().optional(),
INITIAL_ADMIN_NAME: z.string().min(1).max(100).optional(),
ADMIN_TEST_IAP_EMAIL: z.email().optional(),
```

Add each to `runtimeEnv`.

In `validateProductionEnv()`, require `IAP_JWT_AUDIENCE` when
`serverEnv.APP_SURFACE === "admin"`:

```ts
if (serverEnv.APP_SURFACE === "admin" && !serverEnv.IAP_JWT_AUDIENCE) {
  throw new Error(
    "Missing required environment variables in production: IAP_JWT_AUDIENCE",
  );
}
```

- [ ] **Step 3: Replace `admin-auth.ts` internals**

Remove Better Auth imports and implement the helper API against IAP:

```ts
import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/shared/db/prisma";
import { Role } from "@/shared/lib/validations/enums/prisma-types";
import { isValidRole } from "@/shared/lib/validations/enums/guards";
import { resolveIapIdentity } from "@/shared/lib/iap/admin-iap-auth";
import { isAdminOrHigherRole, isDashboardRole } from "./admin-roles";
import { serverEnv } from "./env/server";

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  role: Role;
  emailVerified: boolean;
};

export type AdminSession = {
  user: AdminUser;
};

export { DASHBOARD_ROLES } from "./admin-roles";

async function resolveRequestHeaders(
  requestHeaders?: Headers,
): Promise<Headers> {
  return requestHeaders ?? (await headers());
}

async function resolveTestIdentity(): Promise<string | null> {
  if (serverEnv.NODE_ENV === "production") return null;
  return serverEnv.ADMIN_TEST_IAP_EMAIL ?? null;
}

async function resolveAdminEmail(
  requestHeaders?: Headers,
): Promise<string | null> {
  const requestHeaderList = await resolveRequestHeaders(requestHeaders);
  const identity = await resolveIapIdentity(requestHeaderList);
  if (identity) return identity.email;
  return resolveTestIdentity();
}

const loadAdminUserByEmail = cache(
  async (email: string): Promise<AdminUser | null> => {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        emailVerified: true,
      },
    });
    if (!user || !isValidRole(user.role)) return null;
    return user;
  },
);

export async function getCurrentAdminUser(
  requestHeaders?: Headers,
): Promise<AdminUser | null> {
  const email = await resolveAdminEmail(requestHeaders);
  if (!email) return null;
  return loadAdminUserByEmail(email);
}

export function getAdminSessionUser(session: unknown): AdminUser | null {
  if (!session || typeof session !== "object" || !("user" in session)) {
    return null;
  }
  const user = (session as { user: AdminUser }).user;
  return user && isValidRole(user.role) ? user : null;
}

export const verifyAdminSession = cache(
  async (requestHeaders?: Headers): Promise<AdminUser> => {
    const user = await getCurrentAdminUser(requestHeaders);
    if (!user || !isDashboardRole(user.role)) {
      redirect("/admin/access-denied");
    }
    return user;
  },
);

export const isAdmin = cache(
  async (requestHeaders?: Headers): Promise<boolean> => {
    const user = await getCurrentAdminUser(requestHeaders);
    return user !== null && isAdminOrHigherRole(user.role);
  },
);

export async function getAdminSession(
  requestHeaders?: Headers,
): Promise<AdminSession | null> {
  const user = await getCurrentAdminUser(requestHeaders);
  return user ? { user } : null;
}
```

- [ ] **Step 4: Verify Task 2**

Run:

```powershell
bun scripts/run-tests.ts __tests__/unit/lib/admin-auth-iap.test.ts
bun run type-check
```

Expected: targeted test PASS; type-check may reveal callers that still depend
on Better Auth session shape and must be fixed in later tasks before final
validation.

Commit:

```powershell
git add src/shared/lib/admin-auth.ts src/shared/lib/env/server.ts __tests__/unit/lib/admin-auth-iap.test.ts
git commit -m "refactor: resolve admin auth from IAP identity"
```

---

### Task 3: Remove Admin Login Surface And Cookie Gate

**Files:**

- Modify: `src/proxy.ts`
- Modify: `src/app/(admin)/admin/(auth)/login/page.tsx`
- Create: `src/app/(admin)/admin/(auth)/access-denied/page.tsx`
- Delete: `src/app/(admin)/admin/(auth)/login/LoginForm.tsx`
- Delete: `src/app/(admin)/admin/(auth)/login/DevLoginButton.tsx`
- Delete: `src/app/(admin)/admin/(auth)/login/dev-login-action.ts`
- Delete: `src/app/(admin)/admin/(auth)/login/dev-login-credentials.ts`
- Delete: `src/app/(admin)/admin/(auth)/forgot-password`
- Delete: `src/app/(admin)/admin/(auth)/reset-password`
- Delete: `src/app/(admin)/admin/(auth)/setup`
- Delete: `src/app/api/auth/[...all]/route.ts`
- Test: `__tests__/unit/proxy-admin-gate.test.ts`
- Test: `__tests__/unit/proxy-public-surface.test.ts`

- [ ] **Step 1: Update proxy tests first**

Change `__tests__/unit/proxy-admin-gate.test.ts` expectations:

```ts
test("/admin/login redirects to admin root on admin surface", async () => {
  const response = await proxy(
    new NextRequest("https://example.com/admin/login"),
  );
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("https://example.com/admin");
});

test("admin routes do not require an admin-auth cookie in proxy", async () => {
  const response = await proxy(new NextRequest("https://example.com/admin"));
  expect(response.headers.get("x-pathname")).toBe("/admin");
});
```

Keep public surface tests asserting `/admin/login` and all `/admin/*` return
404 when `APP_SURFACE=public`.

Run:

```powershell
bun scripts/run-tests.ts __tests__/unit/proxy-admin-gate.test.ts __tests__/unit/proxy-public-surface.test.ts
```

Expected: FAIL because proxy still checks `admin-auth` cookie.

- [ ] **Step 2: Remove proxy cookie dependency**

In `src/proxy.ts`:

- Remove `getSessionCookie` import.
- Remove the session-cookie redirect block.
- Keep public surface blocklist.
- Keep admin API rate limiting.
- Add a redirect for `/admin/login`:

```ts
if (pathname === "/admin/login") {
  return NextResponse.redirect(new URL("/admin", req.url));
}
```

- [ ] **Step 3: Replace login page with redirect**

Replace `src/app/(admin)/admin/(auth)/login/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function LoginPage(): never {
  redirect("/admin");
}
```

- [ ] **Step 4: Create access denied page**

Create `src/app/(admin)/admin/(auth)/access-denied/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/admin/components/ui/button";

export const metadata: Metadata = {
  title: "管理権限がありません | 管理画面",
};

export default function AdminAccessDeniedPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <section className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">
          管理権限がありません
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Googleログインは完了していますが、このGoogleアカウントは管理スタッフとして登録されていません。
          管理者に、IAPアクセスとスタッフ登録の両方を確認してもらってください。
        </p>
        <Button asChild className="mt-6 w-full">
          <Link href="/admin">管理画面を再確認</Link>
        </Button>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Delete obsolete admin auth files**

Delete the admin login form, dev login, forgot/reset/setup pages, and
`src/app/api/auth/[...all]/route.ts`.

- [ ] **Step 6: Verify Task 3**

Run:

```powershell
bun scripts/run-tests.ts __tests__/unit/proxy-admin-gate.test.ts __tests__/unit/proxy-public-surface.test.ts
bun run type-check
```

Expected: proxy tests PASS. Type-check failures from removed imports are fixed
in Task 4 and Task 7.

Commit:

```powershell
git add src/proxy.ts src/app __tests__/unit/proxy-admin-gate.test.ts __tests__/unit/proxy-public-surface.test.ts
git commit -m "refactor: remove admin password login surface"
```

---

### Task 4: Convert Staff Management To Email + Role Only

**Files:**

- Modify: `src/shared/lib/validations/user.ts`
- Modify: `src/shared/domain/users/commands.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/user.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/staff/_components/UserForm.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/staff/new/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/staff/[id]/edit/page.tsx`
- Test: `__tests__/unit/domain/users/commands.test.ts`
- Test: `__tests__/unit/lib/validations/user.test.ts`

- [ ] **Step 1: Update validation tests**

Change valid create/update user data so it contains no `password` field:

```ts
const validCreateUser = {
  email: "staff@example.com",
  name: "Staff User",
  role: Role.EDITOR,
};

expect(createUserSchema.safeParse(validCreateUser).success).toBe(true);
expect(updateUserSchema.safeParse(validCreateUser).success).toBe(true);
```

Add rejection for stray password:

```ts
expect(
  createUserSchema.safeParse({ ...validCreateUser, password: "password123" }),
).toMatchObject({ success: false });
```

Run:

```powershell
bun scripts/run-tests.ts __tests__/unit/lib/validations/user.test.ts
```

Expected: FAIL because schemas still require/accept password.

- [ ] **Step 2: Update schemas**

In `src/shared/lib/validations/user.ts`:

```ts
export const createUserSchema = z.object({
  email: z.email({ error: "有効なメールアドレスを入力してください" }),
  name: z.string().min(1, { error: "名前は必須です" }).max(100),
  role: z.enum(DASHBOARD_ROLES),
});

export const updateUserSchema = createUserSchema;
```

- [ ] **Step 3: Update domain command tests**

Change create/update expectations so:

- `hashPassword` is not called.
- `prisma.user.create` creates only the `User`.
- `prisma.account.create` is not called for admin staff creation.

Core expectation:

```ts
expect(mockUserCreate).toHaveBeenCalledWith({
  data: {
    email: "staff@example.com",
    name: "Staff User",
    role: Role.EDITOR,
    emailVerified: true,
  },
});
expect(mockHashPassword).not.toHaveBeenCalled();
```

- [ ] **Step 4: Update `users/commands.ts`**

Remove `hashPassword` import. In `createUser`, create only the `User`:

```ts
const user = await prisma.user.create({
  data: {
    email: data.email,
    name: data.name,
    role: data.role,
    emailVerified: true,
  },
});
```

In `updateUser`, remove credential account lookup/update/create and only update
the user row.

- [ ] **Step 5: Update staff form UI**

In `UserForm.tsx`:

- Remove password field and default value.
- Update explanatory text to say Google/IAP is used for login.
- Keep role select, email, and name fields.

Use visible copy:

```tsx
<p className="text-sm text-muted-foreground">
  ログインはGoogleアカウントとIAPで行います。アプリ用パスワードは作成しません。
</p>
```

- [ ] **Step 6: Verify Task 4**

Run:

```powershell
bun scripts/run-tests.ts __tests__/unit/lib/validations/user.test.ts __tests__/unit/domain/users/commands.test.ts
bun test __tests__/unit/architecture/admin-submit-button-pattern.test.ts
bun run type-check
```

Commit:

```powershell
git add src/shared/lib/validations/user.ts src/shared/domain/users/commands.ts src/app/(admin)/admin/(dashboard)/staff __tests__/unit/lib/validations/user.test.ts __tests__/unit/domain/users/commands.test.ts
git commit -m "refactor: remove admin staff passwords"
```

---

### Task 5: Replace Staff Invitation Tokens With Access Guide Email

**Files:**

- Delete: `src/shared/domain/staff-invitations/*`
- Delete: `src/app/(admin)/admin/(dashboard)/_shared/actions/staff-invitation.ts`
- Delete: `src/app/(admin)/admin/(dashboard)/_shared/queries/staff-invitation.ts`
- Delete: `src/app/(admin)/admin/(dashboard)/staff/_components/InvitationActions.tsx`
- Delete: `src/app/(admin)/admin/(dashboard)/staff/_components/InvitationTable.tsx`
- Replace: `src/app/(admin)/admin/(dashboard)/staff/_components/InviteForm.tsx`
  with staff-create/access-guide behavior or remove it in favor of `UserForm`.
- Create: `src/shared/emails/staff-access-guide.tsx`
- Create: `src/shared/emails/staff-access-guide.fixture.ts`
- Modify: `src/shared/lib/email/system-emails.ts`
- Modify: `src/shared/lib/email/types.ts`
- Modify: `src/shared/emails/_registry/data.ts`
- Modify: `src/shared/emails/_registry/index.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/staff/page.tsx`
- Test: `__tests__/unit/emails/staff-access-guide.test.tsx`

- [ ] **Step 1: Write email rendering test**

Create `__tests__/unit/emails/staff-access-guide.test.tsx`:

```ts
import { describe, expect, test } from "bun:test";
import { render } from "@react-email/render";
import { StaffAccessGuideEmail } from "@/shared/emails/staff-access-guide";
import { staffAccessGuideFixture } from "@/shared/emails/staff-access-guide.fixture";

describe("StaffAccessGuideEmail", () => {
  test("renders admin URL and no password/setup token language", async () => {
    const html = await render(<StaffAccessGuideEmail {...staffAccessGuideFixture} />);
    expect(html).toContain("https://admin.example.com/admin");
    expect(html).toContain("staff@example.com");
    expect(html).not.toContain("パスワードを設定");
    expect(html).not.toContain("/setup/");
    expect(html).toContain("Googleアカウント");
  });
});
```

Run:

```powershell
bun scripts/run-tests.ts __tests__/unit/emails/staff-access-guide.test.tsx
```

Expected: FAIL because the new template does not exist.

- [ ] **Step 2: Create access guide email**

Create `src/shared/emails/staff-access-guide.tsx` with props:

```ts
type Props = {
  staffName: string;
  staffEmail: string;
  roleLabel: string;
  adminUrl: string;
  footer: EmailFooterData;
};
```

Body copy must say:

- 管理URL is shared.
- Sign in with the listed Google account.
- No app password is required.
- Contact admin if access is denied.

- [ ] **Step 3: Replace sender**

In `src/shared/lib/email/types.ts`, replace `StaffInvitationEmailData` with:

```ts
export type StaffAccessGuideEmailData = {
  to: string;
  staffName: string;
  staffEmail: string;
  roleLabel: string;
  adminUrl: string;
};
```

In `system-emails.ts`, replace `sendStaffInvitationEmail` with
`sendStaffAccessGuideEmail` using subject:

```ts
subject: `【管理画面のご案内】${footer.businessName}`,
```

Use idempotency key:

```ts
idempotencyKey: `staff-access-guide/${hashForKey(`${data.staffEmail}:${data.adminUrl}`)}`,
```

- [ ] **Step 4: Replace staff new flow**

The `/admin/staff/new` page creates the staff user directly and sends the guide
email after successful creation.

Use `createUser` action. After success, show:

```text
スタッフを登録し、管理画面の案内メールを送信しました。
```

If email is disabled, the user is still created and the UI says:

```text
スタッフを登録しました。メール送信は無効です。
```

- [ ] **Step 5: Remove pending invitations section**

In `src/app/(admin)/admin/(dashboard)/staff/page.tsx`:

- Remove `getPendingInvitations`.
- Remove `InvitationSection`.
- Remove `InvitationTable`.
- Change button label from `スタッフを招待` to `スタッフを追加`.

- [ ] **Step 6: Verify Task 5**

Run:

```powershell
bun scripts/run-tests.ts __tests__/unit/emails/staff-access-guide.test.tsx
rg -n "StaffInvitation|staffInvitation|staff-invitation|/admin/setup|setupPassword" src __tests__ e2e prisma
bun run type-check
```

Expected: test PASS; `rg` only shows migration history or intentionally renamed
email template data if still staged for deletion.

Commit:

```powershell
git add src __tests__
git commit -m "refactor: replace staff invitations with access guide"
```

---

### Task 6: Drop StaffInvitation Model And Add Initial Admin Bootstrap

**Files:**

- Modify: `prisma/schema.prisma`
- Add: `prisma/migrations/<timestamp>_drop_staff_invitations/migration.sql`
- Create: `src/shared/lib/bootstrap/initial-admin.ts`
- Modify: `src/shared/lib/bootstrap.ts` or bootstrap index used by
  `src/instrumentation.ts`
- Modify: `src/instrumentation.ts`
- Test: `__tests__/unit/lib/bootstrap/initial-admin.test.ts`

- [ ] **Step 1: Write bootstrap tests**

Create tests for:

```ts
test("creates initial SUPER_ADMIN without credential account when none exists", async () => {
  mockSuperAdminCount.mockResolvedValue(0);
  mockFindUnique.mockResolvedValue(null);

  await bootstrapInitialAdmin();

  expect(mockUserCreate).toHaveBeenCalledWith({
    data: {
      email: "owner@example.com",
      name: "Owner",
      role: "SUPER_ADMIN",
      emailVerified: true,
    },
  });
  expect(mockAccountCreate).not.toHaveBeenCalled();
});
```

Run:

```powershell
bun scripts/run-tests.ts __tests__/unit/lib/bootstrap/initial-admin.test.ts
```

Expected: FAIL because bootstrap does not exist.

- [ ] **Step 2: Remove Prisma model**

In `prisma/schema.prisma`:

- Remove `createdStaffInvitations` from `User`.
- Remove `model StaffInvitation`.

Create migration:

```powershell
bunx --bun prisma migrate dev --name drop_staff_invitations
```

Expected migration SQL contains:

```sql
DROP TABLE "staff_invitations";
```

- [ ] **Step 3: Implement bootstrap**

Create `src/shared/lib/bootstrap/initial-admin.ts`:

```ts
import "server-only";

import { Role } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { serverEnv } from "@/shared/lib/env/server";

export async function bootstrapInitialAdmin(): Promise<void> {
  const email = serverEnv.INITIAL_ADMIN_EMAIL;
  if (!email) return;

  const name = serverEnv.INITIAL_ADMIN_NAME ?? email;
  const superAdminCount = await prisma.user.count({
    where: { role: Role.SUPER_ADMIN },
  });
  if (superAdminCount > 0) return;

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { name, role: Role.SUPER_ADMIN, emailVerified: true },
    });
    return;
  }

  await prisma.user.create({
    data: {
      email,
      name,
      role: Role.SUPER_ADMIN,
      emailVerified: true,
    },
  });
}
```

Call it in `src/instrumentation.ts` after production env validation and before
other bootstrap that expects an admin author.

- [ ] **Step 4: Verify Task 6**

Run:

```powershell
bun run db:generate
bun scripts/run-tests.ts __tests__/unit/lib/bootstrap/initial-admin.test.ts
bun run type-check
```

Commit:

```powershell
git add prisma src/shared/lib/bootstrap src/instrumentation.ts __tests__/unit/lib/bootstrap
git commit -m "feat: bootstrap initial IAP admin"
```

---

### Task 7: Update E2E And Local Auth Test Harness

**Files:**

- Modify: `e2e/helpers/admin-auth.ts`
- Modify: `e2e/auth/admin.setup.ts`
- Modify: `scripts/e2e/ensure-admin-user.ts`
- Modify: `e2e/fixtures/test-data.ts`
- Modify: admin E2E specs that assert `/admin/login`
- Modify: `playwright.config.ts` if env injection is centralized there

- [ ] **Step 1: Replace password sign-in helper**

In `e2e/helpers/admin-auth.ts`, remove form login and set the explicit test env
identity path:

```ts
export async function signInAsAdmin(page: Page): Promise<void> {
  await ensureAdminUser();
  await primeAdminRequestContext(page.context());
  await page.goto(urls.adminDashboard);
  await expect(page.getByRole("main")).toBeVisible();
}
```

Ensure E2E server env includes:

```text
ADMIN_TEST_IAP_EMAIL=<admin test email>
```

- [ ] **Step 2: Update ensure-admin-user script**

Remove `hashPassword` and credential account creation from
`scripts/e2e/ensure-admin-user.ts`. It should create/update only `User` with
`Role.ADMIN` and `emailVerified: true`.

- [ ] **Step 3: Update smoke tests**

Replace admin login form smoke expectations with:

```ts
test("admin login route redirects to admin root", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page).toHaveURL(/\/admin$/u);
});
```

- [ ] **Step 4: Verify Task 7**

Run:

```powershell
bun run type-check
bun run e2e -- --project=authenticated --grep @admin
```

If the repository uses a different Playwright project name, run the smallest
admin authenticated project present in `playwright.config.ts`.

Commit:

```powershell
git add e2e scripts/e2e playwright.config.ts
git commit -m "test: update admin e2e for IAP-only auth"
```

---

### Task 8: Architecture Cleanup And Final Validation

**Files:**

- Modify: `__tests__/unit/architecture-boundaries.test.ts`
- Modify: any tests still asserting admin Better Auth exports
- Modify: docs/runbooks if they describe admin password setup

- [ ] **Step 1: Update architecture tests**

Replace assertions requiring `adminAuth` export and `/api/auth/[...all]` with:

```ts
expect(read("src/shared/lib/admin-auth.ts")).not.toContain("betterAuth(");
expect(read("src/shared/lib/admin-auth.ts")).toContain("resolveIapIdentity");
expect(exists("src/app/api/auth/[...all]/route.ts")).toBe(false);
```

Add a boundary test:

```ts
expect(rg("src", "signIn.email")).not.toContain("admin");
expect(rg("src", "StaffInvitation")).toHaveLength(0);
```

- [ ] **Step 2: Remove obsolete validation/auth tests**

Delete or rewrite:

- `__tests__/unit/lib/validations/auth.test.ts`
- admin credential-stuffing proxy expectations
- staff invitation command/action tests

Keep customer auth tests unchanged.

- [ ] **Step 3: Run focused gates**

Run:

```powershell
bun run db:generate
bun scripts/run-tests.ts __tests__/unit/lib/iap __tests__/unit/lib/admin-auth-iap.test.ts __tests__/unit/domain/users/commands.test.ts __tests__/unit/lib/validations/user.test.ts __tests__/unit/emails/staff-access-guide.test.tsx __tests__/unit/proxy-admin-gate.test.ts __tests__/unit/proxy-public-surface.test.ts
bun test __tests__/unit/architecture-boundaries.test.ts
bun test __tests__/unit/architecture/admin-design-tokens.test.ts
bun test __tests__/unit/architecture/admin-submit-button-pattern.test.ts
bun run type-check
bun run lint
```

- [ ] **Step 4: Run broad validation**

Run:

```powershell
bun run validate
```

Expected: PASS.

- [ ] **Step 5: Manual production checks after deploy**

After merge and deploy:

```powershell
Invoke-WebRequest -Uri 'https://rental-space.myrrh-jp.com/admin' -MaximumRedirection 0
```

Expected: `404` on public service.

```powershell
Invoke-WebRequest -Uri 'https://myrrh-rental-space-admin-da57q4squa-an.a.run.app/admin' -MaximumRedirection 0
```

Expected: `302` to Google/IAP when unauthenticated.

With an IAP-allowed Google account and matching DB staff row:

```text
/admin opens the dashboard without an app password form.
```

Commit:

```powershell
git add .
git commit -m "test: enforce IAP-only admin auth boundary"
```

---

## Plan Self-review

- Spec coverage: IAP-only auth, no admin password login, access-denied page,
  staff access guide email, initial admin bootstrap, DB cleanup, deployment env,
  and tests are each covered by a task.
- Placeholder scan: no TBD/TODO/implement-later steps remain.
- Type consistency: `AdminUser`, `IapIdentity`, `StaffAccessGuideEmailData`,
  `IAP_JWT_AUDIENCE`, `INITIAL_ADMIN_EMAIL`, and `ADMIN_TEST_IAP_EMAIL` are
  defined before later tasks rely on them.
