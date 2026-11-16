import { describe, expect, it } from "vitest";
import { CrmSimulado } from "../adaptadores/memoria/crm-simulado.js";
import { ConfiguracionEnMemoria, ConversacionesEnMemoria, RelojFijo } from "../adaptadores/memoria/repositorios.js";
import { nuevaConversacion } from "../dominio/conversacion/conversacion.js";
import { usoVacio } from "../dominio/costos/uso.js";
import type { EstadoDeNegociacion, LecturaDeDocumento, Liquidacion } from "../dominio/tipos.js";
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

const liquidacionCorrecta: Liquidacion = {
  empleador: "Ministerio de Educación de Catamarca",
  cuil: "27-12345678-0",
  dni: undefined,
  periodo: { anio: 2026, mes: 9 },
  provincia: "Catamarca",
  sector: "publico",
  conHaberes: true,
};

function recibo(cambios: Partial<Liquidacion> = {}): LecturaDeDocumento {
  return { legible: true, otrosDocumentos: [], liquidaciones: [{ ...liquidacionCorrecta, ...cambios }] };
}

const reciboCorrecto = recibo();
const dniSuelto: LecturaDeDocumento = { legible: true, otrosDocumentos: ["dni"], liquidaciones: [] };

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

async function armar(respuestas: EleccionDelModelo[], lectura: LecturaDeDocumento = reciboCorrecto, negociacion?: EstadoDeNegociacion) {
  const conversaciones = new ConversacionesEnMemoria();
  await conversaciones.guardar(nuevaConversacion("c1", "chat-1", ficha));
  const modelo = new ModeloGuionado(respuestas);
  const crm = new CrmSimulado(negociacion);
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

const saludo: EleccionDelModelo[] = [
  { tipo: "llamadas", llamadas: [{ id: "1", nombre: "cargar_escenario", argumentos: { clave: "E1" } }] },
  { tipo: "texto", texto: "Hola Mariana." },
];

describe("datos de la negociación en el prompt", () => {
  it("le pasa al modelo lo que la negociación tiene cargado en el CRM", async () => {
    const negociacion = { hayQuePedirElRecibo: true, datos: [{ etiqueta: "Cantidad de créditos activos", valor: "2" }] };
    const { modelo, dependencias } = await armar([...saludo], reciboCorrecto, negociacion);
    await atenderMensaje({ conversacionId: "c1", texto: "tengo créditos activos?" }, dependencias);

    const sistema = modelo.peticiones[0]?.sistema ?? "";
    expect(sistema).toContain("DATOS DE SU NEGOCIACIÓN (lo que figura hoy");
    expect(sistema).toContain("Cantidad de créditos activos: 2");
    expect(sistema).toContain("Recibo que necesitamos: el de");
  });

  it("si el recibo ya está o la negociación pasó la documentación, le dice que no lo pida", async () => {
    const negociacion = { hayQuePedirElRecibo: false, datos: [{ etiqueta: "Etapa de la solicitud", valor: "OFERTA" }] };
    const { modelo, dependencias } = await armar([...saludo], reciboCorrecto, negociacion);
    await atenderMensaje({ conversacionId: "c1", texto: "hola" }, dependencias);

    const sistema = modelo.peticiones[0]?.sistema ?? "";
    expect(sistema).toContain("hoy NO hay que pedírselo");
    expect(sistema).not.toContain("Recibo que necesitamos");
  });

  it("sin datos en la negociación, el prompt no trae la sección", async () => {
    const { modelo, dependencias } = await armar([...saludo]);
    await atenderMensaje({ conversacionId: "c1", texto: "hola" }, dependencias);
    expect(modelo.peticiones[0]?.sistema).not.toContain("DATOS DE SU NEGOCIACIÓN (lo que figura hoy");
  });

  it("si el CRM no responde, atiende igual con la ficha", async () => {
    const { modelo, dependencias } = await armar([...saludo]);
    dependencias.crm.estadoDeNegociacion = async () => {
      throw new Error("Bitrix no responde");
    };
    const resultado = await atenderMensaje({ conversacionId: "c1", texto: "hola" }, dependencias);

    expect(resultado.tipo).toBe("respondio");
    expect(modelo.peticiones[0]?.sistema).toContain("Recibo que necesitamos");
  });

  it("nunca pone el DNI de la ficha en el prompt", async () => {
    const { modelo, dependencias } = await armar([...saludo], reciboCorrecto, { hayQuePedirElRecibo: true, datos: [{ etiqueta: "Línea", valor: "Premium" }] });
    await atenderMensaje({ conversacionId: "c1", texto: "hola" }, dependencias);
    expect(modelo.peticiones[0]?.sistema).not.toContain(ficha.dni);
  });
});

describe("recibo que llega con la negociación fuera de documentación", () => {
  it("lo carga, y como la etapa no se mueve le dice al modelo que no anuncie que pasó a análisis", async () => {
    const { modelo, crm, dependencias } = await armar([
      { tipo: "llamadas", llamadas: [{ id: "1", nombre: "cargar_escenario", argumentos: { clave: "E4" } }] },
      { tipo: "llamadas", llamadas: [{ id: "2", nombre: "revisar_recibo", argumentos: {} }] },
      { tipo: "texto", texto: "Quedó cargado; tu solicitud sigue con el equipo." },
    ]);
    crm.moverEtapa = async () => false;
    const resultado = await atenderMensaje({ conversacionId: "c1", texto: "te dejo el recibo nuevo", archivos: [archivo] }, dependencias);

    expect(resultado.conversacion.estado).toBe("documentacion_cargada");
    expect(crm.acciones).toEqual([{ tipo: "recibo_cargado", negociacionId: "N-1", archivo: "recibo.png" }]);
    const loQueVioElModelo = JSON.stringify(modelo.peticiones.at(-1)?.mensajes);
    expect(loQueVioElModelo).toContain("No digas que pasó a análisis");
    const cargado = resultado.conversacion.auditoria.find((e) => e.tipo === "accion_crm");
    expect(cargado?.detalle).toEqual({ accion: "cargar_recibo", archivo: "recibo.png" });
  });
});

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
    const resultado = await atenderMensaje({ conversacionId: "c1", texto: "aca va", archivos: [archivo] }, dependencias);

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
      recibo({ cuil: "20-87654321-5" }),
    );
    const primero = await atenderMensaje({ conversacionId: "c1", texto: "aca va", archivos: [archivo] }, dependencias);
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
    await atenderMensaje({ conversacionId: "c1", texto: "", archivos: [archivo] }, dependencias);
    const segundo = await atenderMensaje({ conversacionId: "c1", texto: "por las dudas", archivos: [{ ...archivo, id: "a2", nombre: "dni.png" }] }, dependencias);

    expect(lecturas).toBe(1);
    expect(segundo.tipo).toBe("respondio");
    expect(crm.acciones.filter((a) => a.tipo === "etapa")).toHaveLength(1);
    expect(segundo.conversacion.auditoria.filter((e) => e.tipo === "verificacion")).toHaveLength(1);
  });

  it("si manda el DNI y el recibo en archivos separados, lee los dos y carga el recibo", async () => {
    const { crm, dependencias } = await armar([
      { tipo: "llamadas", llamadas: [{ id: "1", nombre: "cargar_escenario", argumentos: { clave: "E4" } }] },
      { tipo: "llamadas", llamadas: [{ id: "2", nombre: "revisar_recibo", argumentos: {} }] },
      { tipo: "texto", texto: "Quedó cargado." },
    ]);
    const leidos: string[] = [];
    dependencias.lector = { leer: async (a) => { leidos.push(a.nombre); return { lectura: a.nombre === "dni.png" ? dniSuelto : reciboCorrecto, uso: usoVacio("guionado") }; } };
    const archivos = [{ ...archivo, id: "a1", nombre: "dni.png" }, { ...archivo, id: "a2", nombre: "recibo.pdf" }];
    const resultado = await atenderMensaje({ conversacionId: "c1", texto: "van los dos", archivos }, dependencias);

    expect(leidos).toEqual(["dni.png", "recibo.pdf"]);
    expect(resultado.conversacion.estado).toBe("documentacion_cargada");
    expect(crm.acciones[0]).toEqual({ tipo: "recibo_cargado", negociacionId: "N-1", archivo: "recibo.pdf" });
  });

  it("si primero mandó el DNI y después el recibo, el segundo archivo se revisa solo", async () => {
    const { dependencias } = await armar([
      { tipo: "llamadas", llamadas: [{ id: "1", nombre: "cargar_escenario", argumentos: { clave: "E4" } }] },
      { tipo: "llamadas", llamadas: [{ id: "2", nombre: "revisar_recibo", argumentos: {} }] },
      { tipo: "texto", texto: "Eso es el DNI, me falta el recibo." },
      { tipo: "llamadas", llamadas: [{ id: "3", nombre: "cargar_escenario", argumentos: { clave: "E4" } }] },
      { tipo: "llamadas", llamadas: [{ id: "4", nombre: "revisar_recibo", argumentos: {} }] },
      { tipo: "texto", texto: "Quedó cargado." },
    ]);
    const leidos: string[] = [];
    dependencias.lector = { leer: async (a) => { leidos.push(a.nombre); return { lectura: a.nombre === "dni.png" ? dniSuelto : reciboCorrecto, uso: usoVacio("guionado") }; } };
    const primero = await atenderMensaje({ conversacionId: "c1", texto: "", archivos: [{ ...archivo, id: "a1", nombre: "dni.png" }] }, dependencias);
    const segundo = await atenderMensaje({ conversacionId: "c1", texto: "", archivos: [{ ...archivo, id: "a2", nombre: "recibo.pdf" }] }, dependencias);

    expect(primero.conversacion.estado).toBe("activa");
    expect(segundo.conversacion.estado).toBe("documentacion_cargada");
    expect(leidos).toEqual(["dni.png", "recibo.pdf"]);
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
      recibo({ periodo: { anio: 2026, mes: 6 } }),
    );
    await atenderMensaje({ conversacionId: "c1", texto: "", archivos: [archivo] }, dependencias);
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
