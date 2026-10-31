import { describe, expect, it } from "vitest";
import { ConfiguracionEnMemoria, ConversacionesEnMemoria, RelojFijo } from "../adaptadores/memoria/repositorios.js";
import { CrmSimulado } from "../adaptadores/memoria/crm-simulado.js";
import { type Conversacion, conMensaje, nuevaConversacion } from "../dominio/conversacion/conversacion.js";
import { usoVacio } from "../dominio/costos/uso.js";
import type { ModeloConversacional, PeticionAlModelo, RespuestaDelModelo } from "../puertos/modelo-conversacional.js";
import { configuracionInicial } from "./configuracion-inicial.js";
import type { Dependencias } from "./dependencias.js";
import { conHistorialResumidoSiHaceFalta, historialParaElModelo, MENSAJES_LITERALES, UMBRAL_DE_MENSAJES } from "./historial.js";

const ficha = { negociacionId: "N-1", nombre: "Mariana", dni: "12345678", provincia: "Catamarca", convenio: "X", sectorDeclarado: "publico" as const, empleadorDeclarado: "Ministerio" };

class ModeloQueResume implements ModeloConversacional {
  readonly peticiones: PeticionAlModelo[] = [];
  async completar(peticion: PeticionAlModelo): Promise<RespuestaDelModelo> {
    this.peticiones.push(peticion);
    return { tipo: "texto", texto: "El agente pidió el recibo; el socio preguntó varias veces y dijo que lo manda el lunes.", uso: usoVacio("guionado") };
  }
}

function conversacionDe(cantidad: number): Conversacion {
  let conversacion = nuevaConversacion("c1", "chat-1", ficha);
  for (let i = 1; i <= cantidad; i++) {
    conversacion = conMensaje(conversacion, { direccion: i % 2 ? "entrante" : "saliente", texto: `mensaje ${i}`, at: new Date(2026, 9, 28) });
  }
  return conversacion;
}

function dependenciasCon(modelo: ModeloConversacional): Dependencias {
  return {
    modelo,
    lector: { leer: async () => { throw new Error("no se usa"); } },
    crm: new CrmSimulado(),
    conversaciones: new ConversacionesEnMemoria(),
    configuracion: new ConfiguracionEnMemoria(configuracionInicial),
    reloj: new RelojFijo(new Date(2026, 9, 28)),
  };
}

describe("historial para el modelo", () => {
  it("hasta el umbral manda la conversación entera, sin resumir ni llamar al modelo", async () => {
    const modelo = new ModeloQueResume();
    const conversacion = await conHistorialResumidoSiHaceFalta(conversacionDe(UMBRAL_DE_MENSAJES), dependenciasCon(modelo));

    expect(modelo.peticiones).toHaveLength(0);
    expect(conversacion.resumen).toBeUndefined();
    expect(historialParaElModelo(conversacion)).toHaveLength(UMBRAL_DE_MENSAJES);
  });

  it("pasado el umbral resume lo viejo y deja los últimos literales", async () => {
    const modelo = new ModeloQueResume();
    const conversacion = await conHistorialResumidoSiHaceFalta(conversacionDe(UMBRAL_DE_MENSAJES + 1), dependenciasCon(modelo));

    expect(modelo.peticiones).toHaveLength(1);
    expect(modelo.peticiones[0]?.herramientas).toEqual([]);
    expect(conversacion.resumen?.mensajesCubiertos).toBe(UMBRAL_DE_MENSAJES + 1 - MENSAJES_LITERALES);
    const historial = historialParaElModelo(conversacion);
    expect(historial).toHaveLength(MENSAJES_LITERALES + 2);
    expect(historial[0]).toMatchObject({ rol: "usuario", texto: expect.stringContaining("lo manda el lunes") });
    expect(historial.at(-1)).toMatchObject({ texto: `mensaje ${UMBRAL_DE_MENSAJES + 1}` });
    expect(conversacion.auditoria.at(-1)).toMatchObject({ tipo: "uso_de_modelo", detalle: expect.objectContaining({ proposito: "resumen" }) });
  });

  it("no vuelve a resumir en cada turno: espera a que la parte literal crezca", async () => {
    const modelo = new ModeloQueResume();
    const dependencias = dependenciasCon(modelo);
    const resumida = await conHistorialResumidoSiHaceFalta(conversacionDe(UMBRAL_DE_MENSAJES + 1), dependencias);
    const unTurnoDespues = conMensaje(resumida, { direccion: "entrante", texto: "otro", at: new Date() });

    const igual = await conHistorialResumidoSiHaceFalta(unTurnoDespues, dependencias);
    expect(modelo.peticiones).toHaveLength(1);
    expect(igual.resumen).toEqual(resumida.resumen);

    let muchoDespues = igual;
    for (let i = 0; i < 25; i++) muchoDespues = conMensaje(muchoDespues, { direccion: "entrante", texto: `más ${i}`, at: new Date() });
    const reResumida = await conHistorialResumidoSiHaceFalta(muchoDespues, dependencias);
    expect(modelo.peticiones).toHaveLength(2);
    expect(modelo.peticiones[1]?.mensajes[0]).toMatchObject({ texto: expect.stringContaining("Resumen previo") });
    expect(reResumida.resumen?.mensajesCubiertos).toBe(muchoDespues.mensajes.length - MENSAJES_LITERALES);
  });
});
