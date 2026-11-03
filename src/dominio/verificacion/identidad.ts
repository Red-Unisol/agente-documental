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
  return dniDeCuil(cuil) === String(Number(soloDigitos(dni)));
}
