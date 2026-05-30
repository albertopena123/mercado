"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Icon } from "@/components/admin/Icon";
import { avatarColor, initialsFor } from "@/lib/ui/avatar";
import { formatDateOnly, formatFullDate, formatRelative } from "@/lib/ui/dates";
import {
  bulkDelete,
  bulkSetActive,
  createUser,
  deleteUser,
  revokeUserSessions,
  setUserActive,
  setUserPassword,
  setUserRoles,
  updateUserProfile,
} from "./actions";
import { CreateUserModal } from "./CreateUserModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { UserDetailDrawer } from "./UserDetailDrawer";
import { Toasts, type Toast } from "./Toasts";
import type { PermFlags, RoleOption, UserRow } from "./types";
import "./users.css";

type Props = {
  rows: UserRow[];
  roles: RoleOption[];
  perms: PermFlags;
  currentUserId: string;
};

type SortKey = "name" | "lastLoginAt" | "createdAt";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "active" | "suspended";

function roleBadgeClass(key: string): string {
  if (key === "superadmin") return "badge badge--red";
  if (key === "admin") return "badge badge--amber";
  if (key === "editor") return "badge badge--green";
  return "badge badge--neutral";
}

function parseSort(raw: string | null): { key: SortKey; dir: SortDir } {
  const allowed: SortKey[] = ["name", "lastLoginAt", "createdAt"];
  if (!raw) return { key: "createdAt", dir: "desc" };
  const [k, d] = raw.split(":");
  return {
    key: (allowed as string[]).includes(k) ? (k as SortKey) : "createdAt",
    dir: d === "asc" ? "asc" : "desc",
  };
}

