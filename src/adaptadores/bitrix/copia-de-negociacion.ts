import type { Mensaje } from "../../dominio/conversacion/conversacion.js";
import type { ClienteBitrix } from "./cliente-rest.js";
import type { MapeoDeBitrix } from "./mapeo.js";

// Probar el agente con un caso real sin tocarlo: quien prueba manda en el chat de prueba el enlace de
// una negociación y la clave de pruebas; el agente lee esa negociación (sólo lectura), arma una copia
// en el embudo donde trabaja, con sus datos y la conversación que tuvo, y sigue la charla sobre la
// copia. La negociación original, su contacto y su chat no se modifican nunca.

const ENLACE_DE_NEGOCIACION = /\/crm\/deal\/details\/(\d+)/;
const MENSAJES_A_TRAER = 40;
const LARGO_MAXIMO_DE_MENSAJE = 1500;
const MARCA_DE_ARCHIVO = "(archivo enviado en la conversación original; no se copió)";

export interface CopiaParaProbar {
  negociacionId: string;
  // false si el enlace ya era de una negociación del embudo de prueba: se usa esa misma, sin copiar.
  esCopia: boolean;
  etapa: string;
  mensajes: Mensaje[];
}

type Negociacion = Record<string, unknown> & { ID: string; CATEGORY_ID?: string; STAGE_ID?: string; CONTACT_ID?: string | null };

export interface HistorialDeBitrix {
  message?: Record<string, { id: string | number; senderid: string | number; date: string; text?: string; params?: { fileId?: unknown[] | null } | null }>;
  users?: Record<string, { connector?: boolean }>;
}

// El pedido vale sólo si trae el enlace de una negociación y la clave, como palabra suelta. Sin clave
// configurada el modo está apagado. Cualquier otro mensaje sigue su camino normal hacia el agente.
export function pedidoDePrueba(texto: string, clave: string | undefined): { negociacionId: string } | undefined {
  if (!clave) return undefined;
  const negociacionId = ENLACE_DE_NEGOCIACION.exec(texto)?.[1];
  if (!negociacionId) return undefined;
  const palabras = texto.replace(/https?:\/\/\S+/g, " ").split(/\s+/);
  return palabras.includes(clave) ? { negociacionId } : undefined;
}

// Lo que se lleva la copia: lo que el agente usa para armar la ficha y lo que puede contarle al socio.
// No van el teléfono, el mail, el contacto, los archivos ni ningún otro campo de la negociación.
export function camposDeLaCopia(original: Negociacion, mapeo: MapeoDeBitrix, etapasDelEmbudo: Set<string>): Record<string, unknown> {
  const { recibo, ...deLaFicha } = mapeo.campos;
  const codigos = new Set([...Object.values(deLaFicha), ...mapeo.datosParaElSocio.map((dato) => dato.campo)]);
  const copiados = [...codigos].flatMap((codigo) => (estaVacio(original[codigo]) ? [] : [[codigo, original[codigo]] as const]));
  return {
    ...Object.fromEntries(copiados),
    CATEGORY_ID: mapeo.embudo,
    STAGE_ID: etapaEquivalente(String(original.STAGE_ID ?? ""), mapeo, etapasDelEmbudo),
    ...(Number(original.OPPORTUNITY) > 0 && { OPPORTUNITY: original.OPPORTUNITY, CURRENCY_ID: original.CURRENCY_ID }),
  };
}

// "C1:UC_53P7WJ" → "C19:UC_53P7WJ". Si el embudo de prueba no tiene esa etapa, arranca en DOCUMENTACIÓN.
export function etapaEquivalente(etapaOriginal: string, mapeo: Pick<MapeoDeBitrix, "embudo" | "etapas">, etapasDelEmbudo: Set<string>): string {
  const sufijo = etapaOriginal.includes(":") ? etapaOriginal.slice(etapaOriginal.indexOf(":") + 1) : etapaOriginal;
  const candidata = mapeo.embudo === 0 ? sufijo : `C${mapeo.embudo}:${sufijo}`;
  return etapasDelEmbudo.has(candidata) ? candidata : mapeo.etapas.DOCUMENTACION;
}

