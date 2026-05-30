export type UserRow = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: { id: string; key: string; name: string }[];
};

export type RoleOption = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  system: boolean;
};

export type PermFlags = {
  canRead: boolean;
  canWrite: boolean;
  canAssignRoles: boolean;
};

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
    };
