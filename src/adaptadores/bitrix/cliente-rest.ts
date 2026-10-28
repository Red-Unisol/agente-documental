import type { AlmacenDeTokens, TokensDeBitrix } from "./tokens.js";

export interface CredencialesDeAplicacion {
  clientId: string;
  clientSecret: string;
}

interface RespuestaRest<T> {
  result?: T;
  error?: string;
  error_description?: string;
}

const MARGEN_DE_RENOVACION_MS = 60_000;
const URL_OAUTH = "https://oauth.bitrix.info/oauth/token/";

// Cliente REST de la aplicación local: firma cada llamada con el token vigente y lo
// renueva solo cuando está por vencer. Un método por llamada; sin lógica de negocio.
export class ClienteBitrix {
  constructor(
    private readonly tokens: AlmacenDeTokens,
    private readonly credenciales: CredencialesDeAplicacion | undefined,
  ) {}

  async llamar<T>(metodo: string, parametros: Record<string, unknown> = {}): Promise<T> {
    const vigentes = await this.tokensVigentes();
    const respuesta = await fetch(`https://${vigentes.dominio}/rest/${metodo}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...parametros, auth: vigentes.accessToken }),
    });
    const cuerpo = (await respuesta.json()) as RespuestaRest<T>;
    if (cuerpo.error !== undefined) throw new Error(`Bitrix ${metodo}: ${cuerpo.error} · ${cuerpo.error_description ?? ""}`.trim());
    return cuerpo.result as T;
  }

  async descargar(url: string): Promise<Uint8Array> {
    // Las URLs de descarga de archivos (urlDownload) autentican con ?auth=; el header no alcanza.
    const vigentes = await this.tokensVigentes();
    const destino = new URL(url);
    destino.searchParams.set("auth", vigentes.accessToken);
    const respuesta = await fetch(destino, { headers: { authorization: `Bearer ${vigentes.accessToken}` } });
    if (!respuesta.ok) throw new Error(`Bitrix descarga: HTTP ${respuesta.status}`);
    return new Uint8Array(await respuesta.arrayBuffer());
  }

  async actualizarTokens(parciales: Omit<TokensDeBitrix, "botId">): Promise<void> {
    const actuales = await this.tokens.leer().catch(() => undefined);
    await this.tokens.guardar({ ...actuales, ...parciales });
  }

  private async tokensVigentes(): Promise<TokensDeBitrix> {
    const actuales = await this.tokens.leer();
    const porVencer = new Date(actuales.expiraAt).getTime() - Date.now() < MARGEN_DE_RENOVACION_MS;
    return porVencer ? this.renovar(actuales) : actuales;
  }

  private async renovar(actuales: TokensDeBitrix): Promise<TokensDeBitrix> {
    if (!this.credenciales) throw new Error("El token de Bitrix venció y faltan BITRIX24_APP_CLIENT_ID / BITRIX24_APP_CLIENT_SECRET para renovarlo.");
    const consulta = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.credenciales.clientId,
      client_secret: this.credenciales.clientSecret,
      refresh_token: actuales.refreshToken,
    });
    const respuesta = await fetch(`${URL_OAUTH}?${consulta}`);
    const cuerpo = (await respuesta.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
    if (!cuerpo.access_token || !cuerpo.refresh_token) throw new Error(`Bitrix no renovó el token: ${cuerpo.error ?? "respuesta inesperada"}`);
    const renovados: TokensDeBitrix = {
      ...actuales,
      accessToken: cuerpo.access_token,
      refreshToken: cuerpo.refresh_token,
      expiraAt: new Date(Date.now() + (cuerpo.expires_in ?? 3600) * 1000).toISOString(),
    };
    await this.tokens.guardar(renovados);
    return renovados;
  }
}
