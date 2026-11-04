import { appendFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { BotDeBitrix } from "./bot.js";
import { type Anidado, anidar, hoja } from "./formulario.js";

// Página que Bitrix abre al instalar la aplicación: cierra la instalación y nada más.
const HTML_DE_INSTALACION = `<!doctype html><html lang="es"><head><meta charset="utf-8"><script src="//api.bitrix24.com/api/v1/"></script></head>
<body style="font-family:sans-serif;padding:24px">Agente documental: instalación registrada.<script>BX24.init(function(){BX24.installFinish();});</script></body></html>`;

export interface OpcionesDelServidor {
  registrar?: (linea: string) => void;
  // Archivo donde se anexa cada evento crudo (JSON por línea), sin tokens. Sólo para diagnóstico.
  volcarEventosEn?: string | undefined;
}

// Un solo endpoint recibe la instalación y todos los eventos del bot. Responde 200 en
// seguida y procesa después: Bitrix reintenta si el handler tarda.
export function crearServidorDeEventos(bot: BotDeBitrix, opciones: OpcionesDelServidor = {}): Server {
  const registrar = opciones.registrar ?? console.log;
  return createServer(async (peticion, respuesta) => {
    // DOMAIN, PROTOCOL y LANG vienen en la query; el resto en el cuerpo. Se juntan en un solo objeto.
    const consulta = new URL(peticion.url ?? "/", "http://local").searchParams;
    const evento = anidar(new URLSearchParams([...consulta, ...new URLSearchParams(await leerCuerpo(peticion))]));
    const nombre = hoja(evento, "event") || (hoja(evento, "PLACEMENT") ? "APERTURA" : peticion.method ?? "");
    const chat = hoja(evento, "data", "PARAMS", "DIALOG_ID");
    registrar(`${new Date().toISOString()} ${nombre}${chat ? ` ${chat}` : ""} ${peticion.url ?? ""}`);
    if (opciones.volcarEventosEn) appendFileSync(opciones.volcarEventosEn, `${JSON.stringify({ at: new Date().toISOString(), ...sinSecretos(evento) })}\n`);
    respuesta.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(HTML_DE_INSTALACION);
    bot
      .atenderEvento(evento)
      .then((hecho) => hecho && registrar(`  ${chat || nombre}: ${hecho}`))
      .catch((error: unknown) => registrar(`error al atender ${nombre}: ${error instanceof Error ? error.message : String(error)}`));
  });
}

function leerCuerpo(peticion: IncomingMessage): Promise<string> {
  return new Promise((resolver) => {
    let cuerpo = "";
    peticion.on("data", (trozo: Buffer) => (cuerpo += trozo.toString()));
    peticion.on("end", () => resolver(cuerpo));
  });
}

// Los eventos traen tokens del autor (auth, AUTH_ID, REFRESH_ID): no van al volcado.
function sinSecretos(evento: Anidado): Anidado {
  const { auth: _auth, AUTH_ID: _a, REFRESH_ID: _r, ...resto } = evento;
  return resto;
}
