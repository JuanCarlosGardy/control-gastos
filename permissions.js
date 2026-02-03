// permissions.js (ESM)
// Módulo aislado: roles y permisos. No toca Firebase ni el DOM.

// Roles disponibles (puedes ampliarlos)
export const ROLES = Object.freeze({
  ADMIN: "admin",
  EDITOR: "editor",
  VIEWER: "viewer",
  NONE: "none",
});

// Acciones “lógicas” que luego conectaremos a botones/inputs
export const ACTIONS = Object.freeze({
  READ: "read",
  WRITE: "write",
  DELETE: "delete",
  EXPORT: "export",
  ADMIN_PANEL: "adminPanel",
});

// Matriz de permisos por rol
const PERMISSIONS = Object.freeze({
  [ROLES.ADMIN]: new Set([
    ACTIONS.READ,
    ACTIONS.WRITE,
    ACTIONS.DELETE,
    ACTIONS.EXPORT,
    ACTIONS.ADMIN_PANEL,
  ]),
  [ROLES.EDITOR]: new Set([
    ACTIONS.READ,
    ACTIONS.WRITE,
    ACTIONS.EXPORT,
  ]),
  [ROLES.VIEWER]: new Set([
    ACTIONS.READ,
  ]),
  [ROLES.NONE]: new Set([]),
});

/**
 * Devuelve rol a partir del email.
 * - adminEmail: string (tu ADMIN_EMAIL actual)
 * - allowedEmails: array/string[] (tu ALLOWED_EMAILS actual)
 * - editorsEmails/viewersEmails: opcional para control fino
 */
export function getUserRole(email, {
  adminEmail,
  allowedEmails = [],
  editorsEmails = [],
  viewersEmails = [],
} = {}) {
  if (!email) return ROLES.NONE;

  const e = String(email).toLowerCase().trim();
  const admin = String(adminEmail || "").toLowerCase().trim();

  if (admin && e === admin) return ROLES.ADMIN;

  // Si ya tienes whitelist general, se respeta como “mínimo acceso”
  const allowed = new Set((allowedEmails || []).map(x => String(x).toLowerCase().trim()));
  if (allowed.size && !allowed.has(e)) return ROLES.NONE;

  // Si no defines listas finas, por defecto “editor” para allowed
  const editors = new Set((editorsEmails || []).map(x => String(x).toLowerCase().trim()));
  const viewers = new Set((viewersEmails || []).map(x => String(x).toLowerCase().trim()));

  if (editors.has(e)) return ROLES.EDITOR;
  if (viewers.has(e)) return ROLES.VIEWER;

  // Por defecto, si está en allowed y no está clasificado: editor
  if (allowed.size && allowed.has(e)) return ROLES.EDITOR;

  // Si no hay whitelist (caso raro en tu proyecto), rol mínimo
  return ROLES.VIEWER;
}

export function can(role, action) {
  const r = role || ROLES.NONE;
  const perms = PERMISSIONS[r] || PERMISSIONS[ROLES.NONE];
  return perms.has(action);
}

/**
 * Utilidad: valida si un email está permitido por whitelist.
 * Devuelve true/false sin lanzar errores.
 */
export function isAllowedEmail(email, allowedEmails = []) {
  if (!email) return false;
  const e = String(email).toLowerCase().trim();
  const allowed = new Set((allowedEmails || []).map(x => String(x).toLowerCase().trim()));
  return allowed.size ? allowed.has(e) : false;
}
