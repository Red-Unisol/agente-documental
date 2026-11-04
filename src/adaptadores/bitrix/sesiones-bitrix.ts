import type { ClienteBitrix } from "./cliente-rest.js";

// Entrar y salir de sesiones de Canales Abiertos que no pasaron por el bot.
//
// Un bot no puede recibir una transferencia (operator.transfer → OPERATOR_WRONG) ni agregarse solo a
// un chat. Lo que sí funciona, probado el 4/11/2026: quien hace las llamadas (el administrador que
// instaló la app) toma el chat, lo transfiere al usuario empleado del agente, se suma como observador,
// agrega el bot con im.chat.user.add (requiere el alcance `im`) y se va. El bot queda adentro con
// acceso al historial y recibe los mensajes siguientes.
export class SesionesDeBitrix {
  constructor(
    private readonly cliente: ClienteBitrix,
    private readonly botId: number,
  ) {}

  // Chats abiertos del canal abierto atados a una negociación.
  async chatsDeNegociacion(negociacionId: string): Promise<string[]> {
    const chats = await this.cliente.llamar<{ CHAT_ID?: number | string; ID?: number | string }[] | Record<string, unknown>>("imopenlines.crm.chat.get", {
      CRM_ENTITY_TYPE: "deal",
      CRM_ENTITY: Number(negociacionId),
      ACTIVE_ONLY: "Y",
    });
    if (!Array.isArray(chats)) return [];
    return chats.map((c) => String(c.CHAT_ID ?? c.ID ?? "")).filter(Boolean);
  }

  async elBotEsta(chatId: string): Promise<boolean> {
    const miembros = await this.cliente.llamar<(number | string)[]>("im.chat.user.list", { CHAT_ID: Number(chatId) });
    return miembros.map(Number).includes(this.botId);
  }

  // Deja el chat en manos del usuario del agente con el bot adentro. Idempotente si el bot ya está.
  async tomarChat(chatId: string, usuarioAgente: number): Promise<"ya estaba" | "tomado"> {
    if (await this.elBotEsta(chatId)) return "ya estaba";
    const chat = { CHAT_ID: Number(chatId) };
    await this.cliente.llamar("imopenlines.session.intercept", chat).catch(() => undefined);
    await this.cliente.llamar("imopenlines.operator.transfer", { ...chat, TRANSFER_ID: usuarioAgente, LEAVE: "Y" });
    await this.cliente.llamar("imopenlines.session.join", chat);
    try {
      await this.cliente.llamar("im.chat.user.add", { ...chat, USERS: [this.botId] });
    } finally {
      await this.cliente.llamar("im.chat.leave", chat).catch(() => undefined);
    }
    return "tomado";
  }

  // El bot se va y el chat queda con esa persona (o en la cola si no hay nadie).
  async soltarChat(chatId: string, aUsuario?: number): Promise<void> {
    if (!(await this.elBotEsta(chatId))) return;
    if (aUsuario) {
      await this.cliente.llamar("imopenlines.bot.session.transfer", { CHAT_ID: Number(chatId), USER_ID: aUsuario, LEAVE: "Y" });
      return;
    }
    await this.cliente.llamar("imopenlines.bot.session.operator", { CHAT_ID: Number(chatId) });
  }
}
