"use client";

import type { RoleOption } from "./types";

type Props = {
  roles: RoleOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

export function RolePicker({
  roles,
  selected,
  onChange,
  disabled = false,
}: Props) {
  const toggle = (id: string) => {
    if (disabled) return;
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };

  return (
    <div className="role-picker">
      {roles.map((r) => {
        const on = selected.includes(r.id);
        return (
          <label
            key={r.id}
            className={`role-picker__opt ${on ? "is-on" : ""}`}
            style={{ opacity: disabled ? 0.6 : 1 }}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => toggle(r.id)}
              disabled={disabled}
            />
            <div>
              <div className="role-picker__name">
                {r.name}
                {r.system && (
                  <span
                    className="badge badge--neutral"
                    style={{ marginLeft: 8, verticalAlign: "middle" }}
                  >
                    Sistema
                  </span>
                )}
              </div>
              {r.description && (
                <div className="role-picker__desc">{r.description}</div>
              )}
            </div>
            <code style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {r.key}
            </code>
          </label>
        );
      })}
      {roles.length === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          No hay roles disponibles.
        </p>
      )}
    </div>
  );
}
