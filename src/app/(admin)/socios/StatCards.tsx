"use client";

import type { EstadoSocio } from "@/generated/prisma/client";
import type { SocioStats } from "./types";

type CardDef = {
  key: "total" | EstadoSocio;
  label: string;
  tone: "accent" | "green" | "amber" | "neutral" | "red";
};

const CARDS: CardDef[] = [
  { key: "total", label: "Total socios", tone: "accent" },
  { key: "activo", label: "Activos", tone: "green" },
  { key: "suspendido", label: "Suspendidos", tone: "amber" },
  { key: "retirado", label: "Retirados", tone: "neutral" },
  { key: "fallecido", label: "Fallecidos", tone: "red" },
];

export function StatCards({
  stats,
  activeEstado,
  onPick,
}: {
  stats: SocioStats;
  activeEstado?: EstadoSocio;
  onPick: (estado?: EstadoSocio) => void;
}) {
  return (
    <div className="soc-stats">
      {CARDS.map((c) => {
        const value = stats[c.key];
        const isActive =
          c.key === "total" ? !activeEstado : activeEstado === c.key;
        return (
          <button
            key={c.key}
            type="button"
            className={`soc-stat soc-stat--${c.tone} ${
              isActive ? "is-active" : ""
            }`}
            onClick={() =>
              onPick(c.key === "total" ? undefined : (c.key as EstadoSocio))
            }
            aria-pressed={isActive}
          >
            <span className="soc-stat__dot" aria-hidden />
            <span className="soc-stat__body">
              <span className="soc-stat__value">{value}</span>
              <span className="soc-stat__label">{c.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
