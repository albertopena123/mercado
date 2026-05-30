"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import { categoryIcon } from "./category-icons";
import type { ActionResult, AvailablePermission } from "./types";

type Props = {
  available: AvailablePermission[];
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    key: string;
    description: string;
    permissionKeys: string[];
  }) => Promise<ActionResult<{ id: string }>>;
  // Optional pre-fill for "Duplicar rol" flow.
  initial?: {
    name?: string;
    key?: string;
    description?: string;
    permissionKeys?: string[];
    title?: string;
    subtitle?: string;
  };
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function CreateRoleModal({
  available,
  onClose,
  onSubmit,
  initial,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [key, setKey] = useState(initial?.key ?? "");
  const [keyDirty, setKeyDirty] = useState(!!initial?.key);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initial?.permissionKeys ?? []),
  );
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});
  const [topError, setTopError] = useState<string | null>(null);

  useEscClose(true, onClose, submitting);

  // Group permissions by category, sorted within category
  const grouped = useMemo(() => {
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

  const valid =
    name.trim().length >= 2 &&
    /^[a-z][a-z0-9-]*[a-z0-9]$/.test(key);

  const togglePerm = (k: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const toggleCategory = (cat: string) => {
    const items = grouped.find((g) => g.category === cat)?.items ?? [];
    const allSelected = items.every((p) => selected.has(p.key));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) items.forEach((p) => next.delete(p.key));
      else items.forEach((p) => next.add(p.key));
      return next;
    });
  };

  const onSubmitForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setTopError(null);
    setFieldErrors({});
    const res = await onSubmit({
      name: name.trim(),
      key: key.trim().toLowerCase(),
      description: description.trim(),
      permissionKeys: [...selected],
    });
    if (!res.ok) {
      setTopError(res.error ?? "No se pudo crear el rol.");
      setFieldErrors(res.fieldErrors ?? {});
      setSubmitting(false);
      return;
    }
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      onClick={() => !submitting && onClose()}
    >
      <form
        className="modal modal--lg"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmitForm}
      >
        <header className="modal__head">
          <div>
            <h2>{initial?.title ?? "Crear rol personalizado"}</h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13.5,
                color: "var(--text-muted)",
              }}
            >
              {initial?.subtitle ??
                "Define un rol con permisos específicos para tu organización."}
            </p>
          </div>
          <button
            type="button"
            className="iconbtn"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar"
          >
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="modal__body">
          {topError && (
            <div
              className="login__error"
              role="alert"
              style={{ marginBottom: 16 }}
            >
              <Icon name="info" size={16} />
              <span>{topError}</span>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
            className="roles-create__grid"
          >
            <label className="field">
              <span className="field__label">
                Nombre del rol<span className="field__req">*</span>
              </span>
              <input
                type="text"
                value={name}
                autoFocus
                onChange={(e) => {
                  setName(e.target.value);
                  if (!keyDirty) setKey(slugify(e.target.value));
                }}
                placeholder="p. ej. Coordinador de accesibilidad"
                aria-invalid={!!fieldErrors.name}
              />
              {fieldErrors.name && (
                <span className="field__err">{fieldErrors.name}</span>
              )}
            </label>

            <label className="field">
              <span className="field__label">
                Identificador<span className="field__req">*</span>
              </span>
              <input
                type="text"
                value={key}
                onChange={(e) => {
                  setKeyDirty(true);
                  setKey(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, "-")
                      .replace(/-+/g, "-"),
                  );
                }}
                placeholder="coordinador-accesibilidad"
                aria-invalid={!!fieldErrors.key}
              />
              {fieldErrors.key && (
                <span className="field__err">{fieldErrors.key}</span>
              )}
            </label>
          </div>

          <label className="field">
            <span className="field__label">Descripción (opcional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Para qué se usa este rol, qué áreas cubre…"
              maxLength={200}
              aria-invalid={!!fieldErrors.description}
            />
            {fieldErrors.description && (
              <span className="field__err">{fieldErrors.description}</span>
            )}
          </label>

          <div className="roles-create__perms-head">
            <div>
              <div className="field__label" style={{ margin: 0 }}>
                Permisos asignados
              </div>
              <div
                style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}
              >
                {selected.size} de {available.length} seleccionados
              </div>
            </div>
            <button
              type="button"
              className="linkbtn"
              onClick={() => setSelected(new Set())}
              disabled={selected.size === 0}
            >
              Limpiar
            </button>
          </div>

          <div className="roles-create__perms">
            {grouped.map(({ category, items }) => {
              const allSel = items.every((p) => selected.has(p.key));
              const someSel = !allSel && items.some((p) => selected.has(p.key));
              return (
                <div key={category} className="roles-perm-cat">
                  <div className="roles-perm-cat__hd">
                    <button
                      type="button"
                      className="roles-perm-cat__toggle"
                      onClick={() => toggleCategory(category)}
                    >
                      <span
                        className={`checkbox__box ${
                          allSel ? "is-on" : someSel ? "is-mixed" : ""
                        }`}
                      >
                        {allSel && <Icon name="check" size={14} />}
                        {someSel && <span className="checkbox__dash" />}
                      </span>
                      <Icon name={categoryIcon(category)} size={16} />
                      <span>{category}</span>
                      <span className="roles-perm-cat__count">
                        {items.filter((p) => selected.has(p.key)).length}/
                        {items.length}
                      </span>
                    </button>
                  </div>
                  <ul className="roles-perm-cat__list">
                    {items.map((p) => {
                      const isOn = selected.has(p.key);
                      return (
                        <li
                          key={p.key}
                          className={`roles-perm-cat__item ${
                            isOn ? "is-on" : ""
                          }`}
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
        </div>

        <footer className="modal__foot">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!valid || submitting}
          >
            {submitting ? "Creando…" : "Crear rol"}
          </button>
        </footer>
      </form>
    </div>
  );
}
