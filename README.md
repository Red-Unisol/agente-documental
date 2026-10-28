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
- React + Vite (panel)
- OpenAI (lectura del recibo y conversación), detrás de una interfaz propia
- Bitrix24: aplicación local con alcances `crm`, `imbot`, `imopenlines`
- Docker / Docker Compose

## Estructura

```
src/
  dominio/        reglas de negocio y tipos; sin dependencias de infraestructura
    verificacion/   período, identidad, empleador, exclusiones
    agente/         prompt, escenarios, herramientas
    conversacion/   estado y auditoría de una conversación
  aplicacion/     casos de uso: atender un mensaje, ejecutar una herramienta
  puertos/        interfaces hacia el modelo, el lector de recibos, el CRM y la base
  adaptadores/    openai (modelo y lector), memoria (simulación y tests), bitrix, prisma
  evals/          cómo se grada una conversación de prueba
  cli/            simulación por consola y corredor de evals
evals/            conversaciones de prueba y recibos sintéticos
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
npm test                      # tests unitarios, sin red
```

La simulación usa un CRM en memoria: muestra qué habría hecho en Bitrix sin tocarlo.

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
