import { z } from "zod";

export const HERRAMIENTA_CARGAR_ESCENARIO = "cargar_escenario";

export const definicionesDeHerramientas = {
  [HERRAMIENTA_CARGAR_ESCENARIO]: {
    descripcion: "Trae las instrucciones completas de un escenario del índice. Usala antes de responder una consulta que encaje en uno.",
    argumentos: z.object({ clave: z.string().describe("Clave del escenario, por ejemplo E3") }),
  },
  revisar_recibo: {
    descripcion: "Lee y verifica lo que mandó el socio y todavía no se revisó (un archivo o varios; el recibo puede venir junto con el DNI u otros documentos) y aplica el resultado: si sirve, lo carga en el sistema; si hay una discrepancia, deriva a un analista; si falta algo, te dice qué. Vos sólo comunicás el resultado.",
    argumentos: z.object({}),
  },
  marcar_falta_documentacion: {
    descripcion: "Marca la negociación como FALTA DOCUMENTACION sólo cuando el socio dice con sus palabras que no puede mandar el recibo ahora (lo manda otro día, no lo tiene, lo tiene otra persona). Que pregunte qué es o de dónde se baja, o que avise que lo está mandando, NO es motivo para marcarla.",
    argumentos: z.object({ motivo: z.string() }),
  },
  derivar: {
    descripcion: "Pasa la conversación a una persona de Red Unisol con el motivo. Después de derivar, no volvés a escribir en esta conversación.",
    argumentos: z.object({ motivo: z.string(), destino: z.enum(["vendedor", "analista"]) }),
  },
} as const;

export type NombreDeHerramienta = keyof typeof definicionesDeHerramientas;

export type ArgumentosDe<N extends NombreDeHerramienta> = z.infer<(typeof definicionesDeHerramientas)[N]["argumentos"]>;

export const nombresDeHerramientas = Object.keys(definicionesDeHerramientas) as NombreDeHerramienta[];

export function esNombreDeHerramienta(nombre: string): nombre is NombreDeHerramienta {
  return nombre in definicionesDeHerramientas;
}
