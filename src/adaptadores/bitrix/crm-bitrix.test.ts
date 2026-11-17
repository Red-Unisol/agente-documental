import { describe, expect, it } from "vitest";
import type { ClienteBitrix } from "./cliente-rest.js";
import { CrmBitrix } from "./crm-bitrix.js";
import { mapeoDelEmbudoDePrueba } from "./mapeo.js";

const mapeo = mapeoDelEmbudoDePrueba(7);

function crmConNegociacionEn(etapa: string) {
  const llamadas: { metodo: string; parametros: Record<string, unknown> }[] = [];
  const cliente = {
    async llamar(metodo: string, parametros: Record<string, unknown> = {}) {
      llamadas.push({ metodo, parametros });
      return metodo === "crm.deal.get" ? { STAGE_ID: etapa } : 1;
    },
  } as unknown as ClienteBitrix;
  const escrituras = () => llamadas.filter((llamada) => llamada.metodo !== "crm.deal.get");
  return { crm: new CrmBitrix(cliente, mapeo), escrituras };
}

describe("mover de etapa", () => {
  it("dentro de las etapas de documentación, mueve la negociación y anota el motivo", async () => {
    const { crm, escrituras } = crmConNegociacionEn(mapeo.etapas.DOCUMENTACION);
    await crm.moverEtapa("10", "DOCU_RECIBIDA", "Recibo verificado y guardado (recibo.pdf).");
    expect(escrituras()).toEqual([
      { metodo: "crm.deal.update", parametros: { id: "10", fields: { STAGE_ID: mapeo.etapas.DOCU_RECIBIDA } } },
      { metodo: "crm.timeline.comment.add", parametros: { fields: { ENTITY_ID: 10, ENTITY_TYPE: "deal", COMMENT: "Agente documental: pasa a DOCU RECIBIDA. Recibo verificado y guardado (recibo.pdf)." } } },
    ]);
  });

  it.each(["C19:NEW", "C19:EXECUTING", "C19:WON", "C19:5", ""])("si la negociación está en otra etapa (%s), no la mueve: sólo deja la nota", async (etapa) => {
    const { crm, escrituras } = crmConNegociacionEn(etapa);
    await crm.moverEtapa("10", "DOCU_RECIBIDA", "Recibo verificado y guardado (recibo.pdf).");
    expect(escrituras().map((llamada) => llamada.metodo)).toEqual(["crm.timeline.comment.add"]);
    expect(JSON.stringify(escrituras())).toContain("no se movió de etapa");
  });

  it("una derivación desde otra etapa no la mueve ni agrega notas de más", async () => {
    const { crm, escrituras } = crmConNegociacionEn("C19:5");
    await crm.moverEtapa("10", "REVISION_DOCUMENTAL");
    expect(escrituras()).toEqual([]);
  });
});
