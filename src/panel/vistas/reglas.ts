import type { Reglas } from "../../dominio/tipos.js";
import { nombreDePeriodo, periodosAdmitidos } from "../../dominio/verificacion/periodo.js";
import { chip, escapar, type Html } from "../html.js";

export function vistaDeReglas(reglas: Reglas, hoy: Date): Html {
  const admitidos = periodosAdmitidos(hoy, reglas.diaDeGracia).map(nombreDePeriodo).join(" o ");
  const exclusiones = reglas.exclusiones
    .map((x) => `<tr><td>${x.convenio ? escapar(x.convenio) : "Todos"}</td><td class="mono">${escapar(x.patron)}</td><td>${escapar(x.motivo)}</td><td>${chip("violeta", "derivar")}</td></tr>`)
    .join("");
  return `<div class="dos iguales">
    <div class="tarjeta">
      <h3>Período admitido</h3>
      <label>Mes del recibo respecto del mes en curso</label><div class="campo">El mes anterior (N-1).</div>
      <label>Día de gracia: hasta este día del mes también se acepta el de dos meses atrás (N-2)</label><div class="campo">${reglas.diaDeGracia}</div>
      <label>Hoy ${hoy.toLocaleDateString("es-AR")} se acepta</label><div class="campo">${escapar(admitidos)}</div>
      <h3 style="margin-top:18px">Identidad</h3>
      <div class="campo">El CUIL del recibo tiene que ser válido (dígito verificador) y corresponder al DNI de la ficha. Si no se lee → pedir de nuevo. Si no corresponde → derivar a analista. El modelo no recibe ni compara estos datos: lo hace el código.</div>
      <h3 style="margin-top:18px">Pertinencia</h3>
      <div class="campo">Tiene que ser un recibo de sueldo, legible y con período, empleador, CUIL y haberes visibles. Si algo falta → pedir de nuevo con el motivo concreto.</div>
    </div>
    <div class="tarjeta">
      <h3>Exclusiones por convenio</h3>
      <table><thead><tr><th>Convenio</th><th>Si el empleador contiene</th><th>Motivo</th><th></th></tr></thead><tbody>${exclusiones}</tbody></table>
      <p class="nota">Se completan con los manuales por provincia que aporte Red Unisol.</p>
      <h3 style="margin-top:18px">Empleador</h3>
      <div class="campo">Se comparan sector (público/privado), provincia y nombre del empleador contra la ficha. Cualquier discrepancia → derivar a analista. El agente nunca rechaza solo.</div>
      <h3 style="margin-top:18px">Prioridad de la decisión</h3>
      <div class="campo">${chip("violeta", "derivar")} si falla identidad, empleador o exclusiones · ${chip("alerta", "pedir de nuevo")} si falla pertinencia o período · ${chip("ok", "aceptar")} si pasa todo. La acción en el CRM la ejecuta el sistema, no el modelo.</div>
    </div>
  </div>`;
}
