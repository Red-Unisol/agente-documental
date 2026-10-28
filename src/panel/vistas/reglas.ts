import type { Reglas } from "../../dominio/tipos.js";
import { nombreDePeriodo, periodosAdmitidos } from "../../dominio/verificacion/periodo.js";
import { chip, escapar, type Html } from "../html.js";
import { seccionHtml } from "./plantilla.js";

export function vistaDeReglas(reglas: Reglas, hoy: Date): Html {
  const admitidos = periodosAdmitidos(hoy, reglas.diaDeGracia).map(nombreDePeriodo).join(" o ");
  const exclusiones = reglas.exclusiones
    .map((x) => `<tr><td>${x.convenio ? escapar(x.convenio) : "Todos"}</td><td class="cod">${escapar(x.patron)}</td><td>${escapar(x.motivo)}</td><td>${chip("violeta", "derivar")}</td></tr>`)
    .join("");
  return `
  <div class="bloque">
    ${seccionHtml("A", "Los cinco chequeos, en orden", "en código, no en el prompt")}
    <div class="celdas">
      <div><b>01</b><strong>Pertinencia</strong>Es un recibo de sueldo, legible, con período, empleador, CUIL y haberes visibles. Si falta algo: pedir de nuevo con el motivo.</div>
      <div><b>02</b><strong>Identidad</strong>El CUIL del recibo es válido (dígito verificador) y corresponde al DNI de la ficha. Si no corresponde: derivar.</div>
      <div><b>03</b><strong>Empleador</strong>Sector, provincia y nombre del empleador coinciden con lo declarado. Cualquier discrepancia: derivar.</div>
      <div><b>04</b><strong>Período</strong>El mes del recibo es el anterior al actual; hasta el día de gracia también se admite el de dos meses atrás.</div>
      <div><b>05</b><strong>Exclusiones</strong>El empleador no está en la lista de excluidos del convenio. Si está: derivar, sin decirle el motivo al socio.</div>
    </div>
    <p class="nota">Prioridad de la decisión: ${chip("violeta", "derivar")} si falla identidad, empleador o exclusiones · ${chip("alerta", "pedir de nuevo")} si falla pertinencia o período · ${chip("ok", "aceptar")} si pasa todo. La acción en el CRM la ejecuta el sistema. El modelo no recibe el DNI ni compara el CUIL.</p>
  </div>
  <div class="dos iguales">
    <div class="bloque">
      ${seccionHtml("B", "Período admitido")}
      <div class="campo"><label>Regla</label><div class="valor">El mes anterior al actual (N-1).</div></div>
      <div class="campo"><label>Día de gracia</label><div class="valor">Hasta el día <b>${reglas.diaDeGracia}</b> de cada mes también se acepta el de dos meses atrás (N-2), porque muchos empleadores liquidan tarde.</div></div>
      <div class="campo"><label>Hoy, ${hoy.toLocaleDateString("es-AR")}, se acepta</label><div class="valor"><b>${escapar(admitidos)}</b></div></div>
    </div>
    <div class="bloque">
      ${seccionHtml("C", "Exclusiones por convenio", `${reglas.exclusiones.length} cargadas`)}
      <div class="panel tabla-caja"><table><thead><tr><th>Convenio</th><th>Si el empleador contiene</th><th>Motivo</th><th></th></tr></thead><tbody>${exclusiones}</tbody></table></div>
      <p class="nota">Se completan con los manuales por provincia que aporte Red Unisol. Cada exclusión nueva es una fila, no un cambio en el prompt.</p>
    </div>
  </div>`;
}
