import type { Archivo } from "../dominio/conversacion/conversacion.js";
import type { UsoDelModelo } from "../dominio/costos/uso.js";
import type { Ficha, LecturaDeDocumento, Liquidacion, Reglas } from "../dominio/tipos.js";
import { liquidacionAVerificar } from "../dominio/verificacion/liquidacion.js";
import { type Verificacion, verificarRecibo } from "../dominio/verificacion/verificar.js";
import type { LectorDeRecibo } from "../puertos/lector-de-recibo.js";

export interface RevisionDeArchivo {
  lectura: LecturaDeDocumento;
  liquidacion: Liquidacion | undefined;
  verificacion: Verificacion;
  usos: UsoDelModelo[];
  conSegundaLectura: boolean;
}

interface Contexto {
  lector: LectorDeRecibo;
  lectorDeRespaldo?: LectorDeRecibo | undefined;
  ficha: Ficha;
  reglas: Reglas;
  hoy: Date;
}

// Lee un archivo y lo verifica contra la ficha. Si con la primera lectura el recibo no se acepta,
// se lee de nuevo con el modelo de respaldo antes de pedirle algo al socio o de derivarlo: en fotos
// de baja calidad el modelo económico confunde dígitos del CUIL o el año, y una segunda lectura
// cuesta mucho menos que una persona revisando o un socio que tiene que mandar todo otra vez.
export async function revisarArchivo(archivo: Archivo, contexto: Contexto): Promise<RevisionDeArchivo> {
  const primera = await leerYVerificar(archivo, contexto.lector, contexto);
  if (!contexto.lectorDeRespaldo || !mereceSegundaLectura(primera)) return primera;

  const segunda = await leerYVerificar(archivo, contexto.lectorDeRespaldo, contexto).catch(() => undefined);
  if (!segunda) return primera;
  return { ...segunda, usos: [...primera.usos, ...segunda.usos], conSegundaLectura: true };
}

// No se relee lo que ya se aceptó ni lo que se reconoció como otra cosa (un DNI, una factura).
function mereceSegundaLectura({ lectura, verificacion }: RevisionDeArchivo): boolean {
  if (verificacion.decision === "aceptar") return false;
  const esOtraCosa = lectura.liquidaciones.length === 0 && lectura.otrosDocumentos.length > 0;
  return !esOtraCosa;
}

async function leerYVerificar(archivo: Archivo, lector: LectorDeRecibo, { ficha, reglas, hoy }: Contexto): Promise<RevisionDeArchivo> {
  const { lectura, uso } = await lector.leer(archivo);
  return {
    lectura,
    liquidacion: liquidacionAVerificar(lectura, hoy, reglas.diaDeGracia),
    verificacion: verificarRecibo({ lectura, ficha, reglas, hoy }),
    usos: [uso],
    conSegundaLectura: false,
  };
}
