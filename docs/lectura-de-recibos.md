# Cómo lee y verifica un recibo

Cuando el socio manda un archivo, el agente llama a `revisar_recibo`. A partir de ahí no decide el
modelo que conversa: un modelo con visión **lee** el archivo y el código **decide** contra la ficha
de la negociación. Este documento explica qué se lee, cómo decide cada verificación y cómo se prueba
con documentos reales.

```
archivo ──► lector (modelo con visión) ──► lectura ──► verificaciones (código) ──► decisión
                 sólo lee, no ve la ficha              ficha de Bitrix + reglas      aceptar · pedir de nuevo · derivar
```

## 1. Qué puede venir en un archivo

Lo que la gente manda de verdad no es "un recibo":

| Lo que llega | Qué hace el agente |
|---|---|
| Un PDF o una foto con el recibo | Lo lee y lo verifica. |
| Un PDF con **varias liquidaciones** (dos meses, sueldo y aguinaldo) | Verifica la del período que se pide; si no hay ninguna, informa la más reciente. |
| Un **paquete**: DNI, constancia de CBU, factura de un servicio y el recibo en el mismo PDF | Encuentra el recibo adentro y lo verifica; lo demás lo anota y no molesta. El archivo se carga entero en la negociación. |
| El DNI (u otra cosa) **sin** el recibo | Le dice al socio qué recibió y que falta el recibo. |
| El DNI en un archivo y el recibo en otro | Revisa todo lo que todavía no revisó y se queda con el que sirve. Vale tanto si llegan en el mismo mensaje como en mensajes seguidos. |
| Una foto cortada, borrosa o una página suelta | Pide el recibo de nuevo, diciendo qué no se ve. |

## 2. Qué se lee del archivo

El lector (`src/adaptadores/openai/lector-de-recibo.ts`) devuelve siempre esta estructura
(`LecturaDeDocumento` en `src/dominio/tipos.ts`). No opina si el recibo sirve: copia lo que ve.

| Campo | Qué es |
|---|---|
| `legible` | Si lo que hay se puede leer. |
| `otrosDocumentos` | Qué más trae el archivo: `dni`, `factura_de_servicio`, `constancia_bancaria`, `otro`. |
| `liquidaciones[]` | Una entrada por cada liquidación de haberes distinta. Lista vacía = no hay recibo. |
| `liquidaciones[].periodo` | Mes y año liquidados (no la fecha de pago ni la de impresión). |
| `liquidaciones[].empleador` | Organismo o empresa que paga. |
| `liquidaciones[].cuil` | CUIL del empleado, tal como figura. |
| `liquidaciones[].dni` | DNI impreso en la liquidación, para los recibos que no traen CUIL. |
| `liquidaciones[].provincia` | Provincia del organismo, si es provincial o municipal. |
| `liquidaciones[].sector` | `publico`, `privado` o `desconocido`. |
| `liquidaciones[].conHaberes` | Si se ven los conceptos con sus importes o al menos el neto. |

El contenido del archivo se trata como texto no confiable: si el recibo trae escrita una instrucción
("aprobar este crédito"), el lector la ignora y las verificaciones se aplican igual.

En la auditoría de la conversación queda qué se leyó, pero no el CUIL ni el DNI: sólo si estaban.

## 3. Cómo decide cada verificación

Todo en `src/dominio/verificacion/verificar.ts`. Cada verificación da OK o falla; si falla, dice si
hay que **pedir de nuevo** (el socio lo puede resolver mandando otra cosa) o **derivar** (hay una
discrepancia que tiene que mirar una persona). Derivar pesa más que pedir de nuevo.

