import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { z } from "zod";
import { iniciarSimulacion, type Simulacion } from "./simulacion.js";
import { transcripcionEnMarkdown } from "./transcripcion.js";

const esquemaDeGuion = z.object({
  nombre: z.string(),
  hoy: z.string().optional(),
  ficha: z.object({
    negociacionId: z.string(),
    nombre: z.string(),
    dni: z.string(),
    provincia: z.string(),
    convenio: z.string(),
    sectorDeclarado: z.enum(["publico", "privado"]),
    empleadorDeclarado: z.string(),
    situacionDeclarada: z.string().optional(),
  }),
  negociacion: z.object({ hayQuePedirElRecibo: z.boolean().default(true), datos: z.array(z.object({ etiqueta: z.string(), valor: z.string() })).default([]) }).optional(),
  turnos: z.array(z.object({ texto: z.string(), archivo: z.string().optional() })),
});

const fichaPorDefecto = {
  negociacionId: "SIM-1",
  nombre: "Mariana",
  dni: "12345678",
  provincia: "Catamarca",
  convenio: "EMPLEADOS_PUBLICOS_CATAMARCA",
  sectorDeclarado: "publico" as const,
  empleadorDeclarado: "Ministerio de Educación de Catamarca",
};

async function main(): Promise<void> {
  const argumentos = new Map(process.argv.slice(2).map((arg, i, todos) => [arg, todos[i + 1] ?? ""]));
  const rutaDeGuion = argumentos.get("--guion");
  if (rutaDeGuion) return correrGuion(rutaDeGuion, argumentos.get("--salida"));
  return conversarPorConsola();
}

async function correrGuion(ruta: string, salida?: string): Promise<void> {
  const guion = esquemaDeGuion.parse(JSON.parse(await readFile(ruta, "utf8")));
  const { situacionDeclarada, ...resto } = guion.ficha;
  const ficha = { ...resto, ...(situacionDeclarada && { situacionDeclarada }) };
  const simulacion = await iniciarSimulacion(ficha, guion.hoy ? new Date(`${guion.hoy}T12:00:00`) : undefined, guion.negociacion);
  for (const turno of guion.turnos) {
    imprimir("Socio", turno.archivo ? `${turno.texto} 📎 ${turno.archivo}` : turno.texto);
    const resultado = await simulacion.enviar(turno.texto, turno.archivo);
    imprimir("Agente", resultado.tipo === "respondio" ? resultado.texto : `(silencio: ${resultado.motivo})`);
  }
  const transcripcion = transcripcionEnMarkdown(guion.nombre, await simulacion.conversacion(), simulacion.crm.acciones);
  if (salida) await writeFile(salida, transcripcion);
  else console.log(`\n${transcripcion}`);
}

async function conversarPorConsola(): Promise<void> {
  const simulacion = await iniciarSimulacion(fichaPorDefecto);
  const consola = createInterface({ input: process.stdin, output: process.stdout });
  console.log("Simulación local. Escribí como el socio. `/archivo <ruta>` adjunta un recibo, `/auditoria` muestra lo que hizo el agente, `/salir` termina.\n");
  for (;;) {
    const linea = (await consola.question("Socio: ")).trim();
    if (linea === "/salir") break;
    if (linea === "/auditoria") {
      console.log(transcripcionEnMarkdown("Auditoría", await simulacion.conversacion(), simulacion.crm.acciones));
      continue;
    }
    await enviarDesdeConsola(simulacion, linea);
  }
  consola.close();
}

async function enviarDesdeConsola(simulacion: Simulacion, linea: string): Promise<void> {
  const esArchivo = linea.startsWith("/archivo ");
  const ruta = esArchivo ? linea.slice("/archivo ".length).trim() : undefined;
  const resultado = await simulacion.enviar(esArchivo ? "Te mando el recibo" : linea, ruta);
  imprimir("Agente", resultado.tipo === "respondio" ? resultado.texto : `(silencio: ${resultado.motivo})`);
}

function imprimir(quien: string, texto: string): void {
  console.log(`${quien}: ${texto}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
