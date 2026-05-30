"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/admin/Icon";
import { avatarColor, initialsFor } from "@/lib/ui/avatar";
import {
  formatDateOnly,
  formatFullDate,
  formatRelative,
} from "@/lib/ui/dates";
import { useEscClose } from "@/lib/ui/useEscClose";
import { ConfirmDialog } from "./ConfirmDialog";
import { RolePicker } from "./RolePicker";
import type { ActionResult, PermFlags, RoleOption, UserRow } from "./types";

type Tab = "profile" | "roles" | "security";

type Props = {
  user: UserRow;
  roles: RoleOption[];
  perms: PermFlags;
  isSelf: boolean;
  onClose: () => void;
  onUpdateProfile: (input: { name: string }) => Promise<ActionResult>;
  onToggleActive: (active: boolean) => Promise<ActionResult>;
  onSetRoles: (roleIds: string[]) => Promise<ActionResult>;
  onSetPassword: (
    password: string,
  ) => Promise<ActionResult<{ sessionsRevoked: number }>>;
  onRevokeSessions: () => Promise<ActionResult<{ count: number }>>;
  onDelete: () => Promise<ActionResult>;
};

export function UserDetailDrawer({
  user,
  roles,
  perms,
  isSelf,
  onClose,
  onUpdateProfile,
  onToggleActive,
  onSetRoles,
  onSetPassword,
  onRevokeSessions,
  onDelete,
}: Props) {
  const [tab, setTab] = useState<Tab>("profile");

  // Profile
  const [name, setName] = useState(user.name);
  const [nameDirty, setNameDirty] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  // Roles
  const [roleIds, setRoleIds] = useState<string[]>(user.roles.map((r) => r.id));
  const [rolesDirty, setRolesDirty] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [rolesSaving, setRolesSaving] = useState(false);

  // Security
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securitySaving, setSecuritySaving] = useState(false);

  // Active toggle
  const [activeBusy, setActiveBusy] = useState(false);

  // Delete (with confirm dialog)
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const busy =
    profileSaving ||
    rolesSaving ||
    securitySaving ||
    activeBusy ||
    deleting ||
    confirmingDelete;
  useEscClose(true, onClose, busy);

  // H8: hydration-safe dates — only render relative after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // H5: only resync when the *user identity* changes. Pending edits survive
  // a router.refresh() triggered by sibling mutations.
  useEffect(() => {
    setName(user.name);
    setRoleIds(user.roles.map((r) => r.id));
    setNameDirty(false);
    setRolesDirty(false);
    setPassword("");
    setShowPassword(false);
    setProfileError(null);
    setRolesError(null);
    setSecurityError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const canEdit = perms.canWrite;
  const canAssignRoles = perms.canAssignRoles;
  const cannotTouchSelf = isSelf;

  const saveProfile = async () => {
    if (profileSaving) return;
    setProfileSaving(true);
    setProfileError(null);
    const res = await onUpdateProfile({ name: name.trim() });
    if (!res.ok) {
      setProfileError(res.error);
    } else {
      setNameDirty(false);
    }
    setProfileSaving(false);
  };

  const saveRoles = async () => {
    if (rolesSaving) return;
    setRolesSaving(true);
    setRolesError(null);
    const res = await onSetRoles(roleIds);
    if (!res.ok) {
      setRolesError(res.error);
    } else {
      setRolesDirty(false);
    }
    setRolesSaving(false);
  };

  const setPasswordNow = async () => {
    if (securitySaving) return;
    if (password.length < 6) {
      setSecurityError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setSecuritySaving(true);
    setSecurityError(null);
    const res = await onSetPassword(password);
    if (!res.ok) setSecurityError(res.error);
    else setPassword("");
    setSecuritySaving(false);
  };

  const toggleActive = async () => {
    if (activeBusy) return;
    setActiveBusy(true);
    await onToggleActive(!user.active);
    setActiveBusy(false);
  };

  const handleConfirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    const res = await onDelete();
    setDeleting(false);
    setConfirmingDelete(false);
    if (res.ok) onClose();
  };

  const handleRevokeSessions = async () => {
    await onRevokeSessions();
  };

  const lastLoginAbs = user.lastLoginAt
    ? formatFullDate(user.lastLoginAt)
    : "";
  const createdAbs = formatFullDate(user.createdAt);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 480 }}
      >
        <header className="drawer__head">
          <div style={{ display: "flex", gap: 14, minWidth: 0, flex: 1 }}>
            <div
              className="usr-avatar"
              style={{
                width: 48,
                height: 48,
                fontSize: 16,
                background: avatarColor(user.id),
              }}
            >
              {initialsFor(user.name)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="drawer__eyebrow">Usuario</div>
              <h2 style={{ margin: "0 0 4px" }}>{user.name}</h2>
              <div className="drawer__email">
                <Icon name="mail" size={14} />
                {user.email}
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                <span
                  className={`badge ${
                    user.active ? "badge--green" : "badge--neutral"
                  }`}
                >
                  {user.active ? "Activo" : "Suspendido"}
                </span>
                {isSelf && (
                  <span className="badge badge--accent">Tú</span>
                )}
              </div>
            </div>
          </div>
          <button
            className="iconbtn"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="drawer__stats">
          <div className="stat">
            <div className="stat__v">{user.roles.length}</div>
            <div className="stat__l">Roles</div>
          </div>
          <div className="stat" title={mounted ? lastLoginAbs : undefined}>
            <div className="stat__v" style={{ fontSize: 14 }}>
              {mounted
                ? formatRelative(user.lastLoginAt)
                : formatDateOnly(user.lastLoginAt)}
            </div>
            <div className="stat__l">Último acceso</div>
          </div>
          <div className="stat" title={mounted ? createdAbs : undefined}>
            <div className="stat__v" style={{ fontSize: 14 }}>
              {mounted
                ? formatRelative(user.createdAt)
                : formatDateOnly(user.createdAt)}
            </div>
            <div className="stat__l">Creado</div>
          </div>
        </div>

        <div className="usr-drawer-tabs">
          <button
            className={`usr-drawer-tab ${tab === "profile" ? "is-active" : ""}`}
            onClick={() => setTab("profile")}
          >
            Perfil
          </button>
          <button
            className={`usr-drawer-tab ${tab === "roles" ? "is-active" : ""}`}
            onClick={() => setTab("roles")}
          >
            Roles
          </button>
          <button
            className={`usr-drawer-tab ${tab === "security" ? "is-active" : ""}`}
            onClick={() => setTab("security")}
          >
            Seguridad
          </button>
        </div>

        <div style={{ padding: 20, flex: 1, overflowY: "auto" }}>
          {tab === "profile" && (
            <div className="usr-formgrid">
              {profileError && (
                <div className="login__error">
                  <Icon name="info" size={16} />
                  <span>{profileError}</span>
                </div>
              )}
              <label className="field" style={{ margin: 0 }}>
                <span className="field__label">Nombre completo</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameDirty(true);
                  }}
                  disabled={!canEdit || profileSaving}
                />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span className="field__label">Correo</span>
                <input
                  type="text"
                  value={user.email}
                  disabled
                  style={{ background: "var(--bg-soft)" }}
                />
              </label>
              <div className="usr-toggle">
                <div>
                  <div className="usr-toggle__label">Cuenta activa</div>
                  <div className="usr-toggle__sub">
                    {user.active
                      ? "Puede iniciar sesión y recibir correos."
                      : "El acceso está suspendido."}
                    {cannotTouchSelf && " No puedes suspender tu propia cuenta."}
                  </div>
                </div>
                <button
                  className={`usr-switch ${user.active ? "is-on" : ""}`}
                  onClick={toggleActive}
                  disabled={!canEdit || cannotTouchSelf || activeBusy}
                  aria-label="Activar/Suspender"
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  className="btn btn--primary"
                  onClick={saveProfile}
                  disabled={
                    !canEdit ||
                    profileSaving ||
                    !nameDirty ||
                    name.trim() === user.name ||
                    name.trim().length < 2
                  }
                >
                  {profileSaving ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </div>
          )}

          {tab === "roles" && (
            <div className="usr-formgrid">
              {rolesError && (
                <div className="login__error">
                  <Icon name="info" size={16} />
                  <span>{rolesError}</span>
                </div>
              )}
              {!canAssignRoles && (
                <div
                  style={{
                    background: "var(--bg-soft)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontSize: 12.5,
                    color: "var(--text-muted)",
                  }}
                >
                  Solo puedes ver los roles asignados — necesitas el permiso{" "}
                  <code>users.assign-roles</code> para modificarlos.
                </div>
              )}
              <RolePicker
                roles={roles}
                selected={roleIds}
                onChange={(next) => {
                  setRoleIds(next);
                  setRolesDirty(true);
                }}
                disabled={!canAssignRoles || rolesSaving}
              />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  className="btn btn--primary"
                  onClick={saveRoles}
                  disabled={
                    !canAssignRoles ||
                    rolesSaving ||
                    !rolesDirty ||
                    sameSet(
                      roleIds,
                      user.roles.map((r) => r.id),
                    )
                  }
                >
                  {rolesSaving ? "Guardando…" : "Guardar roles"}
                </button>
              </div>
            </div>
          )}

          {tab === "security" && (
            <div className="usr-formgrid">
              {securityError && (
                <div className="login__error">
                  <Icon name="info" size={16} />
                  <span>{securityError}</span>
                </div>
              )}
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    marginBottom: 6,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>Establecer nueva contraseña</span>
                  <button
                    className="linkbtn"
                    onClick={() => setShowPassword((v) => !v)}
                    style={{ padding: "2px 6px", fontSize: 11.5 }}
                    disabled={securitySaving}
                  >
                    {showPassword ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
                <label className="field" style={{ margin: 0 }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="mínimo 6 caracteres"
                    disabled={!canEdit || securitySaving}
                    autoComplete="new-password"
                  />
                </label>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    marginTop: 6,
                  }}
                >
                  Al cambiar la contraseña se cerrarán todas las sesiones
                  activas {isSelf ? "(excepto la actual)" : "del usuario"}.
                </div>
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    className="btn btn--primary"
                    onClick={setPasswordNow}
                    disabled={!canEdit || securitySaving || password.length < 6}
                  >
                    {securitySaving ? "Aplicando…" : "Aplicar contraseña"}
                  </button>
                </div>
              </div>

              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  paddingTop: 16,
                  marginTop: 4,
                }}
              >
                <div
                  style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}
                >
                  Sesiones activas
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--text-muted)",
                    lineHeight: 1.5,
                  }}
                >
                  Cerrar todas las sesiones obliga al usuario a iniciar sesión de
                  nuevo en todos sus dispositivos
                  {isSelf ? " (la actual se preserva)" : ""}.
                </div>
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    className="btn btn--ghost"
                    onClick={handleRevokeSessions}
                    disabled={!canEdit}
                  >
                    Cerrar todas las sesiones
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="drawer__foot">
          <button
            className="btn btn--ghost"
            style={{ color: "#b91c1c" }}
            onClick={() => setConfirmingDelete(true)}
            disabled={!canEdit || cannotTouchSelf || deleting}
            title={
              cannotTouchSelf
                ? "No puedes eliminar tu propia cuenta"
                : undefined
            }
          >
            {deleting ? "Eliminando…" : "Eliminar usuario"}
          </button>
          <button className="btn btn--primary" onClick={onClose}>
            Cerrar
          </button>
        </footer>
      </aside>

      {confirmingDelete && (
        <ConfirmDialog
          title={`Eliminar a ${user.name}`}
          description={
            <>
              Esta acción es <b>irreversible</b>. Se eliminarán las sesiones del
              usuario, sus asignaciones de rol y su cuenta. Esta acción no se
              puede deshacer.
            </>
          }
          confirmLabel="Eliminar definitivamente"
          tone="danger"
          busy={deleting}
          onConfirm={handleConfirmDelete}
          onClose={() => !deleting && setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const x of b) if (!sa.has(x)) return false;
  return true;
}
