# Agente documental

Bot de Canales Abiertos de Bitrix24 que pide y revisa el recibo de sueldo de solicitantes ya
preevaluados, lo carga en la negociación del CRM y deriva a una persona cuando no puede decidir.

No aprueba créditos, no negocia montos ni cuotas, no toca Kestra ni el sistema de solicitudes.

## Qué hace

1. Recibe los mensajes del Canal Abierto en las negociaciones de la etapa DOCUMENTACION.
2. Pide el recibo con lo que la ficha ya declara (provincia, empleador, convenio) y guía su descarga.
3. Lee el recibo y verifica: que sea un recibo de sueldo legible, que el CUIL coincida con el DNI de
   la ficha, que el empleador coincida con lo declarado, que el período sea el admitido y que el
   empleador no esté excluido por convenio.
4. Carga el archivo en el campo de recibo de la negociación y la mueve a DOCU RECIBIDA; si falta
   algo, a FALTA DOCUMENTACION; si no puede decidir, deriva a un operador con el motivo.

Las reglas (período admitido, día de gracia, exclusiones, instrucciones por empleador) y los
escenarios de conversación se editan desde el panel, no en el código. Toda decisión queda auditada.

## Stack

- Node.js 22, TypeScript, Express, Prisma, PostgreSQL, Zod
- Panel: HTML renderizado en el servidor (sin framework)
- OpenAI (lectura del recibo y conversación), detrás de una interfaz propia; modelo configurable por entorno
- Bitrix24: aplicación local con alcances `crm`, `imbot`, `imopenlines`, `imconnector`, `disk`, `user`
- Docker / Docker Compose

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
  adaptadores/    openai (modelo y lector), memoria (simulación y tests), bitrix, prisma
  evals/          cómo se grada una conversación de prueba y cómo se guarda una corrida
  cli/            simulación por consola y corredor de evals
  panel/          panel de lectura: conversaciones, prompt base, escenarios, reglas, evals, modelos y costos
evals/            conversaciones de prueba, recibos sintéticos y corridas guardadas
infra/            Dockerfile, docker-compose.yml
scripts/          utilidades: embudo de prueba en Bitrix, recibos sintéticos
docs/             bitrix-embudo-prueba.md
```

## Correr local

```bash
cp .env.example .env          # alcanza con OPENAI_API_KEY para la simulación
npm install
./scripts/generar-recibos-sinteticos.sh   # recibos ficticios para probar (requiere Chrome)
npm run dev                   # conversación por consola; `/archivo <ruta>` adjunta un recibo
npm run evals                 # corre evals/conversaciones/*.json y grada el resultado
npm run evals -- --guardar    # además guarda la corrida en evals/corridas/ (la lee el panel)
npm run panel                 # http://localhost:3011
npm test                      # tests unitarios, sin red
```

La simulación usa un CRM en memoria: muestra qué habría hecho en Bitrix sin tocarlo.

Conectado a Bitrix, las conversaciones se guardan en `AGENTE_DATOS_CARPETA` (un JSON por chat) para
sobrevivir reinicios; si un chat no está guardado pero ya tiene mensajes en Bitrix, el historial se
reconstruye desde ahí antes de responder.

### Cambiar o comparar modelos

Los modelos son dos variables de entorno. Para comparar alternativas se corre la misma batería con
cada una y el panel las muestra lado a lado (pasan, costo por conversación, tiempo):

```bash
OPENAI_MODELO_CONVERSACION=gpt-6-luna OPENAI_MODELO_LECTURA=gpt-6.1-terra npm run evals -- --guardar
```

Las tarifas para estimar el costo están en `src/dominio/costos/tarifas.ts`.

## Variables de entorno

Ver `.env.example`. En la VPS no hay `.env` plano: va cifrado en `agente-documental.{dev,prod}.env.enc`.

## Despliegue

Igual que `solicitudes-web`: GitHub Actions construye la imagen, la publica en GHCR y entra por SSH a
la VPS a hacer `docker compose pull && docker compose up -d`. HTTPS lo da el Apache de la VPS con un
VirtualHost hacia `127.0.0.1:${APP_BIND_PORT}`. Workflow en `.github/workflows/deploy.yml`.

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
```

El canal de prueba se prueba desde su "Chat en vivo" (Contact Center → canal → Chat en vivo → enlace
público). Las derivaciones van al usuario `BITRIX24_USUARIO_PRUEBA`; el motivo queda como comentario en
la línea de tiempo de la negociación. Si el chat no viene atado a una negociación (pasa con el chat en
vivo), se usa `BITRIX24_NEGOCIACION_PRUEBA`.

### Cuándo atiende y cuándo se corre

Un bot de Canales Abiertos sólo recibe los chats de las líneas donde está como bot de bienvenida, y no
puede entrar a una sesión ya abierta (Bitrix rechaza `imopenlines.operator.transfer` a un bot,
`imbot.chat.user.add` y `imopenlines.crm.chat.user.add`). Por eso el bot entra a todos los chats de la
línea y decide **en cada mensaje** si atiende o se corre, sin escribirle nada al socio
(`src/adaptadores/bitrix/politica-de-atencion.ts`):

| Variable | Qué hace |
|---|---|
| `AGENTE_MODO=canal` | Atiende todo chat que le llegue (línea de prueba). |
| `AGENTE_MODO=asignacion` | Atiende sólo si la negociación del chat tiene como responsable a `BITRIX24_USUARIO_AGENTE` (un usuario empleado normal: Bitrix no deja elegir bots como responsables). Si se la sacan, al siguiente mensaje del socio cede el chat al nuevo responsable y se va. |
| `AGENTE_LISTA_BLANCA` | `tel[:negociación],tel[:negociación]`. Con lista, los chats de otros números se ceden a la cola. El teléfono sale del id externo del conector (`CHAT_ENTITY_ID`); en el chat web no hay teléfono, así que con lista blanca el chat web no se atiende. La negociación opcional se usa cuando el chat no viene atado a una (prueba con WhatsApp real y negociaciones precargadas). |
| `AGENTE_VOLCAR_EVENTOS` | Archivo donde anexa cada evento crudo (sin tokens), para diagnóstico. |

Si una persona de Red Unisol escribe en el chat mientras el bot está, el bot se lo deja y se retira.
Para la línea real, dejar `WELCOME_BOT_TIME` en unos segundos: si el agente está caído, Bitrix pasa el
chat a la cola solo.
