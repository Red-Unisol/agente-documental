const PESOS_CUIL = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

export function cuilEsValido(cuil: string): boolean {
  const digitos = soloDigitos(cuil);
  if (digitos.length !== 11) return false;
  const suma = PESOS_CUIL.reduce((acumulado, peso, i) => acumulado + peso * Number(digitos[i]), 0);
  const resto = suma % 11;
  const verificador = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return verificador === Number(digitos[10]);
}

export function dniDeCuil(cuil: string): string {
  return String(Number(soloDigitos(cuil).slice(2, 10)));
}

export function cuilCorrespondeADni(cuil: string, dni: string): boolean {
  return dniDeCuil(cuil) === String(Number(soloDigitos(dni)));
}