export function UsersClient({ rows, roles, perms, currentUserId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // URL state
  const search = (params.get("q") ?? "").toLowerCase().trim();
  const statusFilter: StatusFilter =
    params.get("status") === "active"
      ? "active"
      : params.get("status") === "suspended"
        ? "suspended"
        : "all";
  const roleFilter = params.get("role");
  const { key: sortKey, dir: sortDir } = parseSort(params.get("sort"));
  const detailId = params.get("detail");
  const creating = params.get("new") === "1";

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [params, pathname, router],
  );

  // Hydration-safe: render absolute dates on first paint, swap to relative after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // H7: top-level mutation counter so we can render "actualizando…"
  // for the entire span of an action (server-action await + router.refresh).
  const [inFlight, setInFlight] = useState(0);
  const isMutating = inFlight > 0;
  const runAction = useCallback(async function <T>(
    fn: () => Promise<T>,
  ): Promise<T> {
    setInFlight((n) => n + 1);
    try {
      return await fn();
    } finally {
      setInFlight((n) => n - 1);
    }
  }, []);

  // Local-only state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuFlipUp, setMenuFlipUp] = useState(false);
  const [roleChipOpen, setRoleChipOpen] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  const pushToast = useCallback((kind: Toast["kind"], message: string) => {
    toastSeq.current += 1;
    const id = toastSeq.current;
    setToasts((t) => [...t, { id, kind, message }]);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  // Close kebab / role-chip on outside click
  useEffect(() => {
    if (!openMenuId && !roleChipOpen) return;
    const h = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (openMenuId && !target.closest(".usr-kebab")) setOpenMenuId(null);
      if (roleChipOpen && !target.closest(".filterbar__menu"))
        setRoleChipOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [openMenuId, roleChipOpen]);

  // Reset selection when filter set changes meaningfully
  useEffect(() => {
    setSelected(new Set());
  }, [search, statusFilter, roleFilter]);

  // Computed
  const filtered = useMemo(() => {
    let out = rows;
    if (statusFilter === "active") out = out.filter((u) => u.active);
    if (statusFilter === "suspended") out = out.filter((u) => !u.active);
    if (roleFilter)
      out = out.filter((u) => u.roles.some((r) => r.id === roleFilter));
    if (search) {
      out = out.filter(
        (u) =>
          u.name.toLowerCase().includes(search) ||
          u.email.toLowerCase().includes(search) ||
          u.roles.some((r) => r.name.toLowerCase().includes(search)),
      );
    }
    return [...out].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name") {
        return dir * a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      }
      const aValue = a[sortKey] ?? "";
      const bValue = b[sortKey] ?? "";
      if (!aValue && !bValue) return 0;
      if (!aValue) return 1;
      if (!bValue) return -1;
      return dir * (new Date(aValue).getTime() - new Date(bValue).getTime());
    });
  }, [rows, search, statusFilter, roleFilter, sortKey, sortDir]);

  const activeCount = rows.filter((u) => u.active).length;
  const suspendedCount = rows.length - activeCount;
  const hasFilters =
    !!roleFilter || statusFilter !== "all" || search !== "";

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setParams({ sort: `${k}:${sortDir === "asc" ? "desc" : "asc"}` });
    } else {
      setParams({ sort: `${k}:${k === "name" ? "asc" : "desc"}` });
    }
  };

  const toggleOne = (id: string) => {
    if (id === currentUserId) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  // Selectable rows exclude self (server filters it anyway, but exposing it in
  // the UI causes confusing "se procesaron N de N+1" UX).
  const selectableFiltered = useMemo(
    () => filtered.filter((u) => u.id !== currentUserId),
    [filtered, currentUserId],
  );
  const toggleAll = () => {
    if (selected.size === selectableFiltered.length) setSelected(new Set());
    else setSelected(new Set(selectableFiltered.map((u) => u.id)));
  };

  const clearFilters = () =>
    setParams({ status: null, role: null, q: null });

  const afterMutation = () => {
    startTransition(() => router.refresh());
  };

  const openKebab = (rowId: string, btn: HTMLElement) => {
    if (openMenuId === rowId) {
      setOpenMenuId(null);
      return;
    }
    const rect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setMenuFlipUp(spaceBelow < 220);
    setOpenMenuId(rowId);
  };

  const detailUser =
    rows.find((u) => u.id === detailId) ??
    filtered.find((u) => u.id === detailId) ??
    null;

  const roleFilterName = roleFilter
    ? (roles.find((r) => r.id === roleFilter)?.name ?? "Rol")
    : null;

  return (
    <div className="page">
      <div className="page__tabs">
        <button className="tab is-active">Usuarios</button>
      </div>

      <div className="page__head">
        <div className="page__title">
          <h1>Usuarios</h1>
          <span className="page__sub">
            {rows.length} total · {activeCount} activos · {suspendedCount}{" "}
            suspendidos
            {(isPending || isMutating) && (
              <span style={{ marginLeft: 12, color: "var(--accent)" }}>
                · actualizando…
              </span>
            )}
          </span>
        </div>
        <div className="page__actions">
          <button
            className="btn--cta"
            disabled={!perms.canWrite}
            onClick={() => setParams({ new: "1" })}
          >
            <Icon name="plus" size={16} />
            <span>Crear usuario</span>
          </button>
          <button
            className="linkbtn"
            disabled
            title="Próximamente"
            style={{ cursor: "not-allowed" }}
          >
            Importar CSV
          </button>
        </div>
      </div>

      <div className="filterbar">
        <button
          className={`usr-filter ${statusFilter === "all" ? "is-on" : ""}`}
          onClick={() => setParams({ status: null })}
        >
          Todos · {rows.length}
        </button>
        <button
          className={`usr-filter ${statusFilter === "active" ? "is-on" : ""}`}
          onClick={() => setParams({ status: "active" })}
        >
          Activos · {activeCount}
        </button>
        <button
          className={`usr-filter ${
            statusFilter === "suspended" ? "is-on" : ""
          }`}
          onClick={() => setParams({ status: "suspended" })}
        >
          Suspendidos · {suspendedCount}
        </button>
        <span className="filter-sep" />

        <div className="filterbar__menu">
          <button
            className={`usr-filter ${roleFilter ? "is-on" : ""}`}
            onClick={() => setRoleChipOpen((v) => !v)}
          >
            <Icon name="users" size={14} />
            <span>{roleFilterName ?? "Cualquier rol"}</span>
            <Icon name="chevron-down" size={14} />
          </button>
          {roleChipOpen && (
            <div className="chip-popover">
              <button
                className={`chip-popover__opt ${
                  !roleFilter ? "is-on" : ""
                }`}
                onClick={() => {
                  setParams({ role: null });
                  setRoleChipOpen(false);
                }}
              >
                <span className="chip-popover__opt-check">
                  {!roleFilter && <Icon name="check" size={14} />}
                </span>
                Cualquier rol
              </button>
              {roles.map((r) => (
                <button
                  key={r.id}
                  className={`chip-popover__opt ${
                    roleFilter === r.id ? "is-on" : ""
                  }`}
                  onClick={() => {
                    setParams({ role: r.id });
                    setRoleChipOpen(false);
                  }}
                >
                  <span className="chip-popover__opt-check">
                    {roleFilter === r.id && <Icon name="check" size={14} />}
                  </span>
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {hasFilters && (
          <button className="filterbar__clear" onClick={clearFilters}>
            Borrar filtros
          </button>
        )}
      </div>

      <div className="tablewrap density-regular">
        {selected.size > 0 && (
          <div className="bulkbar">
            <span>
              <b>{selected.size}</b> seleccionado{selected.size > 1 ? "s" : ""}
            </span>
            <div className="bulkbar__actions">
              <button
                className="iconbtn iconbtn--small"
                aria-label="Activar"
                title="Activar"
                disabled={!perms.canWrite || isMutating}
                onClick={async () => {
                  const res = await runAction(() =>
                    bulkSetActive([...selected], true),
                  );
                  setSelected(new Set());
                  if (res.ok) {
                    pushToast(
                      "success",
                      `Se activaron ${res.data?.count ?? 0} usuario(s).`,
                    );
                    if ((res.data?.skippedSupers ?? 0) > 0) {
                      pushToast(
                        "error",
                        `Se omitieron ${res.data?.skippedSupers} superadministrador(es) — solo un superadministrador puede modificarlos.`,
                      );
                    }
                  } else pushToast("error", res.error);
                  afterMutation();
                }}
              >
                <Icon name="check" size={18} />
              </button>
              <button
                className="iconbtn iconbtn--small"
                aria-label="Suspender"
                title="Suspender"
                disabled={!perms.canWrite || isMutating}
                onClick={async () => {
                  const res = await runAction(() =>
                    bulkSetActive([...selected], false),
                  );
                  setSelected(new Set());
                  if (res.ok) {
                    pushToast(
                      "success",
                      `Se suspendieron ${res.data?.count ?? 0} usuario(s).`,
                    );
                    if ((res.data?.skippedSupers ?? 0) > 0) {
                      pushToast(
                        "error",
                        `Se omitieron ${res.data?.skippedSupers} superadministrador(es) — solo un superadministrador puede modificarlos.`,
                      );
                    }
                  } else pushToast("error", res.error);
                  afterMutation();
                }}
              >
                <Icon name="lock" size={18} />
              </button>
              <button
                className="iconbtn iconbtn--small"
                aria-label="Eliminar"
                title="Eliminar"
                disabled={!perms.canWrite}
                onClick={() => setConfirmBulkDelete(true)}
              >
                <Icon name="trash" size={18} />
              </button>
              <button
                className="linkbtn"
                onClick={() => setSelected(new Set())}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="tablewrap__scroll">
        <table className="dtable">
          <thead>
            <tr>
              <th className="dtable__check">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={
                      selectableFiltered.length > 0 &&
                      selected.size === selectableFiltered.length
                    }
                    onChange={toggleAll}
                    disabled={selectableFiltered.length === 0}
                  />
                  <span className="checkbox__box">
                    {selectableFiltered.length > 0 &&
                    selected.size === selectableFiltered.length ? (
                      <Icon name="check" size={14} />
                    ) : selected.size > 0 ? (
                      <span className="checkbox__dash" />
                    ) : null}
                  </span>
                </label>
              </th>
              <SortableTh
                label="Nombre"
                k="name"
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggleSort}
              />
              <th>Roles</th>
              <th>Estado</th>
              <SortableTh
                label="Último acceso"
                k="lastLoginAt"
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggleSort}
              />
              <SortableTh
                label="Creado"
                k="createdAt"
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggleSort}
              />
              <th className="dtable__settings">
                <button
                  className="iconbtn iconbtn--small"
                  aria-label="Ajustes"
                  title="Próximamente"
                >
                  <Icon name="settings" size={16} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const isSelf = u.id === currentUserId;
              const lastAbs = u.lastLoginAt
                ? formatFullDate(u.lastLoginAt)
                : "Nunca ha ingresado";
              const createdAbs = formatFullDate(u.createdAt);
              return (
                <tr
                  key={u.id}
                  className={selected.has(u.id) ? "is-selected" : ""}
                >
                  <td className="dtable__check">
                    <label
                      className="checkbox"
                      title={
                        isSelf ? "No puedes seleccionarte a ti mismo" : undefined
                      }
                      style={isSelf ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(u.id)}
                        onChange={() => toggleOne(u.id)}
                        disabled={isSelf}
                      />
                      <span className="checkbox__box">
                        {selected.has(u.id) && (
                          <Icon name="check" size={14} />
                        )}
                      </span>
                    </label>
                  </td>
                  <td>
                    <div className="usr-row-name">
                      <span
                        className="usr-avatar"
                        style={{ background: avatarColor(u.id) }}
                        title={u.name}
                      >
                        {initialsFor(u.name)}
                      </span>
                      <div className="usr-row-name__text">
                        <button
                          className="usr-row-name__t"
                          onClick={() => setParams({ detail: u.id })}
                          title={u.name}
                        >
                          <span className="usr-row-name__t-text">
                            {u.name}
                          </span>
                          {isSelf && (
                            <span className="badge badge--accent">Tú</span>
                          )}
                        </button>
                        <span className="usr-row-name__sub" title={u.email}>
                          {u.email}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="inline-tags">
                      {u.roles.length === 0 ? (
                        <span className="badge badge--neutral">Sin rol</span>
                      ) : (
                        u.roles.map((r) => (
                          <span key={r.id} className={roleBadgeClass(r.key)}>
                            {r.name}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        u.active ? "badge--green" : "badge--neutral"
                      }`}
                    >
                      {u.active ? "Activo" : "Suspendido"}
                    </span>
                  </td>
                  <td
                    className="dtable__muted"
                    title={mounted ? lastAbs : undefined}
                  >
                    {mounted
                      ? formatRelative(u.lastLoginAt)
                      : formatDateOnly(u.lastLoginAt)}
                  </td>
                  <td
                    className="dtable__muted"
                    title={mounted ? createdAbs : undefined}
                  >
                    {mounted
                      ? formatRelative(u.createdAt)
                      : formatDateOnly(u.createdAt)}
                  </td>
                  <td className="dtable__settings">
                    <div className="usr-kebab">
                      <button
                        className="iconbtn iconbtn--small"
                        onClick={(e) => openKebab(u.id, e.currentTarget)}
                        aria-label="Acciones"
                      >
                        <Icon name="more-vert" size={18} />
                      </button>
                      {openMenuId === u.id && (
                        <div
                          className={`usr-kebab__menu ${
                            menuFlipUp ? "usr-kebab__menu--up" : ""
                          }`}
                        >
                          <button
                            className="usr-kebab__item"
                            onClick={() => {
                              setOpenMenuId(null);
                              setParams({ detail: u.id });
                            }}
                          >
                            <Icon name="user" size={16} />
                            <span>Ver / editar</span>
                          </button>
                          <button
                            className="usr-kebab__item"
                            disabled={!perms.canWrite || isSelf || isMutating}
                            onClick={async () => {
                              setOpenMenuId(null);
                              const res = await runAction(() =>
                                setUserActive(u.id, !u.active),
                              );
                              if (res.ok)
                                pushToast(
                                  "success",
                                  u.active
                                    ? "Usuario suspendido."
                                    : "Usuario activado.",
                                );
                              else pushToast("error", res.error);
                              afterMutation();
                            }}
                          >
                            <Icon name="lock" size={16} />
                            <span>
                              {u.active ? "Suspender" : "Reactivar"}
                            </span>
                          </button>
                          <button
                            className="usr-kebab__item"
                            disabled={!perms.canWrite}
                            onClick={async () => {
                              setOpenMenuId(null);
                              const res = await runAction(() =>
                                revokeUserSessions(u.id),
                              );
                              if (res.ok) {
                                const n = res.data?.count ?? 0;
                                pushToast(
                                  "success",
                                  n === 0
                                    ? "El usuario no tenía sesiones activas."
                                    : `Se cerraron ${n} sesión${n > 1 ? "es" : ""}.`,
                                );
                              } else pushToast("error", res.error);
                              afterMutation();
                            }}
                          >
                            <Icon name="external" size={16} />
                            <span>Cerrar sesiones</span>
                          </button>
                          <div className="usr-kebab__sep" />
                          <button
                            className="usr-kebab__item usr-kebab__item--danger"
                            disabled={!perms.canWrite || isSelf || isMutating}
                            onClick={() => {
                              setOpenMenuId(null);
                              setConfirmDelete(u);
                            }}
                          >
                            <Icon name="trash" size={16} />
                            <span>Eliminar</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr className="dtable__empty">
                <td colSpan={7}>
                  <div className="empty">
                    <Icon name="search" size={32} />
                    <h3>Sin resultados</h3>
                    <p>
                      {hasFilters
                        ? "Ningún usuario coincide con los filtros actuales."
                        : "Aún no hay usuarios en el sistema."}
                    </p>
                    {hasFilters && (
                      <button
                        className="btn btn--ghost"
                        style={{ marginTop: 12 }}
                        onClick={clearFilters}
                      >
                        Borrar filtros y búsqueda
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        <div className="tablefoot">
          <span>
            {filtered.length} de {rows.length} usuarios
          </span>
          <div className="pager">
            <span>Filas por página: 50</span>
            <span style={{ marginLeft: 24 }}>
              1–{filtered.length} de {filtered.length}
            </span>
          </div>
        </div>
      </div>

      {creating && (
        <CreateUserModal
          roles={roles}
          onClose={() => setParams({ new: null })}
          onSubmit={async (input) => {
            const res = await runAction(() => createUser(input));
            if (res.ok) {
              pushToast("success", `Usuario ${input.email} creado.`);
              afterMutation();
            }
            return res;
          }}
        />
      )}

      {detailUser && (
        <UserDetailDrawer
          user={detailUser}
          roles={roles}
          perms={perms}
          isSelf={detailUser.id === currentUserId}
          onClose={() => setParams({ detail: null })}
          onUpdateProfile={async (input) => {
            const res = await runAction(() =>
              updateUserProfile(detailUser.id, input),
            );
            if (res.ok) pushToast("success", "Perfil actualizado.");
            else pushToast("error", res.error);
            afterMutation();
            return res;
          }}
          onToggleActive={async (active) => {
            const res = await runAction(() =>
              setUserActive(detailUser.id, active),
            );
            if (res.ok)
              pushToast(
                "success",
                active ? "Usuario activado." : "Usuario suspendido.",
              );
            else pushToast("error", res.error);
            afterMutation();
            return res;
          }}
          onSetRoles={async (roleIds) => {
            const res = await runAction(() =>
              setUserRoles(detailUser.id, roleIds),
            );
            if (res.ok) pushToast("success", "Roles actualizados.");
            else pushToast("error", res.error);
            afterMutation();
            return res;
          }}
          onSetPassword={async (password) => {
            const res = await runAction(() =>
              setUserPassword(detailUser.id, password),
            );
            if (res.ok) {
              const revoked = res.data?.sessionsRevoked ?? 0;
              pushToast(
                "success",
                revoked > 0
                  ? `Contraseña actualizada. Se cerraron ${revoked} sesión${revoked > 1 ? "es" : ""} activa${revoked > 1 ? "s" : ""}.`
                  : "Contraseña actualizada.",
              );
              afterMutation();
            } else pushToast("error", res.error);
            return res;
          }}
          onRevokeSessions={async () => {
            const res = await runAction(() =>
              revokeUserSessions(detailUser.id),
            );
            if (res.ok) {
              const n = res.data?.count ?? 0;
              pushToast(
                "success",
                n === 0
                  ? "El usuario no tenía sesiones activas."
                  : `Se cerraron ${n} sesión${n > 1 ? "es" : ""}.`,
              );
            } else pushToast("error", res.error);
            afterMutation();
            return res;
          }}
          onDelete={async () => {
            const res = await runAction(() => deleteUser(detailUser.id));
            if (res.ok) {
              pushToast("success", "Usuario eliminado.");
              setParams({ detail: null });
            } else pushToast("error", res.error);
            afterMutation();
            return res;
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Eliminar a ${confirmDelete.name}`}
          description={
            <>
              Esta acción es <b>irreversible</b>. Se eliminarán las sesiones del
              usuario, sus asignaciones de rol y su cuenta.
            </>
          }
          confirmLabel="Eliminar definitivamente"
          tone="danger"
          onConfirm={async () => {
            const res = await runAction(() => deleteUser(confirmDelete.id));
            if (res.ok) pushToast("success", "Usuario eliminado.");
            else pushToast("error", res.error);
            setConfirmDelete(null);
            afterMutation();
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      {confirmBulkDelete && (
        <ConfirmDialog
          title={`Eliminar ${selected.size} usuario${
            selected.size > 1 ? "s" : ""
          }`}
          description={
            <>
              Se eliminarán todas las cuentas seleccionadas. Tu propia cuenta se
              omitirá automáticamente. Esta acción no se puede deshacer.
            </>
          }
          confirmLabel="Eliminar todos"
          tone="danger"
          onConfirm={async () => {
            const res = await runAction(() => bulkDelete([...selected]));
            if (res.ok) {
              pushToast(
                "success",
                `Se eliminaron ${res.data?.count ?? 0} usuario(s).`,
              );
              if ((res.data?.skippedSupers ?? 0) > 0) {
                pushToast(
                  "error",
                  `Se omitieron ${res.data?.skippedSupers} superadministrador(es).`,
                );
              }
            } else pushToast("error", res.error);
            setSelected(new Set());
            setConfirmBulkDelete(false);
            afterMutation();
          }}
          onClose={() => setConfirmBulkDelete(false)}
        />
      )}

      <Toasts items={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function SortableTh({
  label,
  k,
  sortKey,
  sortDir,
  onToggle,
}: {
  label: ReactNode;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggle: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  const iconName = active
    ? sortDir === "asc"
      ? "sort-asc"
      : "sort-desc"
    : "sort-asc";
  return (
    <th>
      <button
        className={`sorthdr ${active ? "is-active" : ""}`}
        onClick={() => onToggle(k)}
      >
        <span>{label}</span>
        <span className="sorthdr__icon">
          <Icon name={iconName} size={14} />
        </span>
      </button>
    </th>
  );
}
