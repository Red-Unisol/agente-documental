# Probar el agente dentro de Bitrix

Tres maneras, de la más simple a la más parecida a un caso real. Ninguna toca negociaciones del
embudo de ventas.

## 1. Chat web del canal de prueba, con la negociación ficticia

El canal de prueba tiene un "Chat en vivo" con enlace público (*Contact Center → el canal → Chat en
vivo*). Ese chat no viene atado a ninguna negociación, así que el agente usa
`BITRIX24_NEGOCIACION_PRUEBA`: una negociación ficticia del embudo de prueba
(`npm run bitrix crear-negociacion-prueba` crea una).

- Cada ventana nueva del navegador (o una ventana de incógnito) es una conversación nueva.
- El agente lee la negociación en cada mensaje. Para probar una situación, se cambia la negociación
  de prueba en Bitrix (la etapa, la cantidad de créditos activos, una oferta) y se vuelve a escribir.
- Para repetir la prueba del recibo: volver la negociación a DOCUMENTACIÓN y quitarle el recibo
  cargado. Con el recibo ya cargado, o en una etapa posterior, el agente no lo vuelve a pedir.
- Si el agente deriva, el chat pasa a una persona y el agente deja de contestar en esa ventana. Para
  seguir probando, abrir otra ventana de incógnito.
- Como el chat no está atado a la negociación, el agente copia la conversación en un comentario de
  la negociación para que se vea en su línea de tiempo.

## 2. Con una negociación real, sobre una copia

Sirve para ver cómo respondería el agente en un caso concreto: con los datos de esa negociación y la
conversación que ya tuvo el socio. **La negociación real no se modifica**: el agente la lee y trabaja
sobre una copia en el embudo de prueba.

Se enciende con `AGENTE_CLAVE_DE_PRUEBAS` (8 caracteres o más; vacía = apagado). En el chat web del
canal de prueba se manda **un mensaje con el enlace de la negociación y la clave**:

```
probar https://<portal>.bitrix24.es/crm/deal/details/123456/ <clave>
```

El agente contesta algo así:

> Modo de prueba. Copié la negociación 123456 en la negociación de prueba 123999; la original no se
> modificó. Etapa: OFERTA. Traje los últimos 14 mensajes de su conversación. Desde el próximo
> mensaje, escribí como si fueras el socio.

A partir de ahí, lo que se escriba en ese chat es el socio de esa negociación.

**Qué ve quien prueba.** Al arrancar, el agente manda una nota con todo lo que tiene de esa
negociación: provincia, convenio, situación laboral y empleador declarados, la etapa, si el recibo
está cargado, los datos que puede contar y si tiene que pedir el recibo. Después de cada respuesta
manda otra con lo que hizo en ese mensaje: qué escenario cargó, qué leyó del archivo, qué decidió la
verificación y por qué, qué cambió en Bitrix y, si derivó, el motivo interno. Las notas empiezan con
`NOTA DE PRUEBA`, van en un mensaje aparte y el modelo no las ve. Si una respuesta parece inventada,
la nota dice de qué dato salió.

**Empezar de cero.** Mandar de nuevo un enlace con la clave, el mismo u otro, en el mismo chat: se
arma una copia nueva y la conversación arranca limpia. No hace falta cerrar la ventana ni borrar
datos del navegador. En modo de prueba una derivación queda anotada en la negociación pero el chat
no se transfiere a nadie, justamente para poder seguir probando ahí.

Qué hace, en orden (`src/adaptadores/bitrix/copia-de-negociacion.ts`):

1. Lee la negociación indicada. Sólo lectura.
2. Crea una negociación nueva en el embudo de prueba, titulada `PRUEBA · copia de la negociación <id>`,
   en la etapa equivalente, a nombre del usuario del agente. Copia únicamente los campos con los que
   el agente arma la ficha (`campos` del mapeo) y los que puede contarle al socio (`datosParaElSocio`).
3. Crea un contacto nuevo con el nombre de pila y sin teléfono ni mail, para que ninguna
   automatización pueda escribirle al socio real.
4. Trae los últimos 40 mensajes de la conversación del canal abierto atada a la negociación real y
   los carga como historial: lo que escribió el socio como entrante, lo de Red Unisol como saliente.
5. Deja el chat de prueba hablando sobre la copia. El pedido (con la clave) no se guarda ni llega al modelo.

Lo que **no** se copia: el recibo y cualquier otro archivo, el teléfono, el mail, el contacto y el
responsable originales, y los campos que no están en el mapeo (BCRA, decisiones internas, atribución).
Si la negociación real tenía el recibo cargado, la copia figura sin recibo.

Si el enlace ya es de una negociación del embudo de prueba, se usa esa misma sin copiar (y sin
volverla a su estado inicial). Desde la consola,
`npm run bitrix copiar-negociacion <id o enlace>` hace sólo la copia.

Cuidados:

- El enlace del chat de prueba es público: la clave es lo único que impide que cualquiera pida la
  copia de una negociación. Compartirla sólo con quien prueba y cambiarla cuando termine la ronda.
- Las copias quedan en el embudo de prueba con datos reales del socio (CUIL, situación laboral,
  créditos). Borrarlas al terminar: se reconocen por el título.
- La conversación de prueba se guarda en `AGENTE_DATOS_CARPETA` como cualquier otra y pasa por el
  modelo de OpenAI, incluidos los mensajes anteriores que se trajeron.
- En producción la clave va vacía.

## 3. WhatsApp, con una lista de números

Para probar por la línea real sin que el agente atienda a nadie más: `AGENTE_LISTA_BLANCA` con los
teléfonos de quienes prueban, cada uno con su negociación de prueba
(`5493510000000:123456`). Los chats de cualquier otro número se ceden a la cola de operadores sin que
el agente escriba nada. El detalle está en el README, "Cuándo atiende y cuándo se corre".

## Qué mirar después de una prueba

- La línea de tiempo de la negociación: el recibo cargado, los cambios de etapa y los comentarios
  del agente con el motivo de cada derivación.
- El registro del agente: una línea por evento con qué hizo (respondió, cedió el chat, modo de prueba).
- La conversación guardada en `AGENTE_DATOS_CARPETA/<chat>.json`: además de los mensajes trae la
  auditoría (qué escenario cargó, qué leyó de cada archivo, qué decidió y por qué) y el costo.
