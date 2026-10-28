import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

// Credenciales de la aplicación local, tal como las entrega Bitrix al instalar y en
// cada evento. Viven en un archivo fuera del repositorio; nunca en el código.
const esquema = z.object({
  dominio: z.string().min(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiraAt: z.string().datetime(),
  botId: z.number().int().positive().optional(),
});

export type TokensDeBitrix = z.infer<typeof esquema>;

export interface AlmacenDeTokens {
  leer(): Promise<TokensDeBitrix>;
  guardar(tokens: TokensDeBitrix): Promise<void>;
}

export class TokensEnArchivo implements AlmacenDeTokens {
  constructor(private readonly ruta: string) {}

  async leer(): Promise<TokensDeBitrix> {
    const contenido = await readFile(this.ruta, "utf8").catch(() => {
      throw new Error(`No existe el archivo de tokens de Bitrix (${this.ruta}). Instalá la aplicación local primero.`);
    });
    return esquema.parse(JSON.parse(contenido));
  }

  async guardar(tokens: TokensDeBitrix): Promise<void> {
    await writeFile(this.ruta, JSON.stringify(tokens, null, 2));
  }
}

// Los eventos y la instalación traen los tokens con la vigencia en segundos.
export function tokensDesdeEvento(dominio: string, auth: { access_token: string; refresh_token: string; expires_in: string | number }, ahora = new Date()): Omit<TokensDeBitrix, "botId"> {
  return {
    dominio,
    accessToken: auth.access_token,
    refreshToken: auth.refresh_token,
    expiraAt: new Date(ahora.getTime() + Number(auth.expires_in) * 1000).toISOString(),
  };
}