// Del historial de la sesión quedan los últimos mensajes de personas: los del socio (entra por un
// conector) como entrantes y los de Red Unisol (vendedor, bot, automatización) como salientes.
export function mensajesDelHistorial(historial: HistorialDeBitrix): Mensaje[] {
  return Object.values(historial.message ?? {})
    .filter((mensaje) => String(mensaje.senderid) !== "0")
    .sort((a, b) => Number(a.id) - Number(b.id))
    .flatMap((mensaje): Mensaje[] => {
      const texto = mensaje.text?.trim().slice(0, LARGO_MAXIMO_DE_MENSAJE) || (mensaje.params?.fileId?.length ? MARCA_DE_ARCHIVO : "");
      if (!texto) return [];
      const delSocio = historial.users?.[String(mensaje.senderid)]?.connector === true;
      return [{ direccion: delSocio ? "entrante" : "saliente", texto, at: new Date(mensaje.date) }];
    })
    .slice(-MENSAJES_A_TRAER);
}

export class CopiaDeNegociacion {
  constructor(
    private readonly cliente: ClienteBitrix,
    private readonly mapeo: MapeoDeBitrix,
    // A quién queda asignada la copia: nunca al vendedor de la negociación original.
    private readonly responsable: number,
  ) {}

  async copiar(negociacionId: string): Promise<CopiaParaProbar> {
    const original = await this.cliente.llamar<Negociacion>("crm.deal.get", { id: negociacionId });
    const etapas = await this.etapasDelEmbudo();
    const mensajes = await this.conversacionDe(original);
    if (Number(original.CATEGORY_ID) === this.mapeo.embudo) {
      return { negociacionId: original.ID, esCopia: false, etapa: etapas.get(String(original.STAGE_ID)) ?? String(original.STAGE_ID), mensajes };
    }
    const campos = camposDeLaCopia(original, this.mapeo, new Set(etapas.keys()));
    const contactoId = await this.cliente.llamar<number>("crm.contact.add", {
      fields: { NAME: await this.nombreDePila(original), LAST_NAME: "(copia de prueba)", ASSIGNED_BY_ID: this.responsable },
    });
    const copiaId = await this.cliente.llamar<number>("crm.deal.add", {
      fields: { ...campos, TITLE: `PRUEBA · copia de la negociación ${original.ID}`, CONTACT_ID: contactoId, ASSIGNED_BY_ID: this.responsable },
    });
    return { negociacionId: String(copiaId), esCopia: true, etapa: etapas.get(String(campos.STAGE_ID)) ?? String(campos.STAGE_ID), mensajes };
  }

  private async etapasDelEmbudo(): Promise<Map<string, string>> {
    const etapas = await this.cliente.llamar<{ STATUS_ID: string; NAME: string }[]>("crm.status.list", {
      filter: { ENTITY_ID: this.mapeo.embudo === 0 ? "DEAL_STAGE" : `DEAL_STAGE_${this.mapeo.embudo}` },
    });
    return new Map(etapas.map((etapa) => [etapa.STATUS_ID, etapa.NAME]));
  }

  // Sólo el nombre de pila: alcanza para que el agente salude y no duplica el apellido en el CRM.
  private async nombreDePila(original: Negociacion): Promise<string> {
    if (!original.CONTACT_ID) return "Socio";
    const contacto = await this.cliente.llamar<{ NAME?: string }>("crm.contact.get", { id: original.CONTACT_ID });
    return contacto.NAME?.trim().split(/\s+/)[0] || "Socio";
  }

  // La conversación del canal abierto atada a la negociación (la más nueva si hay varias). Si no hay
  // o no se puede leer, la prueba arranca sin historial.
  private async conversacionDe(original: Negociacion): Promise<Mensaje[]> {
    try {
      const chats = await this.cliente.llamar<{ CHAT_ID?: number | string }[] | Record<string, unknown>>("imopenlines.crm.chat.get", {
        CRM_ENTITY_TYPE: "DEAL",
        CRM_ENTITY: Number(original.ID),
      });
      const chatId = Array.isArray(chats) ? Math.max(0, ...chats.map((chat) => Number(chat.CHAT_ID) || 0)) : 0;
      if (!chatId) return [];
      return mensajesDelHistorial(await this.cliente.llamar<HistorialDeBitrix>("imopenlines.session.history.get", { CHAT_ID: chatId }));
    } catch {
      return [];
    }
  }
}

function estaVacio(valor: unknown): boolean {
  return valor === null || valor === undefined || valor === "" || valor === false || (Array.isArray(valor) && valor.length === 0);
}
