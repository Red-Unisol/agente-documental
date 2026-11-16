import type { ClienteCrm } from "../puertos/cliente-crm.js";
import type { LectorDeRecibo } from "../puertos/lector-de-recibo.js";
import type { ModeloConversacional } from "../puertos/modelo-conversacional.js";
import type { Reloj, RepositorioDeConfiguracion, RepositorioDeConversaciones } from "../puertos/repositorios.js";

export interface Dependencias {
  modelo: ModeloConversacional;
  lector: LectorDeRecibo;
  // Segunda lectura con un modelo más capaz, sólo para los archivos que la primera no dejó aceptar.
  lectorDeRespaldo?: LectorDeRecibo;
  crm: ClienteCrm;
  conversaciones: RepositorioDeConversaciones;
  configuracion: RepositorioDeConfiguracion;
  reloj: Reloj;
}
