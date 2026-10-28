export type Html = string;

export function escapar(valor: unknown): Html {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export function chip(clase: "ok" | "alerta" | "rojo" | "violeta" | "azul", texto: string): Html {
  return `<span class="chip ${clase}">${escapar(texto)}</span>`;
}

export function fecha(iso: string | Date): string {
  const valor = typeof iso === "string" ? new Date(iso) : iso;
  return valor.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function usd(valor: number | undefined, decimales = 4): string {
  return valor === undefined ? "—" : `US$ ${valor.toFixed(decimales)}`;
}

export function segundos(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}
