import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { conArchivo, conEvento, conMensaje, nuevaConversacion } from "../../dominio/conversacion/conversacion.js";
import { ConversacionesEnArchivos } from "./conversaciones-en-archivos.js";

const ficha = { negociacionId: "1", nombre: "Mariana", dni: "12345678", provincia: "Catamarca", convenio: "Amejuca", sectorDeclarado: "publico" as const, empleadorDeclarado: "Ministerio" };
let carpeta: string;
afterEach(async () => carpeta && rm(carpeta, { recursive: true, force: true }));

describe("ConversacionesEnArchivos", () => {
  it("guarda y vuelve a leer una conversación completa desde otro repositorio (como tras un reinicio)", async () => {
    carpeta = await mkdtemp(join(tmpdir(), "conv-"));
    const at = new Date("2026-10-28T12:00:00Z");
    let conversacion = conMensaje(nuevaConversacion("chat1", "chat1", ficha), { direccion: "entrante", texto: "hola", at });
    conversacion = conArchivo(conversacion, { id: "a1", nombre: "recibo.png", tipoMime: "image/png", bytes: new Uint8Array([1, 2, 3]) });
    conversacion = conEvento(conversacion, { at, tipo: "verificacion", detalle: { archivoId: "a1", decision: "aceptar" } });
    conversacion = { ...conversacion, estado: "documentacion_cargada" };
    await new ConversacionesEnArchivos(carpeta).guardar(conversacion);

    const leida = await new ConversacionesEnArchivos(carpeta).obtener("chat1");
    expect(leida).toEqual(conversacion);
    expect(leida?.mensajes[0]?.at).toBeInstanceOf(Date);
  });

  it("devuelve undefined si la conversación no existe", async () => {
    carpeta = await mkdtemp(join(tmpdir(), "conv-"));
    expect(await new ConversacionesEnArchivos(carpeta).obtener("nada")).toBeUndefined();
  });
});
