import type { Exclusion, Ficha } from "../tipos.js";
import { normalizar } from "./texto.js";

export function exclusionAplicable(empleador: string, ficha: Pick<Ficha, "convenio" | "provincia">, exclusiones: Exclusion[]): Exclusion | undefined {
  const texto = normalizar(empleador);
  return exclusiones.find((exclusion) => aplicaA(exclusion, ficha) && new RegExp(exclusion.patron, "i").test(texto));
}

function aplicaA(exclusion: Exclusion, ficha: Pick<Ficha, "convenio" | "provincia">): boolean {
  const porConvenio = exclusion.convenio ? new RegExp(exclusion.convenio, "i").test(normalizar(ficha.convenio)) : false;
  const porProvincia = exclusion.provincia ? new RegExp(exclusion.provincia, "i").test(normalizar(ficha.provincia)) : false;
  const general = !exclusion.convenio && !exclusion.provincia;
  return general || porConvenio || porProvincia;
}
