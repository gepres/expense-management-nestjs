/**
 * Allowlist de eventos de analítica de flujos.
 *
 * Solo estos nombres se aceptan en `track()`. Los `view.*` / `nav.session.*`
 * de navegación NO van aquí: se validan en el endpoint `session-end` (rutas
 * dinámicas con su propia allowlist `KNOWN_ROUTES`).
 */

/** Eventos emitidos por el backend (bot, cron, mutations, errores). */
export const SERVER_EVENTS = [
  // Bot WhatsApp
  'wsp.inbound',
  'wsp.inbound.text',
  'wsp.inbound.image',
  'wsp.command.welcome',
  'wsp.command.resumen',
  'wsp.command.ayuda',
  'wsp.expense.created',
  'wsp.expense.failed',
  'wsp.parse_failed',
  'wsp.unregistered',
  'wsp.ocr',
  'wsp.linked',
  'wsp.unlinked',
  // Recurrentes
  'rec.gasto.created',
  'rec.gasto.paused',
  'rec.gasto.resumed',
  'rec.gasto.deleted',
  'rec.transf.created',
  'rec.transf.paused',
  'rec.transf.resumed',
  'rec.transf.deleted',
  'rec.cron.success',
  'rec.cron.failed',
  // Otros server
  'expense.create.failed',
  'group.invitation.joined',
  'group.settlement.completed',
  'import.attempted',
  'voice.used',
  'voice.confidence_low',
  'ai.quota_exceeded',
] as const;

/** Eventos emitidos por el cliente (funnels de UI). Beacon allowlist. */
export const CLIENT_EVENTS = [
  'expense.form.opened',
  'expense.form.saved',
  'expense.form.abandoned',
  'expense.form.validation_error',
  'rec.form.opened',
  'rec.form.saved',
  'rec.form.abandoned',
  'receipt.preview.shown',
  'receipt.preview.discarded',
] as const;

export type ServerEvent = (typeof SERVER_EVENTS)[number];
export type ClientEvent = (typeof CLIENT_EVENTS)[number];
export type UsageEventName = ServerEvent | ClientEvent;

/** Todos los eventos válidos para `track()`. */
export const ALLOWED_EVENTS: ReadonlySet<string> = new Set<string>([
  ...SERVER_EVENTS,
  ...CLIENT_EVENTS,
]);

/** Eventos que el cliente puede emitir vía `POST /usage-events/track`. */
export const CLIENT_EVENT_SET: ReadonlySet<string> = new Set<string>(
  CLIENT_EVENTS,
);

/**
 * Rutas normalizadas conocidas para navegación. El cliente envía la clave
 * normalizada (sin IDs); el backend descarta cualquiera que no esté aquí.
 */
export const KNOWN_ROUTES: ReadonlySet<string> = new Set<string>([
  'dashboard',
  'gastos',
  'gastos.detalle',
  'cuentas',
  'cuentas.detalle',
  'presupuestos',
  'programados',
  'compartidos',
  'compartidos.detalle',
  'compras',
  'importar',
  'metricas',
  'asistente',
  'configuracion',
  'admin',
  'otra',
]);
