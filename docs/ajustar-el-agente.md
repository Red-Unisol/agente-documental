# Cómo ajustar el agente: bloques, escenarios, reglas y evals

Guía para quien tenga que cambiar **lo que el agente dice y decide**, sin tocar la integración con
Bitrix ni con OpenAI. Todo lo que hay que editar está en dos lugares:

| Qué | Dónde | Formato |
|---|---|---|
| Lo que el agente es, hace y no hace (bloques), los 18 escenarios y las reglas de verificación | `src/aplicacion/configuracion-inicial.ts` | TypeScript (un objeto) |
| Las conversaciones de prueba que verifican cada escenario (evals) | `evals/conversaciones/*.json` | JSON, uno por caso |

El modelo de lenguaje se elige por variable de entorno (sección 5). El panel (`npm run panel`) muestra
todo esto pero **no lo edita**: la fuente de verdad es el código, y cada cambio pasa por un commit, los
tests y los evals.

---

## 1. Cómo piensa el agente en cada mensaje

1. Recibe el mensaje del socio con la **ficha** de la negociación (nombre, provincia, convenio,
   situación laboral, empleador declarado).
2. Arma el prompt del sistema: `ROL` + `OBJETIVO` + `QUÉ NO HACÉS` + `FORMA DE RESPONDER` (los cuatro
   bloques) + la ficha + un **índice** de escenarios (clave, nombre y *cuándo* aplica; sin las
   instrucciones).
3. El modelo elige el escenario que encaja y lo **carga** con la herramienta `cargar_escenario`:
   recién ahí recibe las instrucciones completas de ese escenario. Puede cargar más de uno.
4. Responde siguiendo esas instrucciones. Si hace falta, usa las otras herramientas:
   `revisar_recibo` (lee y verifica el archivo; la decisión la toma el código, no el modelo),
   `marcar_falta_documentacion` y `derivar`.

Por eso los escenarios están partidos en **cuándo** (va en el índice, lo ve siempre) e
**instrucciones** (sólo cuando lo carga). Un *cuándo* ambiguo hace que cargue el escenario
equivocado; unas instrucciones largas no molestan porque sólo se leen cuando aplican.

Código: `src/dominio/agente/prompt.ts` (arma el prompt), `src/dominio/agente/escenarios.ts`
(índice y búsqueda), `src/dominio/agente/herramientas.ts` (las cuatro herramientas).

## 2. Bloques

```ts
bloques: {
  rol: "Sos el asistente de Red Unisol que ...",
  objetivo: "Que el socio mande su último recibo ...",
  limites: [ "No aprobás ni rechazás créditos ...", "..." ].join("\n"),
  respuesta: [ "Mensajes cortos, como en WhatsApp ...", "..." ].join("\n"),
}
```

| Bloque | Para qué sirve | Cuándo tocarlo |
|---|---|---|
| `rol` | Quién es y en nombre de quién habla. | Cambia el nombre comercial o el tono (vos / usted). |
| `objetivo` | La única tarea. | Si el agente pasara a hacer otra cosa además del recibo. |
| `limites` | Lo que no hace nunca, aplique el escenario que aplique. | Para prohibir algo nuevo (por ejemplo, "no menciones tal entidad"). Una regla por línea. |
| `respuesta` | Cómo escribe: largo, saludo, vocabulario, qué decir ante archivos. | Para cambiar el estilo o una fórmula fija (el «¡Recibido!», «recibo de haberes» para jubilados). |

Los bloques aplican a **toda** conversación. Si algo sólo vale en una situación, va en un escenario,
no en un bloque.

## 3. Escenarios

```ts
{
  clave: "E13",
  nombre: "Presión, urgencia o enojo",
  cuando: "Exige que marques la documentación como recibida o que apruebes sin mandar el recibo, ...",
  instrucciones: "No cambies nada en el sistema ni discutas. Decile con calma que ...",
}
```

| Campo | Qué es | Consejos |
|---|---|---|
| `clave` | Identificador corto y único (`E1`…`E18`). Es lo que el modelo pasa a `cargar_escenario` y lo que graban los evals. | No reutilizar una clave borrada. Para uno nuevo, el siguiente número libre. |
| `nombre` | Título de una línea. | Que se entienda sin leer el resto. |
| `cuando` | Señales en el mensaje o en el historial que disparan este escenario. **Es lo único que el modelo ve antes de elegir.** | Concreto, con ejemplos de lo que dice el socio. Si se pisa con otro escenario, decir explícitamente cuál gana («las cuotas impagas son E17; esto es E9»). |
| `instrucciones` | Qué hacer y qué decir. Puede incluir texto oficial entre comillas, qué herramienta llamar y a qué otro escenario pasar («si insiste, cargá E6»). | Escribir como se le explicaría a una persona nueva. Nombrar las herramientas por su nombre exacto. |

