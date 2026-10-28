import type { Ficha, Sector } from "../../dominio/tipos.js";
import type { ClienteBitrix } from "./cliente-rest.js";
import type { MapeoDeBitrix } from "./mapeo.js";

type Negociacion = Record<string, unknown> & { ID: string; CONTACT_ID?: string | null };
type Enumeraciones = Record<string, Map<string, string>>; // campo → (id del valor → etiqueta)

const CONVENIOS_DEL_SECTOR_PUBLICO = /p[uú]blic|estatal|municipal|provinc|docente|polic|jubil|pasiv|ministerio/i;

// Arma la ficha que conoce el agente a partir de la negociación de Bitrix. El DNI entra
// a la ficha porque lo compara el código; el prompt nunca lo incluye.
export class FichasDesdeBitrix {
  private enumeraciones: Enumeraciones | undefined;

  constructor(
    private readonly cliente: ClienteBitrix,
    private readonly mapeo: MapeoDeBitrix,
  ) {}

  async deNegociacion(negociacionId: string): Promise<Ficha> {
    const negociacion = await this.cliente.llamar<Negociacion>("crm.deal.get", { id: negociacionId });
    const etiquetas = await this.etiquetas();
    const nombre = await this.nombreDelContacto(negociacion);
    const convenio = etiqueta(etiquetas, this.mapeo.campos.convenio, negociacion[this.mapeo.campos.convenio]);
    const empleador = texto(negociacion[this.mapeo.campos.empleador]) || texto(negociacion[this.mapeo.campos.organismo]);
    return {
      negociacionId: negociacion.ID,
      nombre,
      dni: texto(negociacion[this.mapeo.campos.dni]).replace(/\D/g, ""),
      provincia: etiqueta(etiquetas, this.mapeo.campos.provincia, negociacion[this.mapeo.campos.provincia]),
      convenio,
      sectorDeclarado: sectorDelConvenio(convenio),
      empleadorDeclarado: empleador || "sin informar",
    };
  }

  private async nombreDelContacto(negociacion: Negociacion): Promise<string> {
    if (!negociacion.CONTACT_ID) return texto(negociacion.TITLE) || "socio";
    const contacto = await this.cliente.llamar<{ NAME?: string }>("crm.contact.get", { id: negociacion.CONTACT_ID });
    return texto(contacto.NAME) || "socio";
  }

  // Los campos de lista guardan el id del valor; la etiqueta viene con la definición del campo.
  private async etiquetas(): Promise<Enumeraciones> {
    if (this.enumeraciones) return this.enumeraciones;
    const campos = await this.cliente.llamar<Record<string, { type: string; items?: { ID: string; VALUE: string }[] }>>("crm.deal.fields");
    this.enumeraciones = Object.fromEntries(
      Object.entries(campos)
        .filter(([, definicion]) => definicion.type === "enumeration")
        .map(([codigo, definicion]) => [codigo, new Map((definicion.items ?? []).map((item) => [item.ID, item.VALUE]))]),
    );
    return this.enumeraciones;
  }
}

function etiqueta(enumeraciones: Enumeraciones, campo: string, valor: unknown): string {
  const crudo = texto(valor);
  return enumeraciones[campo]?.get(crudo) ?? crudo;
}

function texto(valor: unknown): string {
  return valor === null || valor === undefined ? "" : String(valor).trim();
}

export function sectorDelConvenio(convenio: string): Sector {
  return CONVENIOS_DEL_SECTOR_PUBLICO.test(convenio) ? "publico" : "privado";
}
