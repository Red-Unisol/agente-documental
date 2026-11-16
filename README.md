# Agente documental

Bot de Canales Abiertos de Bitrix24 que pide y revisa el recibo de sueldo de solicitantes ya
preevaluados, lo carga en la negociación del CRM y deriva a una persona cuando no puede decidir.

No aprueba créditos, no negocia montos ni cuotas, no toca Kestra ni el sistema de solicitudes.

## Por dónde empezar

| Quiero… | Leer |
|---|---|
| Cambiar lo que el agente dice o decide (el prompt, en castellano) | **`src/aplicacion/configuracion-inicial.ts`** y [`docs/ajustar-el-agente.md`](docs/ajustar-el-agente.md) |
| Levantarlo en un servidor | [`docs/despliegue.md`](docs/despliegue.md) |
| Probarlo en Bitrix, también con una negociación real copiada | [`docs/pruebas-en-bitrix.md`](docs/pruebas-en-bitrix.md) |
| Entender cómo lee y verifica un recibo | [`docs/lectura-de-recibos.md`](docs/lectura-de-recibos.md) |
| Trabajar en el código con un asistente (Codex, Claude Code, Cursor) | [`AGENTS.md`](AGENTS.md) |

## Qué hace

1. Recibe los mensajes del Canal Abierto de las negociaciones de su embudo.
2. Lee la negociación en cada mensaje: con la ficha (provincia, empleador, convenio) pide el recibo y
   guía su descarga; con los datos cargados (etapa, créditos activos, oferta) responde las consultas
   del socio sobre su solicitud. Si el recibo ya está cargado o la negociación está en una etapa
   posterior a la documentación, no lo pide.
3. Lee el recibo y verifica: que sea un recibo de sueldo legible, que el CUIL coincida con el DNI de
   la ficha, que el empleador coincida con lo declarado, que el período sea el admitido y que el
   empleador no esté excluido por convenio.
4. Carga el archivo en el campo de recibo de la negociación y la mueve a DOCU RECIBIDA; si falta
   algo, a FALTA DOCUMENTACION; si no puede decidir, deriva a un operador con el motivo. Sólo mueve
   la etapa cuando la negociación está en una de sus etapas de documentación: nunca la hace
   retroceder desde una etapa posterior ni reabre una cerrada.

Lo que el agente dice y decide (bloques del prompt, 19 escenarios, reglas de verificación) vive en
`src/aplicacion/configuracion-inicial.ts`, y cada escenario tiene conversaciones de prueba en
`evals/conversaciones/`. **Cómo cambiarlo, probarlo y qué modelo usa: [`docs/ajustar-el-agente.md`](docs/ajustar-el-agente.md).**
Toda decisión queda auditada en la conversación.

## Stack

- Node.js 22, TypeScript, Zod. Sin base de datos: las conversaciones se guardan como un JSON por chat en disco
- Panel de lectura: HTML renderizado en el servidor (sin framework)
- OpenAI (lectura del recibo y conversación), detrás de una interfaz propia; modelo configurable por entorno
- Bitrix24: aplicación local con alcances `crm`, `imbot`, `imopenlines`, `imconnector`, `disk`, `user`, `im`
- Docker opcional (`infra/`); también corre con Node solo

## Estructura

```
src/
  dominio/        reglas de negocio y tipos; sin dependencias de infraestructura
    verificacion/   período, identidad, empleador, exclusiones
    agente/         prompt, escenarios, herramientas
    conversacion/   estado y auditoría de una conversación
    costos/         uso de tokens, tarifas y costo por conversación
  aplicacion/     casos de uso: atender un mensaje, ejecutar una herramienta
  puertos/        interfaces hacia el modelo, el lector de recibos, el CRM y la base
  adaptadores/    openai (modelo y lector), memoria (simulación y tests), archivos (conversaciones en disco), bitrix
  evals/          cómo se grada una conversación de prueba y cómo se guarda una corrida
  cli/            simulación por consola y corredor de evals
  panel/          panel de lectura: conversaciones, prompt base, escenarios, reglas, evals, modelos y costos
evals/            conversaciones de prueba, recibos sintéticos y corridas guardadas
infra/            Dockerfile, docker-compose.yml (agente y panel, sin base de datos)
scripts/          utilidades: embudo de prueba en Bitrix, recibos sintéticos
docs/             ajustar-el-agente.md, despliegue.md, pruebas-en-bitrix.md, lectura-de-recibos.md, bitrix-embudo-prueba.md
```