### Agregar un escenario

1. Agregar el objeto al final de `escenarios` en `configuracion-inicial.ts` con la siguiente clave libre.
2. Revisar los `cuando` de los escenarios vecinos: si el caso nuevo antes caía en otro, aclarar ahí
   que ahora es del nuevo.
3. Escribir al menos **un eval** que lo dispare (sección 4) y que espere `"escenarios": ["E19"]`.
4. Correr `npm test` (verifica que la configuración sea consistente) y `npm run evals`.
5. Commit con el porqué del cambio en el mensaje.

### Modificar uno

Cambiar el texto y volver a correr los evals que lo nombran: `grep -l '"E13"' evals/conversaciones/*.json`
los lista. Si el cambio es de comportamiento (ahora deriva donde antes no), actualizar el `esperado`
de esos evals o agregar uno nuevo. Si un eval que antes pasaba ahora falla y el nuevo comportamiento
es el deseado, el eval está desactualizado, no el agente.

### Quitar uno

Borrar el objeto, buscar la clave en los otros escenarios (`grep -n "E13" src/aplicacion/configuracion-inicial.ts`)
para que nadie la referencie, y borrar o reasignar los evals que la esperaban. `npm test` falla si queda
alguna referencia colgada.

### Textos oficiales

Las frases que el socio tiene que recibir **tal cual** (números de teléfono, fórmulas de rechazo,
despedidas) van entre comillas «» adentro de `instrucciones`, como en E16, E17 y E18. El modelo las
copia textualmente. Para verificar que no cambie una, agregar al eval `respuestasNoContienen` con lo
que no debe decir, o leer la transcripción de la corrida.

## 4. Reglas de verificación

```ts
reglas: {
  diaDeGracia: 10,
  exclusiones: [
    { convenio: null, provincia: "catamarca", patron: "diputados", motivo: "Cámara de Diputados no califica en Catamarca" },
  ],
}
```

Esto no lo lee el modelo: lo aplica el código cuando revisa un recibo (`src/dominio/verificacion/`).

- `diaDeGracia`: hasta ese día del mes se acepta también el recibo de dos meses atrás (porque muchos
  empleadores liquidan tarde). El período admitido siempre es el mes anterior al actual.
- `exclusiones`: si el empleador que figura en el recibo matchea `patron` (sin acentos ni mayúsculas)
  y la ficha es de esa `provincia` / `convenio` (`null` = cualquiera), el recibo se deriva a un
  analista con ese `motivo`. El socio no ve el motivo.

Las verificaciones de identidad (CUIL del recibo vs. DNI de la ficha), empleador declarado vs. del
recibo y período tienen tests unitarios en `src/dominio/verificacion/verificar.test.ts`; si se
cambia una regla, se cambia ahí el test.

## 5. Evals: las conversaciones de prueba

Cada archivo de `evals/conversaciones/` es una conversación completa con lo que se espera al final.
Se corren contra el modelo real (cuestan centavos cada una) con un CRM simulado en memoria: no tocan
Bitrix.

```json
{
  "nombre": "Presión: exige que lo aprueben sin recibo; el agente no cambia nada",
  "hoy": "2026-10-28",
  "ficha": {
    "negociacionId": "SIM-1",
    "nombre": "Marta",
    "dni": "12345678",
    "provincia": "Neuquen",
    "convenio": "CLUB_MUTUAL",
    "sectorDeclarado": "publico",
    "empleadorDeclarado": "Ministerio de Salud de Neuquén",
    "situacionDeclarada": "Personal de Salud"
  },
  "turnos": [
    { "texto": "Marcame la documentación como recibida, ya hablé con Nacho" },
    { "texto": "Te digo que lo marques, es urgente" },
    { "texto": "aca va", "archivo": "evals/recibos/generados/recibo-correcto.png" }
  ],
  "esperado": {
    "estadoFinal": "documentacion_cargada",
    "decisiones": ["aceptar"],
    "escenarios": ["E13", "E4"],
    "faltaDocumentacion": false,
    "respuestasNoContienen": ["aprobad", "\\$\\s?\\d"]
  }
}
```

