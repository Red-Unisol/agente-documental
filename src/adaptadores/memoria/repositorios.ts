import type { Conversacion } from "../../dominio/conversacion/conversacion.js";
import type { ConfiguracionDelAgente, Reloj, RepositorioDeConfiguracion, RepositorioDeConversaciones } from "../../puertos/repositorios.js";

export class ConversacionesEnMemoria implements RepositorioDeConversaciones {
  private readonly porId = new Map<string, Conversacion>();

  async obtener(id: string): Promise<Conversacion | undefined> {
    return this.porId.get(id);
  }

  async guardar(conversacion: Conversacion): Promise<void> {
    this.porId.set(conversacion.id, conversacion);
  }
}

export class ConfiguracionEnMemoria implements RepositorioDeConfiguracion {
  constructor(private readonly configuracion: ConfiguracionDelAgente) {}

  async obtener(): Promise<ConfiguracionDelAgente> {
    return this.configuracion;
  }
}

export class RelojDelSistema implements Reloj {
  ahora(): Date {
    return new Date();
  }
}

export class RelojFijo implements Reloj {
  constructor(private readonly fecha: Date) {}

  ahora(): Date {
    return this.fecha;
  }
}
