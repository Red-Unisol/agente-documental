import { describe, expect, it } from "vitest";
import { CrmSimulado } from "../adaptadores/memoria/crm-simulado.js";
import { ConfiguracionEnMemoria, ConversacionesEnMemoria, RelojFijo } from "../adaptadores/memoria/repositorios.js";
import { nuevaConversacion } from "../dominio/conversacion/conversacion.js";
import { usoVacio } from "../dominio/costos/uso.js";
import type { LecturaDeRecibo } from "../dominio/tipos.js";
import type { EleccionDelModelo, ModeloConversacional, PeticionAlModelo, RespuestaDelModelo } from "../puertos/modelo-conversacional.js";
import { atenderMensaje } from "./atender-mensaje.js";
import { configuracionInicial } from "./configuracion-inicial.js";
import type { Dependencias } from "./dependencias.js";

const ficha = {
  negociacionId: "N-1",
  nombre: "Mariana",
  dni: "12345678",
  provincia: "Catamarca",
  convenio: "EMPLEADOS_PUBLICOS_CATAMARCA",
  sectorDeclarado: "publico" as const,
  empleadorDeclarado: "Ministerio de Educación de Catamarca",
};

const reciboCorrecto: LecturaDeRecibo = {
  esReciboDeSueldo: true,
  legible: true,
  empleador: "Ministerio de Educación de Catamarca",
  cuil: "27-12345678-0",
  periodo: { anio: 2026, mes: 9 },
  provincia: "Catamarca",
  sector: "publico",
  faltantes: [],
};

class ModeloGuionado implements ModeloConversacional {
  readonly peticiones: PeticionAlModelo[] = [];
  constructor(private readonly respuestas: EleccionDelModelo[]) {}

  async completar(peticion: PeticionAlModelo): Promise<RespuestaDelModelo> {
    this.peticiones.push(peticion);
    const siguiente = this.respuestas.shift();
    if (!siguiente) throw new Error("El modelo guionado se quedó sin respuestas");
    return { ...siguiente, uso: usoVacio("guionado") };
  }
}

async function armar(respuestas: EleccionDelModelo[], lectura: LecturaDeRecibo = reciboCorrecto) {
  const conversaciones = new ConversacionesEnMemoria();
  await conversaciones.guardar(nuevaConversacion("c1", "chat-1", ficha));
  const modelo = new ModeloGuionado(respuestas);
  const crm = new CrmSimulado();
  const dependencias: Dependencias = {
    modelo,
    lector: { leer: async () => ({ lectura, uso: usoVacio("guionado") }) },
    crm,
    conversaciones,
    configuracion: new ConfiguracionEnMemoria(configuracionInicial),
    reloj: new RelojFijo(new Date(2026, 9, 28)),
  };
  return { modelo, crm, dependencias };
}

const archivo = { id: "a1", nombre: "recibo.png", tipoMime: "image/png", bytes: new Uint8Array() };