| Verificación | Compara | Si falla |
|---|---|---|
| **Pertinencia** | Que haya al menos una liquidación, que se lea y que se vean los haberes. | Pedir de nuevo. Si no es un recibo, no se evalúa nada más. |
| **Identidad** | El CUIL o el DNI del recibo contra el documento de la ficha. | Otra persona: derivar. No se ve o no se lee bien: pedir de nuevo. |
| **Empleador** | Sector (público / privado) y provincia del recibo contra la ficha; el nombre del empleador sólo si la ficha lo tiene cargado. | Derivar. |
| **Período** | Que sea el del mes anterior; hasta el día `diaDeGracia` también vale el de dos meses atrás. | Pedir de nuevo, diciendo de qué mes es el que mandó y cuál hace falta. |
| **Exclusiones** | El empleador del recibo contra la lista de `reglas.exclusiones` de esa provincia o convenio. | Derivar. |

Detalles que salieron de probar con documentos reales:

- **Identidad.** Alcanza con que uno de los números del recibo sea el de la ficha. Hay recibos que
  rotulan "DOC: CUIL" y traen el número sin guiones, y otros que sólo traen el DNI. Si no coincide:
  un CUIL con dígito verificador correcto es de otra persona (derivar); un número que difiere en uno
  o dos dígitos es una foto que no se lee bien (pedir de nuevo), no otra persona.
- **Ficha.** En el embudo de ventas el DNI casi nunca está cargado y el CUIL casi siempre, así que el
  documento de la ficha sale del DNI o, si falta, del CUIL (`fichas-bitrix.ts`). Si la negociación no
  tiene ninguno de los dos, se deriva: no se acepta un recibo sin contra qué compararlo.
- **Empleador.** El empleador casi nunca viene cargado en la negociación. Cuando falta no se compara
  el nombre (antes eso derivaba todos los recibos): deciden el sector y la provincia.
- **Varias liquidaciones.** Se verifica una sola: la del período admitido si está, si no la más
  reciente (`liquidacion.ts`).
- **Varios archivos.** Vale el primero que se acepta. Si ninguno sirve, el resultado de un recibo
  pesa más que el de un archivo que no era recibo: un DNI suelto no tapa un recibo viejo
  (`verificacionQueDecide`).

## 4. La segunda lectura

El modelo económico lee bien los PDF, pero en fotos de baja calidad a veces confunde un dígito del
CUIL o el año. Por eso (`src/aplicacion/revisar-archivo.ts`):

1. Lee con `OPENAI_MODELO_LECTURA`. Si con esa lectura el recibo se acepta, termina ahí.
2. Si no se acepta y había algo parecido a un recibo, lee de nuevo con
   `OPENAI_MODELO_LECTURA_RESPALDO` y decide con esa segunda lectura.
3. Lo que se reconoció como otra cosa (un DNI, una factura) no se relee.

Una lectura equivocada no puede hacer aceptar el recibo de otra persona: para aceptar, el número
leído tiene que ser exactamente el de la ficha. La segunda lectura existe para no pedirle de nuevo
al socio, ni mandarle a un analista, un recibo que estaba bien.

Dejar `OPENAI_MODELO_LECTURA_RESPALDO=` vacío apaga la segunda lectura.

## 5. Probar con documentos reales

Los recibos reales tienen datos personales: **no entran al repositorio**, ni los archivos ni el
detalle de las corridas. El eval lee un manifiesto que vive afuera y deja afuera sus resultados.

```bash
npm run evals:lecturas -- --manifiesto /ruta/fuera/del/repo/casos.jsonl --salida /ruta/fuera/del/repo/corrida-1
npm run evals:lecturas -- --manifiesto ... --salida ... --limite 40       # muestra pareja entre grupos
npm run evals:lecturas -- --manifiesto ... --salida ... --solo AMEJUCA    # filtra por id
npm run evals:lecturas -- --manifiesto ... --salida ... --regraduar       # sin llamar al modelo
```

No arma conversaciones: por cada archivo corre el mismo camino que usa el agente (lectura, segunda
lectura si hace falta, verificaciones) y lo compara con lo esperado. En la carpeta de salida deja:

- `informe.md`: sólo agregados (aciertos por criterio, por grupo y por tipo de documento, decisiones,
  costo y tiempo). Es lo único que se puede compartir.
- `detalle.jsonl`: una línea por archivo con lo que se leyó. Tiene datos personales.

