import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Archivo, Conversacion, EventoDeAuditoria, Mensaje } from "../../dominio/conversacion/conversacion.js";
import type { RepositorioDeConversaciones } from "../../puertos/repositorios.js";

// Un archivo JSON por conversación. Sobrevive a reinicios del servidor: si el agente se reinicia
// en medio de un chat, retoma con todo el historial en vez de saludar de nuevo.
export class ConversacionesEnArchivos implements RepositorioDeConversaciones {
  private readonly cache = new Map<string, Conversacion>();

  constructor(private readonly carpeta: string) {}

  async obtener(id: string): Promise<Conversacion | undefined> {
    const enCache = this.cache.get(id);
    if (enCache) return enCache;
    try {
      const conversacion = deserializar(await readFile(this.ruta(id), "utf8"));
      this.cache.set(id, conversacion);
      return conversacion;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async guardar(conversacion: Conversacion): Promise<void> {
    this.cache.set(conversacion.id, conversacion);
    await mkdir(this.carpeta, { recursive: true });
    await writeFile(this.ruta(conversacion.id), serializar(conversacion));
  }

  private ruta(id: string): string {
    return join(this.carpeta, `${id.replace(/[^\w.-]/g, "_")}.json`);
  }
}

type ArchivoGuardado = Omit<Archivo, "bytes"> & { bytesBase64: string };
type Guardada = Omit<Conversacion, "mensajes" | "archivos" | "auditoria"> & {
  mensajes: (Omit<Mensaje, "at"> & { at: string })[];
  archivos: ArchivoGuardado[];
  auditoria: (Omit<EventoDeAuditoria, "at"> & { at: string })[];
};

export function serializar(conversacion: Conversacion): string {
  const guardada: Guardada = {
    ...conversacion,
    mensajes: conversacion.mensajes.map((m) => ({ ...m, at: m.at.toISOString() })),
    archivos: conversacion.archivos.map(({ bytes, ...resto }) => ({ ...resto, bytesBase64: Buffer.from(bytes).toString("base64") })),
    auditoria: conversacion.auditoria.map((e) => ({ ...e, at: e.at.toISOString() })),
  };
  return JSON.stringify(guardada);
}

export function deserializar(texto: string): Conversacion {
  const guardada = JSON.parse(texto) as Guardada;
  return {
    ...guardada,
    mensajes: guardada.mensajes.map((m) => ({ ...m, at: new Date(m.at) })),
    archivos: guardada.archivos.map(({ bytesBase64, ...resto }) => ({ ...resto, bytes: new Uint8Array(Buffer.from(bytesBase64, "base64")) })),
    auditoria: guardada.auditoria.map((e) => ({ ...e, at: new Date(e.at) })),
  };
}
