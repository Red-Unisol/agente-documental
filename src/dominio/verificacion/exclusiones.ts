import type { Exclusion } from "../tipos.js";
import { normalizar } from "./texto.js";

export function exclusionAplicable(empleador: string, convenio: string, exclusiones: Exclusion[]): Exclusion | undefined {
  const texto = normalizar(empleador);
  return exclusiones.find(
    (exclusion) => (exclusion.convenio === null || exclusion.convenio === convenio) && new RegExp(exclusion.patron, "i").test(texto),
  );
}
