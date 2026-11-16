# Mapa del proyecto

Agente que atiende chats de Canales Abiertos de Bitrix24: pide y revisa el recibo de sueldo, responde
consultas del socio con los datos de su negociación y deriva a una persona cuando no puede decidir.
Node 22, TypeScript, sin base de datos. El `README.md` tiene el panorama; acá está dónde tocar.

| Para cambiar… | Archivo |
|---|---|
| **El prompt**: quién es el agente, qué no hace, cómo responde, y los escenarios (qué decir en cada situación) | `src/aplicacion/configuracion-inicial.ts` (texto en castellano; es lo que más se toca) |
| Cómo se arma el prompt con la ficha y los datos de la negociación | `src/dominio/agente/prompt.ts` |
| Las herramientas que puede llamar el modelo y qué hace cada una | `src/dominio/agente/herramientas.ts`, `src/aplicacion/ejecutar-herramienta.ts` |
| Las reglas que deciden si un recibo sirve (período, identidad, empleador, exclusiones) | `src/dominio/verificacion/` y `reglas` en `configuracion-inicial.ts` |
| Qué le pide el lector al modelo cuando lee un recibo | `src/adaptadores/openai/lector-de-recibo.ts` |
| Embudo, etapas, campos de Bitrix y qué datos de la negociación ve el agente | `src/adaptadores/bitrix/mapeo.ts` |
| Qué escribe en el CRM (cargar recibo, mover etapa, derivar, comentar) | `src/adaptadores/bitrix/crm-bitrix.ts` |
| Cuándo atiende un chat y cuándo lo cede a una persona | `src/adaptadores/bitrix/politica-de-atencion.ts` |
| Los eventos de Bitrix y el modo de prueba con negociaciones copiadas | `src/adaptadores/bitrix/bot.ts`, `copia-de-negociacion.ts` |
| Variables de entorno | `src/configuracion/entorno.ts`, `.env.example` |
| Las conversaciones de prueba | `evals/conversaciones/*.json` |

Comandos: `npm test` (unitarios, sin red), `npm run typecheck`, `npm run evals` (conversaciones contra
el modelo real; `-- --solo <texto>` filtra), `npm run dev` (conversar por consola con un CRM simulado),
`npm run build && npm start` (producción). Despliegue en `docs/despliegue.md`.

Un cambio está terminado cuando pasan `npm test`, `npm run typecheck` y los evals que toca; si cambia
el comportamiento, con un eval nuevo o actualizado que lo cubra.

# Convenciones

- `src/dominio` no importa nada de infraestructura. `src/aplicacion` usa dominio y puertos.
  Bitrix y OpenAI sólo se tocan desde `src/adaptadores`.
- Nombres en castellano con el vocabulario del negocio (socio, negociación, recibo, convenio, derivar).
- Funciones chicas que hacen una sola cosa. Comentarios sólo para explicar un porqué.
- Resultados de negocio como uniones discriminadas, no excepciones. Sin `any`, sin `null` de retorno.
- Tests con fixtures sintéticos. Nunca datos reales de socios en el repo ni en logs.
- Secretos sólo por variables de entorno. Nunca en el código, en los docs ni en un commit.
- El agente sólo escribe en negociaciones del embudo de su mapeo y sólo mueve la etapa entre sus etapas
  de documentación. No relajar esas dos guardas sin decidirlo con el negocio.

# Cambiar lo que el agente dice o decide

Antes de tocar bloques, escenarios, reglas o evals, leer `docs/ajustar-el-agente.md`. En resumen:

- Todo está en `src/aplicacion/configuracion-inicial.ts`. Los escenarios tienen `clave` única (`E<n>`),
  `cuando` (lo único que el modelo ve antes de elegir) e `instrucciones` (lo que recibe al cargarlo).
- Cada escenario nuevo o modificado lleva un eval en `evals/conversaciones/` que lo espere
  (`"escenarios": ["E<n>"]`). `npm test` falla si una clave queda sin eval o referenciada tras borrarla.
- `npm run evals` corre contra el modelo real; `npm run evals -- --solo <texto>` filtra por archivo.
- El modelo se cambia por `OPENAI_MODELO_CONVERSACION` / `OPENAI_MODELO_LECTURA`, nunca sin una corrida
  completa guardada (`--guardar`) para comparar en el panel.
- La lectura de recibos (qué se extrae, cómo decide cada verificación) está en
  `docs/lectura-de-recibos.md`. Si se toca el lector o `src/dominio/verificacion/`, correr
  `npm run evals:lecturas` con documentos reales; el manifiesto y los resultados viven fuera del repo.
