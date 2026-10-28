import type { Ficha, LecturaDeRecibo, Reglas } from "../tipos.js";
import { exclusionAplicable } from "./exclusiones.js";
import { cuilCorrespondeADni, cuilEsValido } from "./identidad.js";
import { nombreDePeriodo, periodoEsAdmitido, periodosAdmitidos } from "./periodo.js";
import { compartenAlgunaPalabra, normalizar } from "./texto.js";

export type Decision = "aceptar" | "pedir_de_nuevo" | "derivar";

export type NombreDeChequeo = "pertinencia" | "identidad" | "empleador" | "periodo" | "exclusiones";

export interface Chequeo {
  nombre: NombreDeChequeo;
  ok: boolean;
  detalle: string;
  siFalla: Exclude<Decision, "aceptar">;
}

export interface Verificacion {
  decision: Decision;
  chequeos: Chequeo[];
  motivos: string[];
}

interface Contexto {
  lectura: LecturaDeRecibo;
  ficha: Ficha;
  reglas: Reglas;
  hoy: Date;
}

export function verificarRecibo(contexto: Contexto): Verificacion {
  const pertinencia = chequearPertinencia(contexto.lectura);
  if (!pertinencia.ok) return resolver([pertinencia]);
  return resolver([
    pertinencia,
    chequearIdentidad(contexto),
    chequearEmpleador(contexto),
    chequearPeriodo(contexto),
    chequearExclusiones(contexto),
  ]);
}

function resolver(chequeos: Chequeo[]): Verificacion {
  const fallidos = chequeos.filter((chequeo) => !chequeo.ok);
  const decision: Decision = fallidos.some((c) => c.siFalla === "derivar")
    ? "derivar"
    : fallidos.length > 0
      ? "pedir_de_nuevo"
      : "aceptar";
  return { decision, chequeos, motivos: fallidos.map((c) => c.detalle) };
}

function chequearPertinencia(lectura: LecturaDeRecibo): Chequeo {
  const chequeo = (ok: boolean, detalle: string): Chequeo => ({ nombre: "pertinencia", ok, detalle, siFalla: "pedir_de_nuevo" });
  if (!lectura.esReciboDeSueldo) return chequeo(false, "El documento no es un recibo de sueldo");
  if (!lectura.legible) return chequeo(false, "El recibo no se lee bien");
  if (lectura.faltantes.length > 0) return chequeo(false, `Al recibo le falta: ${lectura.faltantes.join(", ")}`);
  return chequeo(true, "Es un recibo de sueldo legible y completo");
}

function chequearIdentidad({ lectura, ficha }: Contexto): Chequeo {
  if (!lectura.cuil) return { nombre: "identidad", ok: false, detalle: "No se ve el CUIL en el recibo", siFalla: "pedir_de_nuevo" };
  if (!cuilEsValido(lectura.cuil)) return { nombre: "identidad", ok: false, detalle: "El CUIL del recibo no se leyó completo", siFalla: "pedir_de_nuevo" };
  if (!cuilCorrespondeADni(lectura.cuil, ficha.dni)) return { nombre: "identidad", ok: false, detalle: "El CUIL del recibo no corresponde al DNI de la ficha", siFalla: "derivar" };
  return { nombre: "identidad", ok: true, detalle: "El CUIL del recibo corresponde al DNI de la ficha", siFalla: "derivar" };
}

function chequearEmpleador({ lectura, ficha }: Contexto): Chequeo {
  const chequeo = (ok: boolean, detalle: string): Chequeo => ({ nombre: "empleador", ok, detalle, siFalla: "derivar" });
  if (lectura.sector !== "desconocido" && lectura.sector !== ficha.sectorDeclarado) {
    return chequeo(false, `El recibo es de empleo ${lectura.sector} y la ficha declara ${ficha.sectorDeclarado}`);
  }
  if (lectura.provincia && normalizar(lectura.provincia) !== normalizar(ficha.provincia)) {
    return chequeo(false, `El recibo es de ${lectura.provincia} y la ficha declara ${ficha.provincia}`);
  }
  if (lectura.empleador && ficha.empleadorDeclarado && !compartenAlgunaPalabra(lectura.empleador, ficha.empleadorDeclarado)) {
    return chequeo(false, `El empleador del recibo (${lectura.empleador}) no coincide con el declarado (${ficha.empleadorDeclarado})`);
  }
  return chequeo(true, "Empleador, sector y provincia coinciden con la ficha");
}

function chequearPeriodo({ lectura, reglas, hoy }: Contexto): Chequeo {
  const admitidos = periodosAdmitidos(hoy, reglas.diaDeGracia).map(nombreDePeriodo).join(" o ");
  const chequeo = (ok: boolean, detalle: string): Chequeo => ({ nombre: "periodo", ok, detalle, siFalla: "pedir_de_nuevo" });
  if (!lectura.periodo) return chequeo(false, `No se ve el período del recibo; se necesita el de ${admitidos}`);
  if (!periodoEsAdmitido(lectura.periodo, hoy, reglas.diaDeGracia)) {
    return chequeo(false, `El recibo es de ${nombreDePeriodo(lectura.periodo)}; se necesita el de ${admitidos}`);
  }
  return chequeo(true, `El período (${nombreDePeriodo(lectura.periodo)}) es el admitido`);
}

function chequearExclusiones({ lectura, ficha, reglas }: Contexto): Chequeo {
  const exclusion = lectura.empleador ? exclusionAplicable(lectura.empleador, ficha.convenio, reglas.exclusiones) : undefined;
  if (exclusion) return { nombre: "exclusiones", ok: false, detalle: `Empleador excluido por convenio: ${exclusion.motivo}`, siFalla: "derivar" };
  return { nombre: "exclusiones", ok: true, detalle: "El empleador no está excluido para este convenio", siFalla: "derivar" };
}
