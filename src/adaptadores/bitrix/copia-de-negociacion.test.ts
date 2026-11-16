import { describe, expect, it } from "vitest";
import { camposDeLaCopia, etapaEquivalente, mensajesDelHistorial, pedidoDePrueba } from "./copia-de-negociacion.js";
import { mapeoDelEmbudoDePrueba } from "./mapeo.js";

const mapeo = mapeoDelEmbudoDePrueba(7);
const etapas = new Set(["C19:UC_53P7WJ", "C19:EXECUTING", "C19:5"]);

describe("pedido de prueba con una negociación real", () => {
  const enlace = "https://portal.bitrix24.es/crm/deal/details/45678/";

  it("vale con el enlace de la negociación y la clave como palabra suelta", () => {
    expect(pedidoDePrueba(`probar ${enlace} clave-123`, "clave-123")).toEqual({ negociacionId: "45678" });
    expect(pedidoDePrueba(`clave-123\n${enlace}?IFRAME=Y`, "clave-123")).toEqual({ negociacionId: "45678" });
  });

  it("sin clave configurada el modo está apagado", () => {
    expect(pedidoDePrueba(`probar ${enlace} clave-123`, undefined)).toBeUndefined();
    expect(pedidoDePrueba(`probar ${enlace}`, "")).toBeUndefined();
  });

  it("no vale sin la clave, con otra clave o con la clave metida en el enlace", () => {
    expect(pedidoDePrueba(`probar ${enlace}`, "clave-123")).toBeUndefined();
    expect(pedidoDePrueba(`probar ${enlace} clave-124`, "clave-123")).toBeUndefined();
    expect(pedidoDePrueba(`${enlace}?x=clave-123`, "clave-123")).toBeUndefined();
    expect(pedidoDePrueba("https://portal.bitrix24.es/crm/deal/details/45678/?45678", "45678")).toBeUndefined();
  });

  it("un mensaje con la clave pero sin enlace es un mensaje común", () => {
    expect(pedidoDePrueba("hola clave-123", "clave-123")).toBeUndefined();
  });
});

describe("campos que se lleva la copia", () => {
  const original = {
    ID: "45678",
    CATEGORY_ID: "1",
    STAGE_ID: "C1:EXECUTING",
    CONTACT_ID: "99",
    ASSIGNED_BY_ID: "321",
    OPPORTUNITY: "850000.00",
    CURRENCY_ID: "ARS",
    [mapeo.campos.cuil]: 20123456789,
    [mapeo.campos.provincia]: "55",
    [mapeo.campos.dni]: "",
    [mapeo.campos.recibo]: [{ id: 1 }],
    UF_CRM_6A34379BDE41B: "2",
    UF_CRM_6602D534A38CF: false,
    UF_CRM_BCRA_RAW: "situación 4",
    UF_CRM_TELEFONO: "+5493510000000",
  };

  it("copia la ficha y los datos para el socio que tienen valor, en la etapa equivalente del embudo de prueba", () => {
    expect(camposDeLaCopia(original, mapeo, etapas)).toEqual({
      CATEGORY_ID: 19,
      STAGE_ID: "C19:EXECUTING",
      OPPORTUNITY: "850000.00",
      CURRENCY_ID: "ARS",
      [mapeo.campos.cuil]: 20123456789,
      [mapeo.campos.provincia]: "55",
      UF_CRM_6A34379BDE41B: "2",
    });
  });

  it("no se lleva el recibo, el contacto, el responsable ni campos que no están en el mapeo", () => {
    const campos = camposDeLaCopia(original, mapeo, etapas);
    for (const ausente of [mapeo.campos.recibo, "CONTACT_ID", "ASSIGNED_BY_ID", "UF_CRM_BCRA_RAW", "UF_CRM_TELEFONO", "ID"]) expect(campos).not.toHaveProperty(ausente);
  });

  it("si el embudo de prueba no tiene la etapa, arranca en DOCUMENTACIÓN", () => {
    expect(etapaEquivalente("C1:ETAPA_NUEVA", mapeo, etapas)).toBe(mapeo.etapas.DOCUMENTACION);
    expect(etapaEquivalente("C1:5", mapeo, etapas)).toBe("C19:5");
    expect(etapaEquivalente("", mapeo, etapas)).toBe(mapeo.etapas.DOCUMENTACION);
  });
});

describe("conversación anterior de la negociación", () => {
  it("el socio es quien entra por un conector; el resto habla por Red Unisol; los avisos del sistema no van", () => {
    const mensajes = mensajesDelHistorial({
      users: { "10": { connector: true }, "20": { connector: false } },
      message: {
        "3": { id: 3, senderid: 20, date: "2026-11-10T10:02:00-03:00", text: "Hola, necesitamos tu recibo" },
        "1": { id: 1, senderid: 0, date: "2026-11-10T10:00:00-03:00", text: "Se abrió la conversación" },
        "2": { id: 2, senderid: 10, date: "2026-11-10T10:01:00-03:00", text: " Hola " },
        "4": { id: 4, senderid: 10, date: "2026-11-10T10:03:00-03:00", text: "", params: { fileId: [77] } },
        "5": { id: 5, senderid: 10, date: "2026-11-10T10:04:00-03:00", text: "" },
      },
    });
    expect(mensajes.map((m) => [m.direccion, m.texto])).toEqual([
      ["entrante", "Hola"],
      ["saliente", "Hola, necesitamos tu recibo"],
      ["entrante", "(archivo enviado en la conversación original; no se copió)"],
    ]);
  });

  it("trae sólo los últimos 40 mensajes", () => {
    const message = Object.fromEntries(Array.from({ length: 55 }, (_, i) => [String(i + 1), { id: i + 1, senderid: 10, date: "2026-11-10T10:00:00-03:00", text: `mensaje ${i + 1}` }]));
    const mensajes = mensajesDelHistorial({ users: { "10": { connector: true } }, message });
    expect(mensajes).toHaveLength(40);
    expect(mensajes[0]?.texto).toBe("mensaje 16");
  });

  it("un historial vacío no rompe", () => {
    expect(mensajesDelHistorial({})).toEqual([]);
  });
});
