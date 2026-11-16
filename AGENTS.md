# Convenciones

- `src/dominio` no importa nada de infraestructura. `src/aplicacion` usa dominio y puertos.
  Bitrix, OpenAI y Prisma sólo se tocan desde `src/adaptadores`.
- Nombres en castellano con el vocabulario del negocio (socio, negociación, recibo, convenio, derivar).
- Funciones chicas que hacen una sola cosa. Comentarios sólo para explicar un porqué.
- Resultados de negocio como uniones discriminadas, no excepciones. Sin `any`, sin `null` de retorno.
- Tests con fixtures sintéticos. Nunca datos reales de socios en el repo ni en logs.
- Secretos sólo por variables de entorno.

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
