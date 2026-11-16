import type { Ficha, LecturaDeDocumento, Liquidacion, OtroDocumento, Reglas } from "../tipos.js";
import { exclusionAplicable } from "./exclusiones.js";
import { casiElMismoDocumento, documentosLeidos, mismoDocumento } from "./identidad.js";
import { liquidacionAVerificar } from "./liquidacion.js";
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

interface Entrada {
  lectura: LecturaDeDocumento;
  ficha: Ficha;
  reglas: Reglas;
  hoy: Date;
}

interface Contexto {
  liquidacion: Liquidacion;
  ficha: Ficha;
  reglas: Reglas;
  hoy: Date;
}

export function verificarRecibo({ lectura, ficha, reglas, hoy }: Entrada): Verificacion {
  const liquidacion = liquidacionAVerificar(lectura, hoy, reglas.diaDeGracia);
  const pertinencia = chequearPertinencia(lectura, liquidacion);
  if (!liquidacion || !pertinencia.ok) return resolver([pertinencia]);
  const contexto = { liquidacion, ficha, reglas, hoy };
  return resolver([pertinencia, chequearIdentidad(contexto), chequearEmpleador(contexto), chequearPeriodo(contexto), chequearExclusiones(contexto)]);
}

// Cuando el socio mandó varios archivos, vale el que sirve; si ninguno sirve, el resultado del que
// sí era un recibo pesa más que el de los que no lo eran (un DNI suelto no tapa un recibo viejo).
export function verificacionQueDecide<T extends { verificacion: Verificacion }>(revisados: T[]): T | undefined {
  const peso = ({ verificacion }: T): number => {
    if (verificacion.decision === "aceptar") return 3;
    if (verificacion.decision === "derivar") return 2;
    return verificacion.chequeos.some((c) => c.nombre === "pertinencia" && !c.ok) ? 0 : 1;
  };
  return [...revisados].sort((a, b) => peso(b) - peso(a))[0];
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

const NOMBRE_DE_DOCUMENTO: Record<OtroDocumento, string> = {
  dni: "el DNI",
  factura_de_servicio: "la factura de un servicio",
  constancia_bancaria: "una constancia bancaria",
  otro: "otro documento",
};

function chequearPertinencia(lectura: LecturaDeDocumento, liquidacion: Liquidacion | undefined): Chequeo {
  const chequeo = (ok: boolean, detalle: string): Chequeo => ({ nombre: "pertinencia", ok, detalle, siFalla: "pedir_de_nuevo" });
  if (!liquidacion) {
    const visto = lectura.otrosDocumentos.map((documento) => NOMBRE_DE_DOCUMENTO[documento]).join(", ");
    if (visto) return chequeo(false, `El archivo trae ${visto}, pero no el recibo de sueldo`);
    return chequeo(false, lectura.legible ? "El documento no es un recibo de sueldo" : "El archivo no se lee bien");
  }
  if (!lectura.legible) return chequeo(false, "El recibo no se lee bien");
  if (!liquidacion.conHaberes) return chequeo(false, "En el recibo no se ve el detalle de haberes: está cortado o le falta una parte");
  return chequeo(true, lectura.otrosDocumentos.length > 0 ? "El archivo trae el recibo de sueldo junto con otros documentos" : "Es un recibo de sueldo legible y completo");
}

// El recibo es de la persona si alguno de los números que trae (el CUIL o el DNI impreso) es el de la
// ficha. Si no coincide ninguno, hay que distinguir a otra persona de una mala lectura: un CUIL con
// dígito verificador correcto es de otra persona; un número que no se puede validar y difiere en
// uno o dos dígitos del de la ficha es una foto que no se lee bien, y se pide de nuevo.
function chequearIdentidad({ liquidacion, ficha }: Contexto): Chequeo {
  const chequeo = (ok: boolean, detalle: string, siFalla: Chequeo["siFalla"]): Chequeo => ({ nombre: "identidad", ok, detalle, siFalla });
  if (!ficha.dni) return chequeo(false, "La ficha no tiene DNI ni CUIL para comparar con el recibo", "derivar");
  const leidos = documentosLeidos(liquidacion);
  if (leidos.some((leido) => mismoDocumento(leido.numero, ficha.dni))) return chequeo(true, "El documento del recibo corresponde al de la ficha", "derivar");
  if (leidos.some((leido) => leido.tipo === "cuil_valido")) return chequeo(false, "El CUIL del recibo no corresponde al documento de la ficha", "derivar");
  if (leidos.some((leido) => casiElMismoDocumento(leido.numero, ficha.dni))) return chequeo(false, "El número de documento del recibo no se lee bien", "pedir_de_nuevo");
  if (leidos.some((leido) => leido.tipo === "dni")) return chequeo(false, "El DNI del recibo no corresponde al de la ficha", "derivar");
  if (leidos.length > 0) return chequeo(false, "El CUIL del recibo no se leyó completo", "pedir_de_nuevo");
  return chequeo(false, "No se ve el CUIL ni el DNI en el recibo", "pedir_de_nuevo");
}

function chequearEmpleador({ liquidacion, ficha }: Contexto): Chequeo {
  const chequeo = (ok: boolean, detalle: string): Chequeo => ({ nombre: "empleador", ok, detalle, siFalla: "derivar" });
  if (liquidacion.sector !== "desconocido" && liquidacion.sector !== ficha.sectorDeclarado) {
    return chequeo(false, `El recibo es de empleo ${liquidacion.sector} y la ficha declara ${ficha.sectorDeclarado}`);
  }
  if (liquidacion.provincia && ficha.provincia && normalizar(liquidacion.provincia) !== normalizar(ficha.provincia)) {
    return chequeo(false, `El recibo es de ${liquidacion.provincia} y la ficha declara ${ficha.provincia}`);
  }
  if (liquidacion.empleador && ficha.empleadorDeclarado && !compartenAlgunaPalabra(liquidacion.empleador, ficha.empleadorDeclarado)) {
    return chequeo(false, `El empleador del recibo (${liquidacion.empleador}) no coincide con el declarado (${ficha.empleadorDeclarado})`);
  }
  return chequeo(true, ficha.empleadorDeclarado ? "Empleador, sector y provincia coinciden con la ficha" : "Sector y provincia coinciden con la ficha");
}

function chequearPeriodo({ liquidacion, reglas, hoy }: Contexto): Chequeo {
  const admitidos = periodosAdmitidos(hoy, reglas.diaDeGracia).map(nombreDePeriodo).join(" o ");
  const chequeo = (ok: boolean, detalle: string): Chequeo => ({ nombre: "periodo", ok, detalle, siFalla: "pedir_de_nuevo" });
  if (!liquidacion.periodo) return chequeo(false, `No se ve el período del recibo; se necesita el de ${admitidos}`);
  if (!periodoEsAdmitido(liquidacion.periodo, hoy, reglas.diaDeGracia)) {
    return chequeo(false, `El recibo es de ${nombreDePeriodo(liquidacion.periodo)}; se necesita el de ${admitidos}`);
  }
  return chequeo(true, `El período (${nombreDePeriodo(liquidacion.periodo)}) es el admitido`);
}

function chequearExclusiones({ liquidacion, ficha, reglas }: Contexto): Chequeo {
  const exclusion = liquidacion.empleador ? exclusionAplicable(liquidacion.empleador, ficha, reglas.exclusiones) : undefined;
  if (exclusion) return { nombre: "exclusiones", ok: false, detalle: `Empleador excluido por convenio: ${exclusion.motivo}`, siFalla: "derivar" };
  return { nombre: "exclusiones", ok: true, detalle: "El empleador no está excluido para este convenio", siFalla: "derivar" };
}
