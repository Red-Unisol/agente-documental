export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PALABRAS_VACIAS = new Set(["de", "del", "la", "el", "los", "las", "y", "en"]);

export function palabrasSignificativas(texto: string): Set<string> {
  return new Set(normalizar(texto).split(" ").filter((palabra) => palabra.length > 2 && !PALABRAS_VACIAS.has(palabra)));
}

export function compartenAlgunaPalabra(a: string, b: string): boolean {
  const palabrasDeB = palabrasSignificativas(b);
  return [...palabrasSignificativas(a)].some((palabra) => palabrasDeB.has(palabra));
}
