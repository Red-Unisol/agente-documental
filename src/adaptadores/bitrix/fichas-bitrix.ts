import type { Ficha, Sector } from "../../dominio/tipos.js";
import { dniDeCuil, soloDigitos } from "../../dominio/verificacion/identidad.js";
import type { ClienteBitrix } from "./cliente-rest.js";
import type { MapeoDeBitrix } from "./mapeo.js";

export type Negociacion = Record<string, unknown> & { ID: string; CONTACT_ID?: string | null };
export type Enumeraciones = Record<string, Map<string, string>>; // campo → (id del valor → etiqueta)

// Valores de "Sit Laboral" que son sector público (empleo estatal, docencia, fuerzas, salud, pasivos).
const SITUACIONES_DEL_SECTOR_PUBLICO = /p[uú]blic|estatal|municipal|provinc|nacional|docente|polic|jubil|pensio|salud|\bUNC\b|DASPU/i;

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
    return fichaDeNegociacion(negociacion, await this.nombreDelContacto(negociacion), await this.etiquetas(), this.mapeo.campos);
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

// En el embudo real de ventas la ficha llega incompleta: el DNI casi nunca está y el CUIL casi
// siempre; el convenio se completa al acreditar; el empleador casi nunca. La ficha se arma con lo
// que haya, y lo que falta queda vacío para que la verificación no compare contra un dato inventado.
export function fichaDeNegociacion(negociacion: Negociacion, nombre: string, etiquetas: Enumeraciones, campos: MapeoDeBitrix["campos"]): Ficha {
  const situacionLaboral = etiqueta(etiquetas, campos.situacionLaboral, negociacion[campos.situacionLaboral]);
  const empleador = texto(negociacion[campos.empleador]) || texto(negociacion[campos.organismo]);
  return {
    negociacionId: negociacion.ID,
    nombre,
    dni: documentoDe(texto(negociacion[campos.dni]), texto(negociacion[campos.cuil])),
    provincia: etiqueta(etiquetas, campos.provincia, negociacion[campos.provincia]),
    convenio: etiqueta(etiquetas, campos.convenio, negociacion[campos.convenio]) || texto(negociacion[campos.linea]) || "sin informar",
    sectorDeclarado: sectorDeLaSituacionLaboral(situacionLaboral),
    ...(empleador && { empleadorDeclarado: empleador }),
    ...(situacionLaboral && { situacionDeclarada: situacionLaboral }),
  };
}

// El número de documento contra el que se compara el recibo: el DNI si está cargado; si no, el que va adentro del CUIL.
function documentoDe(dni: string, cuil: string): string {
  const delDni = soloDigitos(dni);
  if (Number(delDni) > 0) return delDni;
  const delCuil = soloDigitos(cuil.split(/[.,]/)[0] ?? "");
  return delCuil.length >= 10 && delCuil.length <= 11 ? dniDeCuil(delCuil) : "";
}

function etiqueta(enumeraciones: Enumeraciones, campo: string, valor: unknown): string {
  const crudo = texto(valor);
  return enumeraciones[campo]?.get(crudo) ?? crudo;
}

function texto(valor: unknown): string {
  return valor === null || valor === undefined ? "" : String(valor).trim();
}

export function sectorDeLaSituacionLaboral(situacionLaboral: string): Sector {
  return SITUACIONES_DEL_SECTOR_PUBLICO.test(situacionLaboral) ? "publico" : "privado";
}
