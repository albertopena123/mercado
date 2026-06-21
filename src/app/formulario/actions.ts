"use server";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lookupDniUnamad } from "@/lib/socios/dni-lookup";
import { rateCheck, getClientIp } from "@/lib/rate-limit";

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export type RegistroPublicoInput = {
  numeroDocumento: string;
  nombreCompleto: string;
  telefono: string;
  email?: string;
};

export async function lookupDniPublico(
  dni: string,
): Promise<{ ok: true; nombre: string } | { ok: false; error: string }> {
  const ip = await getClientIp();
  const rl = rateCheck(`pub-dni:${ip}`, 15, 60_000);
  if (!rl.allowed)
    return { ok: false, error: `Demasiadas consultas. Reintenta en ${rl.retryAfter}s.` };

  const clean = (dni ?? "").trim();
  if (!/^\d{8}$/.test(clean))
    return { ok: false, error: "El DNI debe tener 8 dígitos." };

  try {
    const d = await lookupDniUnamad(clean);
    if (!d) return { ok: false, error: "No se encontró el DNI. Escribe tus nombres a mano." };
    const nombre = `${d.apellidoPaterno} ${d.apellidoMaterno}, ${d.nombres}`
      .replace(/\s+/g, " ")
      .replace(/\s+,/, ",")
      .trim();
    return { ok: true, nombre };
  } catch (e) {
    console.error("lookupDniPublico", e);
    return { ok: false, error: "No se pudo consultar el DNI. Escribe tus nombres a mano." };
  }
}

export async function enviarRegistroPublico(
  input: RegistroPublicoInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const ip = await getClientIp();
  const rl = rateCheck(`pub-send:${ip}`, 5, 60_000);
  if (!rl.allowed)
    return { ok: false, error: `Demasiados envíos. Reintenta en ${rl.retryAfter}s.` };

  const fe: Record<string, string> = {};
  const numeroDocumento = (input.numeroDocumento ?? "").trim();
  const nombreCompleto = (input.nombreCompleto ?? "").trim();
  const telefono = (input.telefono ?? "").trim();
  const emailRaw = (input.email ?? "").trim();

  if (!/^\d{8}$/.test(numeroDocumento)) fe.numeroDocumento = "DNI inválido (8 dígitos).";
  if (nombreCompleto.length < 3) fe.nombreCompleto = "Escribe tus apellidos y nombres.";
  if (!/^\d{6,15}$/.test(telefono.replace(/\s/g, ""))) fe.telefono = "Celular inválido.";
  let email: string | null = null;
  if (emailRaw) {
    if (!EMAIL_RE.test(emailRaw.toLowerCase())) fe.email = "Correo no válido.";
    else email = emailRaw.toLowerCase();
  }
  if (Object.keys(fe).length > 0)
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: fe };

  const yaPendiente = await prisma.solicitudRegistroPublico.findFirst({
    where: { numeroDocumento, estado: "pendiente" },
    select: { id: true },
  });
  if (yaPendiente)
    return { ok: false, error: "Ya enviaste tus datos; están en revisión." };

  try {
    await prisma.solicitudRegistroPublico.create({
      data: {
        tipoDocumento: "DNI",
        numeroDocumento,
        nombreCompleto,
        telefono: telefono.replace(/\s/g, ""),
        email,
        ip,
      },
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { ok: false, error: "Ya enviaste tus datos; están en revisión." };
    console.error("enviarRegistroPublico", e);
    return { ok: false, error: "No se pudo enviar. Intenta de nuevo." };
  }
}
