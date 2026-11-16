const PESOS_CUIL = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

// Un CUIL tiene 11 dígitos. Si el DNI es de 7 cifras (gente nacida antes de ~1970, muchos jubilados)
// suele venir escrito sin el cero: "20-8333444-5". Se repone el cero y el verificador decide.
export function normalizarCuil(cuil: string): string {
  const digitos = soloDigitos(cuil);
  return digitos.length === 10 ? `${digitos.slice(0, 2)}0${digitos.slice(2)}` : digitos;
}

export function cuilEsValido(cuil: string): boolean {
  const digitos = normalizarCuil(cuil);
  if (digitos.length !== 11) return false;
  const suma = PESOS_CUIL.reduce((acumulado, peso, i) => acumulado + peso * Number(digitos[i]), 0);
  const resto = suma % 11;
  const verificador = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return verificador === Number(digitos[10]);
}

export function dniDeCuil(cuil: string): string {
  return String(Number(normalizarCuil(cuil).slice(2, 10)));
}

export function cuilCorrespondeADni(cuil: string, dni: string): boolean {
  return mismoDocumento(dniDeCuil(cuil), dni);
}

export function mismoDocumento(a: string, b: string): boolean {
  return Number(soloDigitos(a)) > 0 && Number(soloDigitos(a)) === Number(soloDigitos(b));
}

// Mismo largo y a lo sumo dos dígitos distintos: lo que pasa cuando una foto borrosa hace leer un 3 por un 8.
export function casiElMismoDocumento(a: string, b: string): boolean {
  const [x, y] = [String(Number(soloDigitos(a))), String(Number(soloDigitos(b)))];
  if (x.length !== y.length) return false;
  const distintos = [...x].filter((digito, i) => digito !== y[i]).length;
  return distintos > 0 && distintos <= 2;
}

export interface DocumentoLeido {
  numero: string;
  tipo: "cuil_valido" | "cuil_dudoso" | "dni";
}

// Los números de documento que trae una liquidación, vengan en el campo que vengan: hay recibos que
// rotulan "DOC: CUIL" y el número va sin guiones, y el lector lo puede dejar en cualquiera de los dos.
export function documentosLeidos(liquidacion: { cuil: string | undefined; dni: string | undefined }): DocumentoLeido[] {
  return [liquidacion.cuil, liquidacion.dni].flatMap((texto): DocumentoLeido[] => {
    const digitos = soloDigitos(texto ?? "");
    if (digitos.length >= 10 && digitos.length <= 11) return [{ numero: dniDeCuil(digitos), tipo: cuilEsValido(digitos) ? "cuil_valido" : "cuil_dudoso" }];
    if (digitos.length >= 7 && digitos.length <= 8) return [{ numero: digitos, tipo: "dni" }];
    return [];
  });
}
