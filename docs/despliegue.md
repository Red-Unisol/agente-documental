# Despliegue

Qué hace falta para que el agente corra en un servidor propio, cómo se arranca y cómo se muda desde
otra máquina sin cortar la atención.

## 1. Qué corre

| Proceso | Comando | Para qué |
|---|---|---|
| **Agente** | `node dist/cli/bitrix.js servir` (`npm start`) | Recibe los eventos de Bitrix en `POST /bitrix/eventos`, conversa, lee recibos y escribe en el CRM. Es el único imprescindible. |
| Panel | `node dist/panel/servidor.js` (`npm run start:panel`) | Lectura: prompt, escenarios, reglas, evals y sus conversaciones de prueba. No tiene login. |

No hay base de datos. El estado son dos cosas en disco, **fuera del repositorio y con respaldo**:

- `BITRIX24_TOKENS_ARCHIVO`: los tokens de la aplicación local de Bitrix y el id del bot. El agente
  los renueva solo y reescribe el archivo, así que necesita permiso de escritura.
- `AGENTE_DATOS_CARPETA`: un JSON por chat, con la conversación y los archivos que mandó el socio
  (recibos incluidos). Son datos personales: permisos restringidos y la retención que defina Red Unisol.

Un solo proceso del agente por portal: los mensajes de un mismo chat se ordenan en memoria.

## 2. Requisitos

- Node.js 22 o Docker.
- Una URL pública con **HTTPS** que llegue al puerto del agente. Bitrix manda los eventos a
  `<BITRIX24_URL_PUBLICA>/bitrix/eventos`. Sólo hace falta exponer esa ruta.
- Salida a internet hacia el portal de Bitrix y hacia `api.openai.com`.
- La aplicación local instalada en el portal (sección 4) y una clave de OpenAI.

## 3. Variables de entorno

Todas están en [`.env.example`](../.env.example), comentadas. Si hay un `.env` en la carpeta desde
donde se corre, se carga solo; lo que ya esté definido en el entorno manda. Las obligatorias para el
agente:

| Variable | Qué es |
|---|---|
| `OPENAI_API_KEY` | Clave de OpenAI. |
| `BITRIX24_APP_CLIENT_ID`, `BITRIX24_APP_CLIENT_SECRET` | Credenciales de la aplicación local; con ellas renueva los tokens. |
| `BITRIX24_TOKENS_ARCHIVO` | Ruta del archivo de tokens. |
| `BITRIX24_URL_PUBLICA` | URL pública del agente, sin la ruta. |
| `BITRIX24_USUARIO_PRUEBA` | Usuario de Bitrix que recibe las derivaciones mientras se usa el embudo de prueba. |

En producción `AGENTE_CLAVE_DE_PRUEBAS` va vacía y `AGENTE_VOLCAR_EVENTOS` también.

## 4. La aplicación local de Bitrix

Se crea una vez, como administrador: *Aplicaciones → Recursos para desarrolladores → Otro →
Aplicación local*.

- Alcances: `crm`, `imbot`, `imopenlines`, `imconnector`, `disk`, `user`, `im`.
- **URL del controlador** y **URL de instalación inicial**: `<BITRIX24_URL_PUBLICA>/bitrix/eventos`.
  La misma ruta recibe la instalación, la apertura de la aplicación y los eventos del bot.

Al instalarla, Bitrix llama a esa URL con los tokens y el agente los guarda en
`BITRIX24_TOKENS_ARCHIVO`: el agente tiene que estar corriendo en ese momento. Si el archivo se
pierde o los tokens vencen (pasa si el agente estuvo apagado varios meses), no hace falta
reinstalar: un administrador abre la aplicación desde el menú de Bitrix y el agente vuelve a
guardarlos. Sólo acepta los tokens de un administrador.

Después, una sola vez:

```bash
npm run bitrix registrar-bot       # crea el chatbot de Canales Abiertos y guarda su id junto a los tokens
npm run bitrix vincular-eventos    # sólo si se usa AGENTE_MODO=asignacion
```

El bot se asigna como bot de bienvenida de la línea de Canales Abiertos que tiene que atender
(*Contact Center → la línea → Chatbots*). Con poco tiempo de espera del bot, si el agente está caído
Bitrix pasa el chat a la cola de operadores solo.

