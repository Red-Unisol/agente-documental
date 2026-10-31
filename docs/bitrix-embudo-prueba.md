# Embudo de prueba en Bitrix24

Embudo de Negociaciones **VENTAS · PRUEBA PULSO** (`categoryId = 19`), creado por API el 21/10/2026
con `scripts/bitrix/embudo_prueba.py`. Copia de VENTAS (`categoryId = 1`) con los mismos códigos de
etapa, sin robots ni automatizaciones, más una etapa que no existe en VENTAS.

El agente funciona igual en prueba y en producción cambiando sólo el prefijo `C19:` por `C1:`.

| Código en VENTAS | Código en prueba | Etapa |
|---|---|---|
| `C1:KESTRA_PENDING` | `C19:KESTRA_PENDING` | PENDIENTE CALIFICACION KESTRA |
| `C1:KESTRA_ROUTE_REVIEW` | `C19:KESTRA_ROUTE_R` | REVISION DE ENRUTAMIENTO KESTRA (la API limita el id a 18 caracteres) |
| `C1:KESTRA_QUEUE` | `C19:KESTRA_QUEUE` | COLA DE DISTRIBUCION KESTRA |
| `C1:KESTRA_REVIEW` | `C19:KESTRA_REVIEW` | REVISION MANUAL KESTRA |
| `C1:NEW` | `C19:NEW` | PRESENTACION |
| `C1:UC_ZH5DGU` | `C19:UC_ZH5DGU` | RESPUESTA |
| `C1:UC_UPF4Z7` | `C19:UC_UPF4Z7` | Jubilados LP |
| `C1:UC_53P7WJ` | `C19:UC_53P7WJ` | **DOCUMENTACION** (entrada del agente) |
| — | `C19:REVISION_DOC` | **REVISIÓN DOCUMENTAL (agente)** · sólo en prueba, orden 85. Toda derivación del agente (recibo dudoso, caso excluido, pedido de hablar con una persona, consulta que no es de este paso) deja la negociación acá, además de transferir el chat y anotar el motivo en la línea de tiempo. |
| `C1:UC_TJIFLR` | `C19:UC_TJIFLR` | **DOCU RECIBIDA** (salida OK) |
| `C1:UC_D4N3Y4` | `C19:UC_D4N3Y4` | **FALTA DOCUMENTACION** (salida pendiente) |
| `C1:EXECUTING` | `C19:EXECUTING` | OFERTA |
| `C1:UC_WF4MBS` | `C19:UC_WF4MBS` | SEGUIMIENTO OFERTA |
| `C1:7` | `C19:7` | EN VALIDACION |
| `C1:WON` | `C19:WON` | ACREDITACION Y FIDELIZACION |
| `C1:10` … `C1:21`, `LOSE`, `APOLOGY` | `C19:…` (mismo código) | 17 etapas de cierre negativo |

## Notas sobre la API

- `crm.category.add` crea el embudo con 8 etapas por defecto; el script borra las que no existen en
  VENTAS y renombra las demás.
- `crm.status.add` acepta `STATUS_ID` propio, máximo 18 caracteres incluido el prefijo `C19:`.
- No permite crear etapas de proceso con `SORT` mayor que el de una etapa final: primero se empujan
  `WON`/`LOSE`/`APOLOGY` al fondo, se crean las de proceso y después se reordenan.
- Las etapas de cierre negativo se crean con `SEMANTICS=F`; Bitrix las guarda como `apology`.

## Borrar el embudo

```bash
BITRIX24_WEBHOOK_URL=… python3 scripts/bitrix/embudo_prueba.py borrar 19
```

Borra el embudo y sus etapas. Si tiene negociaciones adentro, el script avisa y no sigue.

## Chats sin vincular

El chat público del Canal Abierto de prueba lo abre un visitante anónimo, así que Bitrix no lo vincula a
ninguna negociación y la conversación no aparece en su línea de tiempo (en WhatsApp sí, porque el canal
ya conoce al contacto). En ese caso el agente usa la negociación de `BITRIX24_NEGOCIACION_PRUEBA` y copia
la conversación completa en su línea de tiempo como comentario "CHAT DE PRUEBA", que reescribe después de
cada mensaje, con el link a la sesión en Contact Center. Cuando el chat viene vinculado no copia nada.