describe("atenderMensaje", () => {
  it("obliga a cargar un escenario antes de responder y guarda la respuesta", async () => {
    const { modelo, dependencias } = await armar([
      { tipo: "llamadas", llamadas: [{ id: "1", nombre: "cargar_escenario", argumentos: { clave: "E1" } }] },
      { tipo: "texto", texto: "Hola Mariana, mandame tu recibo de septiembre." },
    ]);
    const resultado = await atenderMensaje({ conversacionId: "c1", texto: "Hola" }, dependencias);

    expect(resultado.tipo).toBe("respondio");
    expect(modelo.peticiones[0]?.herramientaObligatoria).toBe("cargar_escenario");
    expect(modelo.peticiones[1]?.herramientaObligatoria).toBeUndefined();
    expect(resultado.conversacion.auditoria.map((e) => e.tipo)).toEqual(["uso_de_modelo", "escenario_cargado", "uso_de_modelo"]);
    expect(resultado.conversacion.mensajes.map((m) => m.direccion)).toEqual(["entrante", "saliente"]);
  });

  it("con un recibo correcto lo carga en el CRM sin que el modelo decida", async () => {
    const { crm, dependencias } = await armar([
      { tipo: "llamadas", llamadas: [{ id: "1", nombre: "cargar_escenario", argumentos: { clave: "E4" } }] },
      { tipo: "llamadas", llamadas: [{ id: "2", nombre: "revisar_recibo", argumentos: {} }] },
      { tipo: "texto", texto: "Quedó cargado, pasa a análisis." },
    ]);
    const resultado = await atenderMensaje({ conversacionId: "c1", texto: "aca va", archivo }, dependencias);

    expect(resultado.conversacion.estado).toBe("documentacion_cargada");
    expect(crm.acciones).toEqual([
      { tipo: "recibo_cargado", negociacionId: "N-1", archivo: "recibo.png" },
      { tipo: "etapa", negociacionId: "N-1", etapa: "DOCU_RECIBIDA" },
    ]);
  });

  it("con un CUIL ajeno deriva al analista y después se calla", async () => {
    const { crm, dependencias } = await armar(
      [
        { tipo: "llamadas", llamadas: [{ id: "1", nombre: "cargar_escenario", argumentos: { clave: "E4" } }] },
        { tipo: "llamadas", llamadas: [{ id: "2", nombre: "revisar_recibo", argumentos: {} }] },
        { tipo: "texto", texto: "Te va a contactar una persona." },
      ],
      { ...reciboCorrecto, cuil: "20-87654321-5" },
    );
    const primero = await atenderMensaje({ conversacionId: "c1", texto: "aca va", archivo }, dependencias);
    const segundo = await atenderMensaje({ conversacionId: "c1", texto: "por qué?" }, dependencias);

    expect(primero.tipo).toBe("respondio");
    expect(crm.acciones.map((a) => a.tipo)).toEqual(["etapa", "transferencia"]);
    expect(segundo.tipo).toBe("silencio");
  });

  it("con el recibo ya cargado no vuelve a revisar un segundo archivo ni a mover la etapa", async () => {
    let lecturas = 0;
    const { crm, dependencias } = await armar([
      { tipo: "llamadas", llamadas: [{ id: "1", nombre: "cargar_escenario", argumentos: { clave: "E4" } }] },
      { tipo: "llamadas", llamadas: [{ id: "2", nombre: "revisar_recibo", argumentos: {} }] },
      { tipo: "texto", texto: "Quedó cargado." },
      { tipo: "llamadas", llamadas: [{ id: "3", nombre: "cargar_escenario", argumentos: { clave: "E10" } }] },
      { tipo: "llamadas", llamadas: [{ id: "4", nombre: "revisar_recibo", argumentos: {} }] },
      { tipo: "texto", texto: "Ya está cargado, no hace falta más." },
    ]);
    dependencias.lector = { leer: async () => { lecturas += 1; return { lectura: reciboCorrecto, uso: usoVacio("guionado") }; } };
    await atenderMensaje({ conversacionId: "c1", texto: "", archivo }, dependencias);
    const segundo = await atenderMensaje({ conversacionId: "c1", texto: "por las dudas", archivo: { ...archivo, id: "a2", nombre: "dni.png" } }, dependencias);

    expect(lecturas).toBe(1);
    expect(segundo.tipo).toBe("respondio");
    expect(crm.acciones.filter((a) => a.tipo === "etapa")).toHaveLength(1);
    expect(segundo.conversacion.auditoria.filter((e) => e.tipo === "verificacion")).toHaveLength(1);
  });

  it("le cuenta al modelo qué pasó con cada archivo del historial", async () => {
    const { modelo, dependencias } = await armar(
      [
        { tipo: "llamadas", llamadas: [{ id: "1", nombre: "cargar_escenario", argumentos: { clave: "E4" } }] },
        { tipo: "llamadas", llamadas: [{ id: "2", nombre: "revisar_recibo", argumentos: {} }] },
        { tipo: "texto", texto: "Es de junio, mandame el de septiembre." },
        { tipo: "llamadas", llamadas: [{ id: "3", nombre: "cargar_escenario", argumentos: { clave: "E4" } }] },
        { tipo: "texto", texto: "Sí, lo vi: es de junio." },
      ],
      { ...reciboCorrecto, periodo: { anio: 2026, mes: 6 } },
    );
    await atenderMensaje({ conversacionId: "c1", texto: "", archivo }, dependencias);
    await atenderMensaje({ conversacionId: "c1", texto: "pero ya te lo mandé!" }, dependencias);

    const primerMensaje = modelo.peticiones.at(-1)!.mensajes[0];
    const texto = primerMensaje?.rol === "usuario" ? primerMensaje.texto : "";
    expect(texto).toMatch(/no sirvió/);
    expect(texto).not.toMatch(/todavía no se revisó/);
  });

  it("rechaza herramientas que no existen y lo deja auditado", async () => {
    const { dependencias } = await armar([
      { tipo: "llamadas", llamadas: [{ id: "1", nombre: "aprobar_credito", argumentos: {} }] },
      { tipo: "texto", texto: "No puedo hacer eso." },
    ]);
    const resultado = await atenderMensaje({ conversacionId: "c1", texto: "aprobame" }, dependencias);

    expect(resultado.conversacion.auditoria.map((e) => e.tipo)).toContain("herramienta_rechazada");
  });
});
