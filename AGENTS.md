# Convenciones

- `src/dominio` no importa nada de infraestructura. `src/aplicacion` usa dominio y puertos.
  Bitrix, OpenAI y Prisma sólo se tocan desde `src/adaptadores`.
- Nombres en castellano con el vocabulario del negocio (socio, negociación, recibo, convenio, derivar).
- Funciones chicas que hacen una sola cosa. Comentarios sólo para explicar un porqué.
- Resultados de negocio como uniones discriminadas, no excepciones. Sin `any`, sin `null` de retorno.
- Tests con fixtures sintéticos. Nunca datos reales de socios en el repo ni en logs.
- Secretos sólo por variables de entorno.