## Correr local

```bash
cp .env.example .env          # alcanza con OPENAI_API_KEY para la simulación; el .env se carga solo
npm install
./scripts/generar-recibos-sinteticos.sh   # recibos ficticios para probar (requiere Chrome)
npm run dev                   # conversación por consola; `/archivo <ruta>` adjunta un recibo
npm run evals                 # corre evals/conversaciones/*.json y grada el resultado
npm run evals -- --guardar    # además guarda la corrida en evals/corridas/ (la lee el panel)
npm run evals:lecturas -- --manifiesto <casos.jsonl> --salida <carpeta>   # lectura de recibos reales, fuera del repo
npm run panel                 # http://localhost:3011
npm test                      # tests unitarios, sin red
```

La simulación usa un CRM en memoria: muestra qué habría hecho en Bitrix sin tocarlo.

Conectado a Bitrix, las conversaciones se guardan en `AGENTE_DATOS_CARPETA` (un JSON por chat) para
sobrevivir reinicios; si un chat no está guardado pero ya tiene mensajes en Bitrix, el historial se
reconstruye desde ahí antes de responder.

### Cambiar o comparar modelos

Los modelos son variables de entorno (conversación, lectura y lectura de respaldo). Para comparar alternativas se corre la misma batería con
cada una y el panel las muestra lado a lado (pasan, costo por conversación, tiempo):

```bash
OPENAI_MODELO_CONVERSACION=gpt-6-luna OPENAI_MODELO_LECTURA=gpt-6.1-terra npm run evals -- --guardar
```

Las tarifas para estimar el costo están en `src/dominio/costos/tarifas.ts`.

### Lectura de recibos

Qué se lee de cada archivo (recibo solo, varias liquidaciones, paquete con DNI y otros documentos,
archivos separados), cómo decide cada verificación y cómo probarlo con documentos reales:
[`docs/lectura-de-recibos.md`](docs/lectura-de-recibos.md).

## Variables de entorno

Todas están en [`.env.example`](.env.example), comentadas. El `.env` no se versiona.

## Despliegue

```bash
npm ci && npm run build && npm start                           # con Node 22
docker compose -f infra/docker-compose.yml up -d --build       # o con Docker
```

Un solo proceso (`node dist/cli/bitrix.js servir`) detrás de una URL pública con HTTPS, sin base de
datos: el estado es el archivo de tokens de la aplicación de Bitrix y la carpeta de conversaciones.
Requisitos, la aplicación local de Bitrix, systemd, proxy, cómo mudarlo de servidor y cómo pasar del
embudo de prueba a producción: [`docs/despliegue.md`](docs/despliegue.md).

## Entornos en Bitrix

| | Embudo | Prefijo de etapas |
|---|---|---|
| Prueba | VENTAS · PRUEBA PULSO (`19`) | `C19:` |
| Producción | VENTAS (`1`) | `C1:` |

Cómo se creó el embudo de prueba y cómo se borra: [`docs/bitrix-embudo-prueba.md`](docs/bitrix-embudo-prueba.md).

### Correr el bot dentro de Bitrix (prueba)

Hace falta la aplicación local instalada en el portal (sus tokens en `BITRIX24_TOKENS_ARCHIVO`) y una URL
pública que llegue a esta máquina (`BITRIX24_URL_PUBLICA`, por ejemplo un túnel).

```bash
npm run bitrix registrar-bot              # registra el chatbot de Canales Abiertos y guarda su id
npm run bitrix crear-negociacion-prueba   # negociación ficticia en el embudo 19, etapa DOCUMENTACIÓN
npm run bitrix crear-canal-prueba         # Canal Abierto nuevo atendido por el bot (no toca el canal real)
npm run bitrix servir                     # escucha los eventos en /bitrix/eventos y atiende los chats
npm run bitrix copiar-negociacion <id>    # copia una negociación al embudo de prueba (la original no se toca)
npm run bitrix actualizar-url             # apunta los eventos del bot a BITRIX24_URL_PUBLICA (mudanza de servidor)
```

