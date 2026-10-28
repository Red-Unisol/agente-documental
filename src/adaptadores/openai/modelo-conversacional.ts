import type OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { definicionesDeHerramientas, type NombreDeHerramienta } from "../../dominio/agente/herramientas.js";
import type { MensajeParaElModelo, ModeloConversacional, PeticionAlModelo, RespuestaDelModelo } from "../../puertos/modelo-conversacional.js";
import { esquemaJsonDe } from "./cliente.js";

export class ModeloConversacionalOpenAI implements ModeloConversacional {
  constructor(
    private readonly cliente: OpenAI,
    private readonly modelo: string,
  ) {}

  async completar(peticion: PeticionAlModelo): Promise<RespuestaDelModelo> {
    const respuesta = await this.cliente.chat.completions.create({
      model: this.modelo,
      temperature: 0.3,
      messages: [{ role: "system", content: peticion.sistema }, ...peticion.mensajes.map(aMensajeDeOpenAI)],
      tools: peticion.herramientas.map(aHerramientaDeOpenAI),
      tool_choice: peticion.herramientaObligatoria ? { type: "function", function: { name: peticion.herramientaObligatoria } } : "auto",
    });
    const eleccion = respuesta.choices[0]?.message;
    if (!eleccion) throw new Error("OpenAI no devolvió ninguna respuesta");

    const llamadas = (eleccion.tool_calls ?? []).flatMap((llamada) =>
      llamada.type === "function" ? [{ id: llamada.id, nombre: llamada.function.name, argumentos: parsearArgumentos(llamada.function.arguments) }] : [],
    );
    if (llamadas.length > 0) return { tipo: "llamadas", llamadas };
    return { tipo: "texto", texto: eleccion.content?.trim() ?? "" };
  }
}

function aMensajeDeOpenAI(mensaje: MensajeParaElModelo): ChatCompletionMessageParam {
  switch (mensaje.rol) {
    case "usuario":
      return { role: "user", content: mensaje.texto };
    case "asistente":
      return { role: "assistant", content: mensaje.texto };
    case "asistente_llama":
      return {
        role: "assistant",
        tool_calls: mensaje.llamadas.map((llamada) => ({
          id: llamada.id,
          type: "function",
          function: { name: llamada.nombre, arguments: JSON.stringify(llamada.argumentos ?? {}) },
        })),
      };
    case "resultado":
      return { role: "tool", tool_call_id: mensaje.llamadaId, content: JSON.stringify(mensaje.resultado) };
  }
}

function aHerramientaDeOpenAI(nombre: NombreDeHerramienta): ChatCompletionTool {
  const definicion = definicionesDeHerramientas[nombre];
  return {
    type: "function",
    function: { name: nombre, description: definicion.descripcion, parameters: esquemaJsonDe(definicion.argumentos) },
  };
}

function parsearArgumentos(texto: string): unknown {
  try {
    return JSON.parse(texto || "{}");
  } catch {
    return {};
  }
}