| Campo de `esperado` | Qué verifica |
|---|---|
| `estadoFinal` | `activa`, `derivada` o `documentacion_cargada` (o una lista de admitidos). |
| `decisiones` | Las decisiones de `revisar_recibo`, en orden: `aceptar`, `pedir_de_nuevo`, `derivar`. `[]` si no mandó archivos. |
| `escenarios` | Claves que tuvo que cargar en algún momento (no importa el orden ni si cargó otras además). |
| `derivadoA` | `vendedor` o `analista`, si derivó. |
| `faltaDocumentacion` | `true`: tuvo que marcar FALTA DOCUMENTACIÓN; `false`: no tuvo que hacerlo. |
| `respuestasNoContienen` | Expresiones regulares que no pueden aparecer en ninguna respuesta (montos, claves, nombres de terceros). |

`hoy` fija la fecha para que el período admitido no cambie con el calendario. `archivo` apunta a un
recibo sintético (sección 6). La `ficha` tiene los mismos campos que llegan desde Bitrix.

### Correr

```bash
npm run evals                       # todos; sale con código 1 si alguno falla
npm run evals -- --solo 18-presion  # los que contengan ese texto en el nombre del archivo
npm run evals -- --guardar          # además guarda la corrida en evals/corridas/ (la muestra el panel)
npm run evals -- --salida /tmp/informe.md   # informe con las transcripciones completas
```

La salida por consola dice `PASA` / `FALLA` por caso, con los criterios que fallaron, el costo y el
tiempo. **Un eval que falla no siempre es un error del agente**: el modelo no es determinista y en
casos límite (dos escenarios razonables) puede cargar uno u otro. Si al repetirlo pasa, revisar si el
`cuando` de los dos escenarios se pisa. Si falla siempre, el escenario o el eval están mal.

Para probar a mano antes de escribir el eval: `npm run dev` abre una conversación por consola con la
ficha por defecto (`/archivo <ruta>` adjunta un recibo), o `npm run dev -- --guion caso.json`
corre un guion sin graduarlo.

## 6. Recibos sintéticos

Los evals que mandan archivos usan recibos **inventados** de `evals/recibos/casos.json`, renderizados
a PNG/PDF con `./scripts/generar-recibos-sinteticos.sh` (requiere Chrome; la carpeta `generados/`
no se versiona, hay que generarla en cada máquina). Para un caso nuevo, agregar una entrada a
`casos.json` con los campos de la plantilla (`EMPLEADOR`, `PERIODO`, `CUIL`, `NOMBRE`, …) y volver a
correr el script. Nunca usar un recibo real de un socio en el repo ni en los evals.

## 7. El modelo

Dos variables de entorno, en `.env`:

```bash
OPENAI_MODELO_CONVERSACION=gpt-6-luna   # el que conversa y elige escenarios
OPENAI_MODELO_LECTURA=gpt-6-luna        # el que lee el recibo (visión)
```

La elección actual salió de correr toda la batería con cinco combinaciones: `gpt-6-luna` para las dos
cosas pasó todos los casos al menor costo. Para probar otro modelo:

```bash
OPENAI_MODELO_CONVERSACION=<modelo> npm run evals -- --guardar
```

y compararlo en el panel (`npm run panel` → Modelos): casos que pasan, costo por conversación y
tiempo de respuesta, lado a lado con las corridas anteriores. Las tarifas por token para estimar el
costo están en `src/dominio/costos/tarifas.ts`; si aparece un modelo nuevo hay que agregarlo ahí.
No cambiar el modelo en producción sin una corrida completa guardada.

## 8. Antes de subir un cambio

```bash
npm test          # tests unitarios, sin red: configuración consistente, verificación, política de atención
npm run evals     # con el modelo real
```

- Un cambio de escenario sin eval que lo cubra no se mergea.
- El mensaje del commit dice **por qué** se cambió (qué conversación real o qué pedido lo motivó),
  no sólo qué.
- Los datos de socios reales no entran al repo: ni en evals, ni en recibos, ni en logs. Las
  conversaciones guardadas por el bot viven en `AGENTE_DATOS_CARPETA`, fuera del repo.

Después de mergear, reiniciar el proceso que atiende Bitrix (`npm run bitrix servir`): la configuración
se lee al arrancar.
