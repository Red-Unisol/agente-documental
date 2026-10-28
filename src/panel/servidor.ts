import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { configuracionInicial } from "../aplicacion/configuracion-inicial.js";
import type { Ficha } from "../dominio/tipos.js";
import { leerCorridas } from "./datos.js";
import type { Html } from "./html.js";
import { vistaDeConversaciones } from "./vistas/conversaciones.js";
import { vistaDeEscenarios } from "./vistas/escenarios.js";
import { vistaDeEvals } from "./vistas/evals.js";
import { vistaDeModelos } from "./vistas/modelos.js";
import { type Entorno, pagina, type Seccion } from "./vistas/plantilla.js";
import { vistaDelPrompt } from "./vistas/prompt.js";
import { vistaDeReglas } from "./vistas/reglas.js";

const PUERTO = Number(process.env.PANEL_PUERTO ?? 3011);

const SECCIONES: Seccion[] = ["conversaciones", "prompt", "escenarios", "reglas", "evals", "modelos"];

// Ficha ficticia para mostrar el prompt completo tal como lo recibe el modelo.
const FICHA_DE_EJEMPLO: Ficha = {
  negociacionId: "EJEMPLO",
  nombre: "Mariana",
  dni: "00000000",
  provincia: "Catamarca",
  convenio: "EMPLEADOS_PUBLICOS_CATAMARCA",
  sectorDeclarado: "publico",
  empleadorDeclarado: "Ministerio de Educación de Catamarca",
};

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
  const hoy = new Date();
  const contadores = {
    conversaciones: ultima ? String(ultima.total.casos) : undefined,
    escenarios: String(configuracion.escenarios.length),
    evals: ultima ? `${ultima.total.pasaron}/${ultima.total.casos}` : undefined,
    modelos: String(new Set(corridas.map((c) => `${c.modelos.conversacion}+${c.modelos.lectura}`)).size),
  };
  const entorno: Entorno = {
    modo: "Simulación local",
    embudo: "Bitrix · embudo de prueba 19",
    modelos: ultima ? `${ultima.modelos.conversacion} · ${ultima.modelos.lectura}` : "sin corridas",
  };

  switch (seccion) {
    case "conversaciones": {
      const vista = vistaDeConversaciones(ultima, parametros.get("caso") ?? undefined);
      return pagina({ seccion, titulo: "Conversaciones", subtitulo: vista.subtitulo, cuerpo: vista.cuerpo, contadores }, entorno);
    }
    case "prompt":
      return pagina(
        {
          seccion,
          titulo: "Prompt base",
          subtitulo: "Lo que el agente sabe antes de leer el primer mensaje. Es corto a propósito: lo específico de cada situación vive en los escenarios y entra sólo cuando hace falta.",
          cuerpo: vistaDelPrompt({ bloques: configuracion.bloques, escenarios: configuracion.escenarios, fichaDeEjemplo: FICHA_DE_EJEMPLO, hoy, diaDeGracia: configuracion.reglas.diaDeGracia }),
          contadores,
        },
        entorno,
      );
    case "escenarios":
      return pagina(
        {
          seccion,
          titulo: "Escenarios",
          subtitulo: "Las situaciones que el agente sabe atender. En cada mensaje elige una del índice y carga sólo esa: el resto no ocupa contexto.",
          cuerpo: vistaDeEscenarios(configuracion.escenarios, ultima, parametros.get("clave") ?? undefined),
          contadores,
        },
        entorno,
      );
    case "reglas":
      return pagina(
        {
          seccion,
          titulo: "Reglas de verificación",
          subtitulo: "Lo que decide el sistema con el recibo en la mano. Son datos y código, no texto del prompt: el modelo no participa.",
          cuerpo: vistaDeReglas(configuracion.reglas, hoy),
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
