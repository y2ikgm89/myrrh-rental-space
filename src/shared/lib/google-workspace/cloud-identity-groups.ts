import "server-only";

import { google, type cloudidentity_v1 } from "googleapis";

const CLOUD_IDENTITY_GROUPS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/cloud-identity.groups.readonly";

const groupNameByEmail = new Map<string, string>();

let cloudIdentityClientPromise: Promise<cloudidentity_v1.Cloudidentity> | null =
  null;

async function getCloudIdentityClient(): Promise<cloudidentity_v1.Cloudidentity> {
  if (cloudIdentityClientPromise) return cloudIdentityClientPromise;
  const auth = new google.auth.GoogleAuth({
    scopes: [CLOUD_IDENTITY_GROUPS_READONLY_SCOPE],
  });

  cloudIdentityClientPromise = Promise.resolve(
    google.cloudidentity({
      version: "v1",
      auth,
    }),
  );
  return cloudIdentityClientPromise;
}

async function lookupGroupNameByEmail(groupEmail: string): Promise<string> {
  const cached = groupNameByEmail.get(groupEmail);
  if (cached) return cached;

  const cloudIdentity = await getCloudIdentityClient();
  const result = await cloudIdentity.groups.lookup({
    "groupKey.id": groupEmail,
  });
  const groupName = result.data.name;
  if (!groupName) {
    throw new Error(`Google Cloud Identity group not found: ${groupEmail}`);
  }

  groupNameByEmail.set(groupEmail, groupName);
  return groupName;
}

function escapeCelString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

export async function isGoogleWorkspaceGroupMember({
  groupEmail,
  memberEmail,
}: {
  groupEmail: string;
  memberEmail: string;
}): Promise<boolean> {
  const cloudIdentity = await getCloudIdentityClient();
  const groupName = await lookupGroupNameByEmail(groupEmail);
  const result =
    await cloudIdentity.groups.memberships.checkTransitiveMembership({
      parent: groupName,
      query: `member_key_id == '${escapeCelString(memberEmail)}'`,
    });
  return result.data.hasMembership === true;
}

export async function lookupGoogleWorkspaceGroupResourceName(
  groupEmail: string,
): Promise<string> {
  return lookupGroupNameByEmail(groupEmail);
}
