import type { Etapa } from "../../dominio/conversacion/conversacion.js";
import type { DestinoDeDerivacion } from "../../puertos/cliente-crm.js";

// Cómo se llaman las cosas en el portal de Red Unisol: etapas del embudo, campos de la
// negociación y a quién se transfiere el chat. Son datos del portal, no reglas del agente;
// cambiar de embudo (prueba → producción) es cambiar este mapeo.
export interface MapeoDeBitrix {
  embudo: number;
  etapas: Record<Etapa, string>;
  campos: {
    recibo: string;
    dni: string;
    cuil: string; // en el embudo real el DNI casi nunca está cargado y el CUIL casi siempre
    provincia: string;
    convenio: string; // la mutual (Celesol, Fiat, Amejuca...); se completa recién al acreditar
    linea: string; // texto libre: "AMEJUCA Premium", "Caja Nuevo"... sirve cuando el convenio todavía está vacío
    situacionLaboral: string; // lista: Empleado Publico Provincial, Docente, Jubilado, Empleado Privado...
    empleador: string;
    organismo: string;
  };
  usuariosDeDerivacion: Record<DestinoDeDerivacion, number>;
}

// Embudo 19 · VENTAS · PRUEBA PULSO (copia del real, creado el 21/10).
export function mapeoDelEmbudoDePrueba(usuarioDePrueba: number): MapeoDeBitrix {
  return {
    embudo: 19,
    etapas: {
      DOCUMENTACION: "C19:UC_53P7WJ",
      REVISION_DOCUMENTAL: "C19:REVISION_DOC",
      DOCU_RECIBIDA: "C19:UC_TJIFLR",
      FALTA_DOCUMENTACION: "C19:UC_D4N3Y4",
    },
    campos: {
      recibo: "UF_CRM_1692197958",
      dni: "UF_CRM_6601C9A69747F",
      cuil: "UF_CRM_64FF4F9B5C195",
      provincia: "UF_CRM_1684346013612",
      convenio: "UF_CRM_1685450067166",
      linea: "UF_CRM_659EBB0445E8E",
      situacionLaboral: "UF_CRM_662B9D2685477",
      empleador: "UF_CRM_6A43D31EBC847",
      organismo: "UF_CRM_WA_ORGANISMO",
    },
    usuariosDeDerivacion: { vendedor: usuarioDePrueba, analista: usuarioDePrueba },
  };
}
