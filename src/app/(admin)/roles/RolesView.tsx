"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/admin/Icon";
import { avatarColor, initialsFor } from "@/lib/ui/avatar";
import { formatDateOnly, formatFullDate } from "@/lib/ui/dates";
import { ConfirmDialog } from "../usuarios/ConfirmDialog";
import { Toasts, type Toast } from "../usuarios/Toasts";
import {
  createRole,
  deleteRole,
  removeUserFromRole,
  setRolePermissions,
  updateRole,
} from "./actions";
import { CreateRoleModal } from "./CreateRoleModal";
import { categoryIcon } from "./category-icons";
import type {
  AvailablePermission,
  PermFlags,
  RoleRow,
} from "./types";
import "./roles.css";

type Tab = "permisos" | "usuarios" | "detalles";
type ListFilter = "all" | "system" | "custom";

type Props = {
  rows: RoleRow[];
  available: AvailablePermission[];
  totalUsers: number;
  perms: PermFlags;
};

export function RolesView({ rows, available, totalUsers, perms }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // URL state
  const roleId = params.get("role");
  const tab: Tab =
    (params.get("tab") as Tab) === "usuarios"
      ? "usuarios"
      : (params.get("tab") as Tab) === "detalles"
        ? "detalles"
        : "permisos";

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

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ListFilter>("all");
  const [permSearch, setPermSearch] = useState("");

  type CreateInitial = {
    name?: string;
    key?: string;
    description?: string;
    permissionKeys?: string[];
    title?: string;
    subtitle?: string;
  };
  const [creating, setCreating] = useState<false | CreateInitial>(false);
  const [deletingRole, setDeletingRole] = useState<RoleRow | null>(null);
  const [removingUser, setRemovingUser] = useState<{
    role: RoleRow;
    userId: string;
    userName: string;
  } | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [busy, setBusy] = useState(false);

  // Inline permission editing state
  const [pendingPerms, setPendingPerms] = useState<Set<string> | null>(null);
  const isEditingPerms = pendingPerms !== null;

  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((kind: Toast["kind"], message: string) => {
    setToasts((t) => [...t, { id: Date.now() + Math.random(), kind, message }]);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  // Mounted gate for hydration-safe date rendering
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Filter + search the list
  const filtered = useMemo(() => {
    let out = rows;
    if (filter === "system") out = out.filter((r) => r.system);
    else if (filter === "custom") out = out.filter((r) => !r.system);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      out = out.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.key.toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [rows, search, filter]);

  // Resolve the active role; prefer the URL param, fallback to first.
  const active = useMemo(() => {
    if (roleId) {
      const found = rows.find((r) => r.id === roleId);
      if (found) return found;
    }
    return filtered[0] ?? rows[0] ?? null;
  }, [roleId, rows, filtered]);

  // Reset inline edits when switching role
  useEffect(() => {
    setPendingPerms(null);
    setEditingMeta(false);
    setPermSearch("");
  }, [active?.id]);

  // Sync draft meta with active role
  useEffect(() => {
    if (active) {
      setDraftName(active.name);
      setDraftDesc(active.description ?? "");
    }
  }, [active?.id, active?.name, active?.description]);

  const totals = useMemo(
    () => ({
      total: rows.length,
      system: rows.filter((r) => r.system).length,
      custom: rows.filter((r) => !r.system).length,
    }),
    [rows],
  );

  // Group available permissions by category for the editor view
  const groupedAvailable = useMemo(() => {
    const map = new Map<string, AvailablePermission[]>();
    for (const p of available) {
      const arr = map.get(p.category) ?? [];
      arr.push(p);
      map.set(p.category, arr);
    }
    return [...map.entries()].map(([category, items]) => ({
      category,
      items: items.sort((a, b) => a.name.localeCompare(b.name, "es")),
    }));
  }, [available]);

  // Filter permissions by search term (in editor or view mode)
  const filterPerm = useCallback(
    (p: AvailablePermission) => {
      const q = permSearch.toLowerCase().trim();
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.key.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    },
    [permSearch],
  );

  // Which permission keys are currently granted (either committed or pending)
  const activeGranted = useMemo(() => {
    if (!active) return new Set<string>();
    if (pendingPerms) return pendingPerms;
    return new Set(active.permissions.map((p) => p.key));
  }, [active, pendingPerms]);

  // Track which system role already got the "duplicate first" warning so we
  // don't spam the toast stack when the user clicks multiple read-only perms.
  const systemWarningShownFor = useRef<string | null>(null);
  useEffect(() => {
    systemWarningShownFor.current = null;
  }, [active?.id]);

  const warnSystemReadonly = useCallback(() => {
    if (!active || systemWarningShownFor.current === active.id) return;
    systemWarningShownFor.current = active.id;
    pushToast(
      "error",
      `"${active.name}" es un rol del sistema. Duplícalo para editar permisos.`,
    );
  }, [active, pushToast]);

  const togglePerm = (key: string) => {
    if (!active) return;
    if (active.system) {
      warnSystemReadonly();
      return;
    }
    setPendingPerms((prev) => {
      const current = prev ?? new Set(active.permissions.map((p) => p.key));
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleCategory = (cat: string) => {
    if (!active) return;
    if (active.system) {
      warnSystemReadonly();
      return;
    }
    const items = groupedAvailable.find((g) => g.category === cat)?.items ?? [];
    const visibleItems = items.filter(filterPerm);
    if (visibleItems.length === 0) return;
    const allSelected = visibleItems.every((p) => activeGranted.has(p.key));
    setPendingPerms((prev) => {
      const current = prev ?? new Set(active.permissions.map((p) => p.key));
      const next = new Set(current);
      visibleItems.forEach((p) => {
        if (allSelected) next.delete(p.key);
        else next.add(p.key);
      });
      return next;
    });
  };

  const savePerms = async () => {
    if (!active || !pendingPerms || busy) return;
    setBusy(true);
    const res = await setRolePermissions(active.id, [...pendingPerms]);
    setBusy(false);
    if (res.ok) {
      pushToast("success", "Permisos actualizados.");
      setPendingPerms(null);
      startTransition(() => router.refresh());
    } else {
      pushToast("error", res.error);
    }
  };

  const cancelPerms = () => setPendingPerms(null);

  const saveMeta = async () => {
    if (!active || busy) return;
    if (draftName.trim() === active.name && draftDesc.trim() === (active.description ?? "")) {
      setEditingMeta(false);
      return;
    }
    setBusy(true);
    const res = await updateRole(active.id, {
      name: draftName.trim(),
      description: draftDesc.trim(),
    });
    setBusy(false);
    if (res.ok) {
      pushToast("success", "Rol actualizado.");
      setEditingMeta(false);
      startTransition(() => router.refresh());
    } else {
      pushToast("error", res.error);
    }
  };

  const onCreateSubmit = async (input: {
    name: string;
    key: string;
    description: string;
    permissionKeys: string[];
  }) => {
    const res = await createRole(input);
    if (res.ok) {
      pushToast("success", `Rol "${input.name}" creado.`);
      // Select the new role
      setParams({ role: res.data?.id ?? null });
      startTransition(() => router.refresh());
    }
    return res;
  };

  const confirmDeleteRole = async () => {
    if (!deletingRole) return;
    setBusy(true);
    const res = await deleteRole(deletingRole.id);
    setBusy(false);
    if (res.ok) {
      pushToast("success", `Rol "${deletingRole.name}" eliminado.`);
      setDeletingRole(null);
      setParams({ role: null });
      startTransition(() => router.refresh());
    } else {
      pushToast("error", res.error);
    }
  };

  const confirmRemoveUser = async () => {
    if (!removingUser) return;
    setBusy(true);
    const res = await removeUserFromRole(
      removingUser.role.id,
      removingUser.userId,
    );
    setBusy(false);
    if (res.ok) {
      pushToast(
        "success",
        `${removingUser.userName} ya no tiene este rol.`,
      );
      setRemovingUser(null);
      startTransition(() => router.refresh());
    } else {
      pushToast("error", res.error);
    }
  };

  const canEdit = perms.canWrite && active && !active.system;
  const hasNoCustomRoles = rows.filter((r) => !r.system).length === 0;

  const onDuplicate = () => {
    if (!active || !perms.canWrite) return;
    setCreating({
      name: `Copia de ${active.name}`,
      key: `${active.key}-copia`,
      description: active.description ?? "",
      permissionKeys: active.permissions.map((p) => p.key),
      title: "Duplicar rol como personalizado",
      subtitle: `Se creará un nuevo rol personalizado con los mismos permisos que "${active.name}". Podrás editar nombre, identificador y permisos antes de guardar.`,
    });
  };

  return (
    <div className="page">
      <div className="page__head">
        <div className="page__title">
          <h1>Roles administrativos</h1>
          <span className="page__sub">
            {totals.total} rol{totals.total !== 1 ? "es" : ""} ·{" "}
            {totals.system} del sistema · {totals.custom} personalizado
            {totals.custom !== 1 ? "s" : ""} · {totalUsers} usuario
            {totalUsers !== 1 ? "s" : ""}
            {(isPending || busy) && (
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
            onClick={() => setCreating({})}
          >
            <Icon name="plus" size={16} />
            <span>Crear rol</span>
          </button>
        </div>
      </div>

      {hasNoCustomRoles && perms.canWrite && (
        <div className="banner" style={{ marginBottom: 16 }}>
          <Icon name="info" size={16} className="banner__icon" />
          <p>
            <b>Aún no tienes roles personalizados.</b> Los roles del sistema
            (Administrador, Editor, Consulta, etc.) no se pueden modificar.
            Para asignar permisos específicos a un equipo,{" "}
            <button
              type="button"
              className="linkbtn"
              onClick={() => setCreating({})}
              style={{ padding: "0 4px", verticalAlign: "baseline" }}
            >
              crea un rol personalizado
            </button>{" "}
            o duplica uno del sistema desde la barra de acciones.
          </p>
        </div>
      )}

      <div className="roles">
        {/* ─────────────── LEFT LIST ─────────────── */}
        <div className="roles__list">
          <div className="roles__list-search">
            <Icon name="search" size={16} />
            <input
              type="text"
              placeholder="Buscar rol…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                aria-label="Limpiar"
                onClick={() => setSearch("")}
                className="iconbtn iconbtn--small"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

          <div className="roles__list-filters">
            {(["all", "system", "custom"] as const).map((f) => (
              <button
                key={f}
                className={`usr-filter ${filter === f ? "is-on" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "all"
                  ? `Todos · ${totals.total}`
                  : f === "system"
                    ? `Sistema · ${totals.system}`
                    : `Personalizados · ${totals.custom}`}
              </button>
            ))}
          </div>

          <div className="roles__list-items">
            {filtered.map((r) => (
              <button
                key={r.id}
                className={`roles__list-item ${
                  r.id === active?.id ? "is-active" : ""
                }`}
                onClick={() => setParams({ role: r.id })}
              >
                <span
                  className="roles__list-item-icon"
                  style={{
                    background: r.system
                      ? "var(--accent-soft)"
                      : "var(--bg-sunken)",
                    color: r.system ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  <Icon name="shield" size={16} />
                </span>
                <div className="roles__list-item-body">
                  <span className="roles__list-item-name">
                    {r.name}
                    {r.system && (
                      <span className="badge badge--neutral">Sistema</span>
                    )}
                  </span>
                  <span className="roles__list-item-meta">
                    {r.userCount} usuario{r.userCount !== 1 ? "s" : ""} ·{" "}
                    {r.permissions.length} permiso
                    {r.permissions.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <Icon
                  name="chevron-right"
                  size={16}
                  className="roles__list-item-chev"
                />
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="empty" style={{ padding: 24 }}>
                <Icon name="search" size={28} />
                <h3 style={{ fontSize: 14 }}>Sin coincidencias</h3>
                <p style={{ fontSize: 12.5 }}>
                  Ningún rol coincide con la búsqueda o el filtro.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ─────────────── RIGHT DETAIL ─────────────── */}
        <div className="roles__detail">
          {active ? (
            <>
              <div className="roles__detail-head">
                <div style={{ minWidth: 0, flex: 1 }}>
                  {editingMeta ? (
                    <div className="roles__edit-meta">
                      <input
                        type="text"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        className="roles__edit-name"
                        autoFocus
                      />
                      <textarea
                        value={draftDesc}
                        onChange={(e) => setDraftDesc(e.target.value)}
                        placeholder="Descripción"
                        rows={2}
                        className="roles__edit-desc"
                        maxLength={200}
                      />
                    </div>
                  ) : (
                    <>
                      <h2>
                        {active.name}
                        {active.system && (
                          <span
                            className="badge badge--neutral"
                            style={{ marginLeft: 12, verticalAlign: "middle" }}
                          >
                            Sistema
                          </span>
                        )}
                      </h2>
                      <p className="roles__detail-desc">
                        {active.description ?? "Sin descripción."}
                      </p>
                    </>
                  )}
                </div>
                <div className="roles__detail-actions">
                  {editingMeta ? (
                    <>
                      <button
                        className="btn btn--ghost"
                        onClick={() => {
                          setEditingMeta(false);
                          setDraftName(active.name);
                          setDraftDesc(active.description ?? "");
                        }}
                        disabled={busy}
                      >
                        Cancelar
                      </button>
                      <button
                        className="btn btn--primary"
                        onClick={saveMeta}
                        disabled={busy || draftName.trim().length < 2}
                      >
                        {busy ? "Guardando…" : "Guardar"}
                      </button>
                    </>
                  ) : (
                    <>
                      {active.system && perms.canWrite && (
                        <button
                          className="btn btn--ghost"
                          onClick={onDuplicate}
                          title="Crear un rol personalizado con los mismos permisos"
                        >
                          <Icon name="external" size={14} />
                          Duplicar
                        </button>
                      )}
                      <button
                        className="btn btn--ghost"
                        onClick={() => setEditingMeta(true)}
                        disabled={!canEdit || isEditingPerms}
                        title={
                          active.system
                            ? "Los roles del sistema no se pueden modificar"
                            : !perms.canWrite
                              ? "Necesitas el permiso roles.write"
                              : undefined
                        }
                      >
                        Editar
                      </button>
                      <button
                        className="btn btn--ghost"
                        style={{ color: "#b91c1c" }}
                        onClick={() => setDeletingRole(active)}
                        disabled={!canEdit || active.userCount > 0}
                        title={
                          active.system
                            ? "Los roles del sistema no se pueden eliminar"
                            : active.userCount > 0
                              ? "Reasigna a los usuarios antes de eliminar"
                              : undefined
                        }
                      >
                        Eliminar
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* TABS */}
              <div className="usr-drawer-tabs roles-tabs">
                <button
                  className={`usr-drawer-tab ${tab === "permisos" ? "is-active" : ""}`}
                  onClick={() => setParams({ tab: null })}
                >
                  Permisos
                  <span className="roles-tabs__count">
                    {active.permissions.length}
                  </span>
                </button>
                <button
                  className={`usr-drawer-tab ${tab === "usuarios" ? "is-active" : ""}`}
                  onClick={() => setParams({ tab: "usuarios" })}
                >
                  Usuarios
                  <span className="roles-tabs__count">{active.userCount}</span>
                </button>
                <button
                  className={`usr-drawer-tab ${tab === "detalles" ? "is-active" : ""}`}
                  onClick={() => setParams({ tab: "detalles" })}
                >
                  Detalles
                </button>
              </div>

              {/* PERMISSIONS TAB */}
              {tab === "permisos" && (
                <div className="roles__tab-body">
                  {active.system && (
                    <div className="banner" style={{ marginBottom: 16 }}>
                      <Icon
                        name="info"
                        size={16}
                        className="banner__icon"
                      />
                      <p>
                        Este es un rol del sistema. Sus permisos no se pueden
                        modificar desde la interfaz.
                        {perms.canWrite && (
                          <>
                            {" "}
                            <button
                              type="button"
                              className="linkbtn"
                              onClick={onDuplicate}
                              style={{ padding: "0 4px", verticalAlign: "baseline" }}
                            >
                              Duplicar como personalizado
                            </button>{" "}
                            para crear una versión editable.
                          </>
                        )}
                      </p>
                    </div>
                  )}

                  <div className="roles__perm-toolbar">
                    <div className="roles__list-search" style={{ flex: 1 }}>
                      <Icon name="search" size={16} />
                      <input
                        type="text"
                        placeholder="Buscar permiso…"
                        value={permSearch}
                        onChange={(e) => setPermSearch(e.target.value)}
                      />
                      {permSearch && (
                        <button
                          aria-label="Limpiar"
                          onClick={() => setPermSearch("")}
                          className="iconbtn iconbtn--small"
                        >
                          <Icon name="close" size={14} />
                        </button>
                      )}
                    </div>
                    <span className="roles__perm-count">
                      {activeGranted.size} / {available.length}
                    </span>
                  </div>

                  {groupedAvailable.map(({ category, items }) => {
                    const visible = items.filter(filterPerm);
                    if (visible.length === 0) return null;
                    const grantedInCat = visible.filter((p) =>
                      activeGranted.has(p.key),
                    ).length;
                    const allInCat = visible.every((p) =>
                      activeGranted.has(p.key),
                    );
                    return (
                      <div key={category} className="roles-perm-cat">
                        <div className="roles-perm-cat__hd">
                          <button
                            type="button"
                            className="roles-perm-cat__toggle"
                            onClick={() => toggleCategory(category)}
                            disabled={active.system || !perms.canWrite}
                          >
                            <span
                              className={`checkbox__box ${
                                allInCat
                                  ? "is-on"
                                  : grantedInCat > 0
                                    ? "is-mixed"
                                    : ""
                              }`}
                            >
                              {allInCat && <Icon name="check" size={14} />}
                              {!allInCat && grantedInCat > 0 && (
                                <span className="checkbox__dash" />
                              )}
                            </span>
                            <Icon
                              name={categoryIcon(category)}
                              size={16}
                            />
                            <span>{category}</span>
                            <span className="roles-perm-cat__count">
                              {grantedInCat}/{visible.length}
                            </span>
                          </button>
                        </div>
                        <ul className="roles-perm-cat__list">
                          {visible.map((p) => {
                            const isOn = activeGranted.has(p.key);
                            return (
                              <li
                                key={p.key}
                                className={`roles-perm-cat__item ${
                                  isOn ? "is-on" : ""
                                } ${active.system ? "is-readonly" : ""}`}
                                onClick={() => togglePerm(p.key)}
                              >
                                <span
                                  className={`checkbox__box ${isOn ? "is-on" : ""}`}
                                >
                                  {isOn && <Icon name="check" size={14} />}
                                </span>
                                <div className="roles-perm-cat__item-body">
                                  <div className="roles-perm-cat__item-name">
                                    {p.name}
                                    <code>{p.key}</code>
                                  </div>
                                  {p.description && (
                                    <div className="roles-perm-cat__item-desc">
                                      {p.description}
                                    </div>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* USERS TAB */}
              {tab === "usuarios" && (
                <div className="roles__tab-body">
                  {active.users.length === 0 ? (
                    <div className="empty">
                      <Icon name="users" size={32} />
                      <h3>Sin usuarios asignados</h3>
                      <p>
                        Aún ningún usuario tiene este rol.{" "}
                        <a href="/usuarios" className="linkbtn linkbtn--primary">
                          Ir a usuarios
                        </a>{" "}
                        para asignarlo.
                      </p>
                    </div>
                  ) : (
                    <ul className="roles__users">
                      {active.users.map((u) => (
                        <li key={u.id} className="roles__user-row">
                          <span
                            className="usr-avatar"
                            style={{ background: avatarColor(u.id) }}
                          >
                            {initialsFor(u.name)}
                          </span>
                          <div className="roles__user-info">
                            <div className="roles__user-name">
                              <a
                                href={`/usuarios?detail=${u.id}`}
                                className="rowlink"
                              >
                                {u.name}
                              </a>
                              {!u.active && (
                                <span className="badge badge--neutral">
                                  Suspendido
                                </span>
                              )}
                            </div>
                            <div className="roles__user-email">{u.email}</div>
                          </div>
                          <button
                            className="linkbtn"
                            disabled={
                              !perms.canAssignRoles ||
                              active.key === "superadmin"
                            }
                            onClick={() =>
                              setRemovingUser({
                                role: active,
                                userId: u.id,
                                userName: u.name,
                              })
                            }
                          >
                            Quitar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* DETAILS TAB */}
              {tab === "detalles" && (
                <div className="roles__tab-body">
                  <dl className="roles__detail-meta">
                    <div>
                      <dt>Identificador</dt>
                      <dd>
                        <code>{active.key}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Tipo</dt>
                      <dd>{active.system ? "Sistema" : "Personalizado"}</dd>
                    </div>
                    <div>
                      <dt>Usuarios</dt>
                      <dd>{active.userCount}</dd>
                    </div>
                    <div>
                      <dt>Permisos</dt>
                      <dd>{active.permissions.length}</dd>
                    </div>
                    <div>
                      <dt>Creado</dt>
                      <dd>
                        {mounted
                          ? formatFullDate(active.createdAt)
                          : formatDateOnly(active.createdAt)}
                      </dd>
                    </div>
                    <div>
                      <dt>Última actualización</dt>
                      <dd>
                        {mounted
                          ? formatFullDate(active.updatedAt)
                          : formatDateOnly(active.updatedAt)}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </>
          ) : (
            <div className="empty">
              <Icon name="shield" size={36} />
              <h3>Selecciona un rol</h3>
              <p>Elige un rol de la lista para ver sus permisos.</p>
            </div>
          )}
        </div>
      </div>

      {/* Sticky save bar when editing permissions */}
      {isEditingPerms && (
        <div className="roles__savebar">
          <span>
            <Icon name="info" size={16} />
            Cambios sin guardar en los permisos
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn--ghost"
              onClick={cancelPerms}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              className="btn btn--primary"
              onClick={savePerms}
              disabled={busy}
            >
              {busy ? "Guardando…" : "Guardar permisos"}
            </button>
          </div>
        </div>
      )}

      {creating && (
        <CreateRoleModal
          available={available}
          initial={creating}
          onClose={() => setCreating(false)}
          onSubmit={onCreateSubmit}
        />
      )}

      {deletingRole && (
        <ConfirmDialog
          title={`Eliminar rol "${deletingRole.name}"`}
          description={
            <>
              Esta acción es <b>irreversible</b>. El rol y sus asignaciones de
              permisos se eliminarán definitivamente.
            </>
          }
          confirmLabel="Eliminar rol"
          tone="danger"
          busy={busy}
          onConfirm={confirmDeleteRole}
          onClose={() => setDeletingRole(null)}
        />
      )}

      {removingUser && (
        <ConfirmDialog
          title={`Quitar el rol a ${removingUser.userName}`}
          description={
            <>
              El usuario perderá el rol{" "}
              <b>{removingUser.role.name}</b> y todos sus permisos asociados,
              salvo los que reciba por otros roles.
            </>
          }
          confirmLabel="Quitar rol"
          tone="danger"
          busy={busy}
          onConfirm={confirmRemoveUser}
          onClose={() => setRemovingUser(null)}
        />
      )}

      <Toasts items={toasts} onDismiss={dismissToast} />
    </div>
  );
}