El canal de prueba se prueba desde su "Chat en vivo" (Contact Center → canal → Chat en vivo → enlace
público). Las derivaciones van al usuario `BITRIX24_USUARIO_PRUEBA`; el motivo queda como comentario en
la línea de tiempo de la negociación. Si el chat no viene atado a una negociación (pasa con el chat en
vivo), se usa `BITRIX24_NEGOCIACION_PRUEBA`.

Para probar con un caso real sin tocarlo, el agente puede copiar una negociación al embudo de prueba,
con sus datos y la conversación que tuvo, y seguir la charla sobre la copia: se le manda en el chat de
prueba el enlace de la negociación y `AGENTE_CLAVE_DE_PRUEBAS`. Paso a paso y cuidados:
[`docs/pruebas-en-bitrix.md`](docs/pruebas-en-bitrix.md).

### Cuándo atiende y cuándo se corre

Un bot de Canales Abiertos recibe los chats nuevos de las líneas donde está como bot de bienvenida. Ahí
decide **en cada mensaje** si atiende o se corre, sin escribirle nada al socio
(`src/adaptadores/bitrix/politica-de-atencion.ts`):

| Variable | Qué hace |
|---|---|
| `AGENTE_MODO=canal` | Atiende todo chat que le llegue (línea de prueba). |
| `AGENTE_MODO=asignacion` | Atiende sólo si la negociación del chat tiene como responsable a `BITRIX24_USUARIO_AGENTE` (un usuario empleado normal: Bitrix no deja elegir bots como responsables). Si se la sacan, al siguiente mensaje del socio cede el chat al nuevo responsable y se va. |
| `AGENTE_LISTA_BLANCA` | `tel[:negociación],tel[:negociación],linea:<id>`. Con lista, los chats de otros números se ceden a la cola. El teléfono sale del id externo del conector (`CHAT_ENTITY_ID`); el chat web no tiene teléfono, así que para seguir usando el chat de prueba se habilita su línea entera con `linea:9`. La negociación asociada a un teléfono **manda sobre la que Bitrix ató al chat**: un número de prueba puede venir atado a una negociación real, y esa no se toca. |
| `AGENTE_CLAVE_DE_PRUEBAS` | Enciende el modo de prueba con negociaciones reales copiadas. Vacía = apagado; en producción va vacía. |
| `AGENTE_VOLCAR_EVENTOS` | Archivo donde anexa cada evento crudo (sin tokens), para diagnóstico. |

En cualquier modo, si la negociación del chat no pertenece al embudo configurado, el agente se corre: nunca
escribe sobre otro embudo. Si una persona de Red Unisol escribe en el chat mientras el bot está, el bot se lo deja y se retira.
Para la línea real, dejar `WELCOME_BOT_TIME` en unos segundos: si el agente está caído, Bitrix pasa el
chat a la cola solo.

**Chats ya abiertos (que no pasaron por el bot).** Bitrix no deja transferir un diálogo a un bot
(`operator.transfer` → OPERATOR_WRONG) ni que el bot se sume solo. Lo que sí funciona, y hace
`src/adaptadores/bitrix/sesiones-bitrix.ts`: el administrador de la app toma el chat, lo transfiere al
usuario `BITRIX24_USUARIO_AGENTE`, se suma como observador, agrega el bot con `im.chat.user.add`
(requiere el alcance **`im`** en la app) y se va. El bot queda adentro con el historial. Se dispara de
dos maneras:

- Automática, en modo `asignacion`: `npm run bitrix vincular-eventos` suscribe `ONCRMDEALUPDATE`; cuando
  una negociación del embudo pasa al usuario del agente, el bot entra a sus chats abiertos; cuando deja
  de ser suya, los suelta al nuevo responsable.
- A mano: `npm run bitrix tomar-chat <chatId>`.
