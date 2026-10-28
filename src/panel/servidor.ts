import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { configuracionInicial } from "../aplicacion/configuracion-inicial.js";
import { leerCorridas } from "./datos.js";
import type { Html } from "./html.js";
import { vistaDeConversaciones } from "./vistas/conversaciones.js";
import { vistaDeEscenarios } from "./vistas/escenarios.js";
import { vistaDeEvals } from "./vistas/evals.js";
import { vistaDeModelos } from "./vistas/modelos.js";
import { pagina, type Seccion } from "./vistas/plantilla.js";
import { vistaDeReglas } from "./vistas/reglas.js";

const PUERTO = Number(process.env.PANEL_PUERTO ?? 3011);

const SECCIONES: Seccion[] = ["conversaciones", "escenarios", "reglas", "evals", "modelos"];

async function atender(peticion: IncomingMessage, respuesta: ServerResponse): Promise<void> {
  const url = new URL(peticion.url ?? "/", `http://localhost:${PUERTO}`);
  const seccion = url.pathname.slice(1);
  if (!esSeccion(seccion)) return redirigir(respuesta, "/conversaciones");
  const html = await renderizar(seccion, url.searchParams);
  respuesta.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
}

async function renderizar(seccion: Seccion, parametros: URLSearchParams): Promise<Html> {
  const corridas = await leerCorridas();
  const ultima = corridas[0];
  const configuracion = configuracionInicial;
  const contadores = {
    conversaciones: ultima ? String(ultima.total.casos) : undefined,
    escenarios: String(configuracion.escenarios.length),
    evals: ultima ? `${ultima.total.pasaron}/${ultima.total.casos}` : undefined,
    modelos: String(new Set(corridas.map((c) => `${c.modelos.conversacion}+${c.modelos.lectura}`)).size),
  };
  const entorno = {
    modo: "SIMULACIÓN LOCAL",
    embudo: "Bitrix: embudo de prueba 19",
    modelos: ultima ? `${ultima.modelos.conversacion} · ${ultima.modelos.lectura}` : "sin corridas",
  };

  switch (seccion) {
    case "conversaciones": {
      const vista = vistaDeConversaciones(ultima, parametros.get("caso") ?? undefined);
      return pagina({ seccion, titulo: "Conversaciones", subtitulo: vista.subtitulo, cuerpo: vista.cuerpo, contadores }, entorno);
    }
    case "escenarios":
      return pagina(
        {
          seccion,
          titulo: "Escenarios",
          subtitulo: "Lo que el agente sabe hacer. En cada mensaje elige uno del índice y carga sólo ese: el resto no ocupa contexto.",
          cuerpo: vistaDeEscenarios(configuracion.escenarios, configuracion.bloques, ultima, parametros.get("clave") ?? undefined),
          contadores,
        },
        entorno,
      );
    case "reglas":
      return pagina(
        {
          seccion,
          titulo: "Reglas de verificación",
          subtitulo: "Lo que decide el sistema con el recibo en la mano. Son datos, no texto del prompt.",
          cuerpo: vistaDeReglas(configuracion.reglas, new Date()),
          contadores,
        },
        entorno,
      );
    case "evals": {
      const vista = vistaDeEvals(corridas, parametros.get("corrida") ?? undefined);
      return pagina({ seccion, titulo: "Evals", subtitulo: vista.subtitulo, cuerpo: vista.cuerpo, contadores }, entorno);
    }
    case "modelos":
      return pagina(
        {
          seccion,
          titulo: "Modelos y costos",
          subtitulo: "Qué modelo usa el agente, cuánto cuesta cada conversación y cómo rinde cada alternativa sobre los mismos evals.",
          cuerpo: vistaDeModelos(corridas),
          contadores,
        },
        entorno,
      );
  }
}

function esSeccion(valor: string): valor is Seccion {
  return (SECCIONES as string[]).includes(valor);
}

function redirigir(respuesta: ServerResponse, destino: string): void {
  respuesta.writeHead(302, { location: destino }).end();
}

createServer((peticion, respuesta) => {
  atender(peticion, respuesta).catch((error: unknown) => {
    console.error(error);
    respuesta.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end("Error en el panel");
  });
}).listen(PUERTO, () => console.log(`Panel en http://localhost:${PUERTO}`));
