// Bitrix manda los eventos como formulario con claves estilo PHP: data[PARAMS][MESSAGE].
// Esto los convierte en un objeto anidado para poder leerlos con nombres.
export type Anidado = { [clave: string]: string | Anidado };

export function anidar(formulario: URLSearchParams): Anidado {
  const raiz: Anidado = {};
  for (const [clave, valor] of formulario) {
    const partes = clave.replace(/\]/g, "").split("[");
    let actual = raiz;
    partes.forEach((parte, i) => {
      if (i === partes.length - 1) {
        actual[parte] = valor;
        return;
      }
      const siguiente = actual[parte];
      if (typeof siguiente === "object") {
        actual = siguiente;
      } else {
        const nuevo: Anidado = {};
        actual[parte] = nuevo;
        actual = nuevo;
      }
    });
  }
  return raiz;
}

export function rama(valor: Anidado | string | undefined, ...camino: string[]): Anidado {
  let actual: Anidado | string | undefined = valor;
  for (const paso of camino) actual = typeof actual === "object" ? actual[paso] : undefined;
  return typeof actual === "object" ? actual : {};
}

export function hoja(valor: Anidado | string | undefined, ...camino: string[]): string {
  let actual: Anidado | string | undefined = valor;
  for (const paso of camino) actual = typeof actual === "object" ? actual[paso] : undefined;
  return typeof actual === "string" ? actual : "";
}
