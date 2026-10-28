const PATRONES = [
  { nombre: "CBU/CVU", regex: /\b\d{22}\b/g },
  { nombre: "CUIL/CUIT", regex: /\b\d{2}-?\d{8}-?\d\b/g },
  { nombre: "DNI", regex: /\b\d{1,2}[.\s]?\d{3}[.\s]?\d{3}\b/g },
];

export interface TextoFiltrado {
  texto: string;
  omitidos: string[];
}

export function omitirIdentificadores(texto: string): TextoFiltrado {
  const omitidos: string[] = [];
  const filtrado = PATRONES.reduce((parcial, patron) => {
    return parcial.replace(patron.regex, () => {
      omitidos.push(patron.nombre);
      return "[dato omitido]";
    });
  }, texto);
  return { texto: filtrado, omitidos };
}
