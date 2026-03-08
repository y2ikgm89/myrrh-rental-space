import type { Role } from "@/shared/db/enums";
import type { Serialized } from "@/shared/lib/serialize";

type StaffInvitationRecord = {
  id: string;
  email: string;
  role: Role;
  name: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

export type InvitationData = Serialized<StaffInvitationRecord>;