## 5. Arrancar

### Con Node

```bash
npm ci
npm run build
npm start                 # node dist/cli/bitrix.js servir
```

Como servicio de systemd:

```ini
[Unit]
Description=Agente documental
After=network-online.target

[Service]
WorkingDirectory=/srv/agente-documental
EnvironmentFile=/etc/agente-documental.env
ExecStart=/usr/bin/node dist/cli/bitrix.js servir
Restart=always
User=agente

[Install]
WantedBy=multi-user.target
```

### Con Docker

```bash
cp .env.example .env      # completar
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml logs -f agente
```

El `docker-compose.yml` levanta el agente en `127.0.0.1:3010` y el panel en `127.0.0.1:3011`, y guarda
tokens y conversaciones en el volumen `datos` (`/datos` adentro del contenedor). El archivo de tokens
existente se copia a ese volumen como `bitrix-tokens.json`. Los comandos de puesta en marcha se corren
adentro: `docker compose -f infra/docker-compose.yml exec agente node dist/cli/bitrix.js registrar-bot`.

### HTTPS

El proxy del servidor termina HTTPS y pasa `/bitrix/eventos` al puerto del agente. Con nginx:

```nginx
location /bitrix/eventos {
    proxy_pass http://127.0.0.1:3010;
    client_max_body_size 25m;
}
```

El panel no tiene autenticación y muestra el prompt y las reglas: si se publica, que sea detrás de
una VPN o de la autenticación del proxy.

## 6. Comprobar que anda

1. El registro del agente dice `Agente escuchando eventos de Bitrix en :3000/bitrix/eventos`.
2. Desde afuera, `curl -i -X POST https://<dominio>/bitrix/eventos` responde `200`.
3. Un mensaje en el chat web del canal de prueba recibe respuesta, y en el registro aparece
   `ONIMBOTMESSAGEADD chat… → respondió`.

El registro no escribe textos de los socios ni tokens: una línea por evento con qué hizo.

## 7. Mudar el agente de servidor

Conviene este orden: primero la URL de la aplicación y después los eventos del bot, porque Bitrix puede
rechazar manejadores de eventos de un dominio distinto al de la aplicación.

1. Copiar al servidor nuevo el archivo de tokens y la carpeta de conversaciones.
2. Apagar el agente viejo. Mientras no haya agente, Bitrix pasa los chats a la cola de operadores
   cuando vence el tiempo de espera del bot.
3. En Bitrix, cambiar la **URL del controlador** y la **URL de instalación** de la aplicación local
   por la nueva.
4. En el servidor nuevo, con `BITRIX24_URL_PUBLICA` ya apuntando al dominio nuevo:

   ```bash
   npm start                           # o docker compose up -d
   npm run bitrix actualizar-url       # apunta los eventos del bot (y el de cambio de negociación) a la URL nueva
   ```

5. Probar con el chat web del canal de prueba.

Si en el paso 4 `actualizar-url` devuelve un error de autorización, los tokens copiados vencieron: un
administrador abre la aplicación desde el menú de Bitrix (el agente guarda tokens nuevos) y se repite.

## 8. Actualizar el agente

```bash
git pull
npm ci && npm run build
systemctl restart agente-documental    # o docker compose up -d --build
```

La configuración del agente (prompt, escenarios, reglas) se lee al arrancar: un cambio en
`src/aplicacion/configuracion-inicial.ts` necesita compilar y reiniciar. Las conversaciones abiertas
siguen donde estaban.

## 9. Pasar del embudo de prueba a producción

Hoy el agente trabaja sobre el embudo de prueba: `src/cli/bitrix.ts` usa `mapeoDelEmbudoDePrueba`
(`src/adaptadores/bitrix/mapeo.ts`). El mapeo dice en qué embudo trabaja, cómo se llaman sus etapas,
qué campos lee y a quién deriva. Para producción falta definir con el negocio y escribir el mapeo del
embudo real (el id del embudo, los cuatro ids de etapa con su prefijo, los usuarios que reciben las
derivaciones) y usarlo en `src/cli/bitrix.ts`. Los campos de la negociación son los mismos en los dos
embudos.

El agente nunca escribe en una negociación de otro embudo que el de su mapeo, y sólo mueve la etapa
cuando la negociación está en una de sus cuatro etapas de documentación.
