export type RoleUser = {
  id: string;
  name: string;
  email: string;
  active: boolean;
};

export type RolePermissionItem = {
  key: string;
  name: string;
  description: string;
  category: string;
};

export type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  system: boolean;
  userCount: number;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  permissions: RolePermissionItem[];
  users: RoleUser[];
};

export type AvailablePermission = {
  key: string;
  name: string;
  description: string;
  category: string;
};

export type PermFlags = {
  canRead: boolean;
  canWrite: boolean;
  canAssignRoles: boolean;
};

// Discriminated union (mirror of usuarios/types.ts)
export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