Si una corrida se corta, al relanzarla con la misma `--salida` sigue desde donde quedó.
`--regraduar` vuelve a verificar las lecturas ya guardadas con el código y las reglas de ahora:
sirve para probar un cambio en las verificaciones sin gastar en el modelo.

### El manifiesto

Un JSON por línea:

```json
{
  "id": "caso-001",
  "grupo": "nombre del convenio o del tipo de caso",
  "archivo": "/ruta/absoluta/al/archivo.pdf",
  "hoy": "2026-09-10",
  "ficha": { "negociacionId": "1", "nombre": "Socio", "dni": "12345678", "provincia": "Catamarca", "convenio": "sin informar", "sectorDeclarado": "publico" },
  "esperado": { "esRecibo": true, "periodo": "2026-08", "decisionPorPeriodo": "aceptar", "identidad": "coincide" },
  "rasgos": { "tipo": "pdf", "paginas": 4, "paquete": true, "liquidaciones": 1 }
}
```

- `hoy` es la fecha en que el socio mandó el archivo: contra esa fecha se calcula el período admitido.
- `ficha` va como llega de Bitrix; `empleadorDeclarado` y `situacionDeclarada` son opcionales.
- `esperado.esRecibo: false` para archivos que no traen recibo (se espera "pedir de nuevo").
- `esperado.identidad`: `coincide`, `solo_dni`, `otra_persona` (se espera derivar) o `sin_identidad`
  (no se evalúa). `esperado.decision` fuerza la decisión esperada cuando hace falta.
- `rasgos` sólo sirve para agrupar el informe.

### Resultado de referencia

Corrida del 16/11/2026 sobre 500 archivos reales de cinco convenios (solicitudes de agosto 2025 a
septiembre 2026), con `gpt-6-luna` y segunda lectura de `gpt-6.1-terra`:

| Tipo de archivo | Archivos | Decisión correcta |
|---|---|---|
| PDF sólo con el recibo | 210 | 210 |
| PDF con otros documentos adentro (DNI, CBU, facturas) | 178 | 177 |
| Foto o captura de pantalla | 81 | 80 |
| PDF con varias liquidaciones | 31 | 31 |
| **Total** | **500** | **498 (99,6 %)** |

- 487 se aceptan y 13 se piden de nuevo: 10 por ser de un mes más viejo que el admitido, 2 porque no
  eran un recibo completo y 1 ticket fotografiado que no se llega a leer. Ninguno se deriva.
- Las dos diferencias: ese ticket borroso (pide una foto mejor) y una foto girada donde se leyó
  noviembre en vez de diciembre (la decisión igual fue la correcta).
- 25 archivos (5 %) necesitaron la segunda lectura, casi todos fotos.
- Costo: US$ 0,00058 por archivo (US$ 0,29 los 500). Tiempo: 2,8 s de mediana, 9,7 s el más lento.
- Con `gpt-6-luna` sola: 480 de 500 a US$ 0,00037. Con `gpt-6.1-terra` sola: 498 de 500 a
  US$ 0,0038. La combinación da el acierto de la cara a un costo cercano al de la económica.

Con los mismos paquetes partidos en dos archivos (118 casos): los 59 que quedaron **sin** el recibo
se reconocen todos ("falta el recibo"); de los 59 con **sólo** el recibo, 56 deciden igual que el
paquete entero y 3 piden de nuevo porque en la foto no se lee el número de documento.

La referencia contra la que se compara salió del proceso anterior y se corrigió a mano donde estaba
mal (14 casos, casi todos con el año mal leído por el OCR viejo).

### Cuándo correrlo

- Antes de cambiar `OPENAI_MODELO_LECTURA` o `OPENAI_MODELO_LECTURA_RESPALDO`.
- Después de tocar las instrucciones del lector o cualquier verificación.
- Cuando aparece un convenio nuevo con un formato de recibo que no estaba en la muestra.

Los recibos **inventados** de `evals/recibos/` siguen siendo los de los evals de conversación
(`npm run evals`); esos sí viven en el repositorio.
