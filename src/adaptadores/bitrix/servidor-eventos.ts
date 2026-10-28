import { createServer, type IncomingMessage, type Server } from "node:http";
import type { BotDeBitrix } from "./bot.js";
import { anidar, hoja } from "./formulario.js";

// Página que Bitrix abre al instalar la aplicación: cierra la instalación y nada más.
const HTML_DE_INSTALACION = `<!doctype html><html lang="es"><head><meta charset="utf-8"><script src="//api.bitrix24.com/api/v1/"></script></head>
<body style="font-family:sans-serif;padding:24px">Agente documental: instalación registrada.<script>BX24.init(function(){BX24.installFinish();});</script></body></html>`;

// Un solo endpoint recibe la instalación y todos los eventos del bot. Responde 200 en
// seguida y procesa después: Bitrix reintenta si el handler tarda.
export function crearServidorDeEventos(bot: BotDeBitrix, registrar: (linea: string) => void = console.log): Server {
  return createServer(async (peticion, respuesta) => {
    const cuerpo = await leerCuerpo(peticion);
    const evento = anidar(new URLSearchParams(cuerpo));
    const nombre = hoja(evento, "event") || (hoja(evento, "PLACEMENT") ? "INSTALACION" : peticion.method ?? "");
    registrar(`${new Date().toISOString()} ${nombre} ${peticion.url ?? ""}`);
    respuesta.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(HTML_DE_INSTALACION);
    bot.atenderEvento(evento).catch((error: unknown) => registrar(`error al atender ${nombre}: ${error instanceof Error ? error.message : String(error)}`));
  });
}

function leerCuerpo(peticion: IncomingMessage): Promise<string> {
  return new Promise((resolver) => {
    let cuerpo = "";
    peticion.on("data", (trozo: Buffer) => (cuerpo += trozo.toString()));
    peticion.on("end", () => resolver(cuerpo));
  });
}
