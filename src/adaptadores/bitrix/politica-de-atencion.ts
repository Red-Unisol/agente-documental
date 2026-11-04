// Decide, antes de contestar, si el agente atiende este chat o lo cede a una persona.
// Un bot de Canales Abiertos no puede entrar a una sesión ya abierta (probado: operator.transfer,
// imbot.chat.user.add y crm.chat.user.add lo rechazan), así que el bot entra como bot de bienvenida
// de la línea y acá se decide, mensaje a mensaje, si se queda o se corre en silencio.

export type ModoDeAtencion = "canal" | "asignacion";

export interface ListaBlanca {
  // Teléfono normalizado (sólo dígitos) → negociación de prueba asociada, si la hay.
  telefonos: Map<string, string | undefined>;
}

export interface SituacionDelChat {
  modo: ModoDeAtencion;
  listaBlanca?: ListaBlanca | undefined;
  telefono?: string | undefined;
  // Negociación del chat y quién la tiene asignada; en modo asignación se exige al usuario del agente.
  negociacion?: { id: string; responsableId: number } | undefined;
  usuarioAgente?: number | undefined;
}

export type Decision = { atender: true } | { atender: false; motivo: string; cederA?: number };

const DIGITOS_QUE_IDENTIFICAN = 10;

// "5493510001230, 3514445566:1246803" → teléfonos con su negociación opcional. Vacío = sin lista.
export function leerListaBlanca(texto: string | undefined): ListaBlanca | undefined {
  const entradas = (texto ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (!entradas.length) return undefined;
  const telefonos = new Map<string, string | undefined>();
  for (const entrada of entradas) {
    const [telefono, negociacion] = entrada.split(":");
    const digitos = soloDigitos(telefono ?? "");
    if (digitos) telefonos.set(digitos, negociacion?.trim() || undefined);
  }
  return { telefonos };
}

// CHAT_ENTITY_ID de Canales Abiertos: "conector|línea|idExterno|usuario". En WhatsApp el id
// externo es el número; en el chat web es un hash, y no hay teléfono.
export function telefonoDelChat(chatEntityId: string): string | undefined {
  const [, , idExterno] = chatEntityId.split("|");
  const digitos = soloDigitos(idExterno ?? "");
  return digitos.length >= DIGITOS_QUE_IDENTIFICAN ? digitos : undefined;
}

// Dos números son el mismo si coinciden en sus últimos 10 dígitos: así da igual el 54, el 9 o el 0 de área.
export function mismoTelefono(a: string, b: string): boolean {
  const da = soloDigitos(a).slice(-DIGITOS_QUE_IDENTIFICAN);
  const db = soloDigitos(b).slice(-DIGITOS_QUE_IDENTIFICAN);
  return da.length === DIGITOS_QUE_IDENTIFICAN && da === db;
}

export function entradaDeListaBlanca(lista: ListaBlanca, telefono: string): { telefono: string; negociacionId?: string | undefined } | undefined {
  for (const [registrado, negociacionId] of lista.telefonos) if (mismoTelefono(registrado, telefono)) return { telefono: registrado, negociacionId };
  return undefined;
}

export function decidirAtencion(situacion: SituacionDelChat): Decision {
  if (situacion.listaBlanca) {
    if (!situacion.telefono) return { atender: false, motivo: "hay lista blanca y el chat no tiene teléfono" };
    if (!entradaDeListaBlanca(situacion.listaBlanca, situacion.telefono)) return { atender: false, motivo: "teléfono fuera de la lista blanca" };
  }
  if (situacion.modo === "asignacion") {
    if (!situacion.usuarioAgente) return { atender: false, motivo: "modo asignación sin usuario del agente configurado" };
    if (!situacion.negociacion) return { atender: false, motivo: "modo asignación y el chat no tiene negociación" };
    if (situacion.negociacion.responsableId !== situacion.usuarioAgente) {
      return { atender: false, motivo: `la negociación ${situacion.negociacion.id} está asignada a otro responsable`, cederA: situacion.negociacion.responsableId };
    }
  }
  return { atender: true };
}

function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}
