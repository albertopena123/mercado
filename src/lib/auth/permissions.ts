// Single source of truth for all permission keys in the app.
// Used by the seed AND by ui/server-side checks.
//
// Cada categoría DEBE corresponder a un módulo real (UI o API).
// - "Usuarios"          → /usuarios
// - "Roles"             → /roles
// - "Padrón de socios"  → /socios

export type PermissionDef = {
  key: string;
  name: string;
  description: string;
  category: string;
};

export const PERMISSIONS: PermissionDef[] = [
  {
    key: "users.read",
    name: "Ver usuarios",
    description: "Listar y consultar usuarios del sistema",
    category: "Usuarios",
  },
  {
    key: "users.write",
    name: "Gestionar usuarios",
    description: "Crear, editar y eliminar usuarios",
    category: "Usuarios",
  },
  {
    key: "users.assign-roles",
    name: "Asignar roles",
    description: "Cambiar los roles asignados a un usuario",
    category: "Usuarios",
  },
  {
    key: "roles.read",
    name: "Ver roles",
    description: "Consultar roles y permisos",
    category: "Roles",
  },
  {
    key: "roles.write",
    name: "Gestionar roles",
    description: "Crear, editar y eliminar roles personalizados",
    category: "Roles",
  },
  {
    key: "socios.read",
    name: "Ver padrón de socios",
    description: "Listar y consultar socios del mercado",
    category: "Padrón de socios",
  },
  {
    key: "socios.write",
    name: "Gestionar socios",
    description: "Crear, editar y subir adjuntos de socios",
    category: "Padrón de socios",
  },
  {
    key: "socios.delete",
    name: "Eliminar socios",
    description: "Eliminar socios del padrón (casos excepcionales)",
    category: "Padrón de socios",
  },
  {
    key: "socios.change-state",
    name: "Cambiar estado del socio",
    description:
      "Activar, suspender, retirar o marcar como fallecido a un socio",
    category: "Padrón de socios",
  },
  {
    key: "puestos.read",
    name: "Ver puestos",
    description: "Listar y consultar los puestos del mercado",
    category: "Puestos",
  },
  {
    key: "puestos.write",
    name: "Gestionar puestos",
    description: "Crear y editar puestos",
    category: "Puestos",
  },
  {
    key: "puestos.delete",
    name: "Eliminar puestos",
    description: "Eliminar puestos del catálogo",
    category: "Puestos",
  },
  {
    key: "puestos.assign",
    name: "Asignar puestos",
    description: "Asignar o desasignar un puesto a un socio",
    category: "Puestos",
  },
  {
    key: "asambleas.read",
    name: "Ver asambleas",
    description: "Listar y consultar asambleas y su asistencia",
    category: "Asambleas",
  },
  {
    key: "asambleas.write",
    name: "Gestionar asambleas",
    description: "Crear y editar asambleas",
    category: "Asambleas",
  },
  {
    key: "asambleas.delete",
    name: "Eliminar asambleas",
    description: "Eliminar asambleas",
    category: "Asambleas",
  },
  {
    key: "asambleas.attendance",
    name: "Tomar asistencia",
    description: "Registrar la asistencia de los socios en una asamblea",
    category: "Asambleas",
  },
  {
    key: "cuotas.read",
    name: "Ver cuotas y deuda",
    description: "Consultar las cuotas y la deuda de los socios",
    category: "Cuotas",
  },
  {
    key: "cuotas.write",
    name: "Gestionar cuotas",
    description: "Generar cuotas por periodo y anularlas",
    category: "Cuotas",
  },
  {
    key: "cuotas.pay",
    name: "Registrar pagos",
    description: "Registrar el pago de una cuota",
    category: "Cuotas",
  },
];

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const ROLE_DEFS = [
  {
    key: "superadmin",
    name: "Superadministrador",
    description: "Acceso total al sistema. No editable.",
    system: true,
    permissions: PERMISSIONS.map((p) => p.key),
  },
  {
    key: "admin",
    name: "Administrador",
    description:
      "Gestiona usuarios, roles y el padrón de socios del mercado.",
    system: true,
    permissions: [
      "users.read",
      "users.write",
      "users.assign-roles",
      "roles.read",
      "socios.read",
      "socios.write",
      "socios.change-state",
      "puestos.read",
      "puestos.write",
      "puestos.assign",
      "asambleas.read",
      "asambleas.write",
      "asambleas.attendance",
      "cuotas.read",
      "cuotas.write",
      "cuotas.pay",
    ],
  },
  {
    key: "editor",
    name: "Editor",
    description: "Consulta usuarios y roles del sistema.",
    system: true,
    permissions: ["users.read", "roles.read"],
  },
  {
    key: "viewer",
    name: "Consulta",
    description:
      "Solo lectura sobre usuarios, roles, padrón, puestos y asambleas.",
    system: true,
    permissions: [
      "users.read",
      "roles.read",
      "socios.read",
      "puestos.read",
      "asambleas.read",
      "cuotas.read",
    ],
  },
  {
    key: "reporter",
    name: "Reportante",
    description:
      "Rol reservado para uso futuro (portal del socio).",
    system: true,
    permissions: [],
  },
] as const;
