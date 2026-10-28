import { escapar, type Html } from "../html.js";

export type Seccion = "conversaciones" | "escenarios" | "reglas" | "evals" | "modelos";

export interface Pagina {
  seccion: Seccion;
  titulo: string;
  subtitulo?: string;
  acciones?: Html;
  cuerpo: Html;
  contadores: Partial<Record<Seccion, string | undefined>>;
}

const ESTILOS = `
  :root { --fondo:#f6f7f9; --panel:#fff; --borde:#e3e6ea; --tinta:#1b2430; --gris:#6b7684; --acento:#1f5fbf; --ok:#2e8b57; --alerta:#c98a14; --rojo:#c0392b; --violeta:#7b3fa0; }
  * { box-sizing:border-box } body { margin:0; font-family:-apple-system,"Inter","Segoe UI",sans-serif; color:var(--tinta); background:var(--fondo); font-size:13.5px }
  a { color:var(--acento) } .app { display:grid; grid-template-columns:220px 1fr; min-height:100vh }
  .lateral { background:#101826; color:#cfd6e0; padding:18px 14px } .marca { font-weight:700; color:#fff; font-size:15px } .marca small { display:block; font-weight:400; color:#8f9bb0; font-size:11px; margin-top:3px }
  .nav { margin-top:22px } .nav a { display:flex; justify-content:space-between; padding:9px 10px; border-radius:7px; color:#cfd6e0; text-decoration:none; margin-bottom:2px } .nav a.activo { background:var(--acento); color:#fff } .nav .n { background:rgba(255,255,255,.14); border-radius:10px; padding:0 7px; font-size:11px }
  .entorno { margin-top:28px; font-size:11px; color:#8f9bb0; line-height:1.5 } .entorno b { color:#ffd27a; display:block; margin-top:4px }
  .main { padding:22px 26px; min-width:0 } .cab { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:16px } h1 { font-size:20px; margin:0 } .sub { color:var(--gris); font-size:12.5px; margin-top:3px; max-width:760px }
  .tarjeta { background:var(--panel); border:1px solid var(--borde); border-radius:10px; padding:16px } .tarjeta h3 { margin:0 0 12px; font-size:13.5px }
  .dos { display:grid; grid-template-columns:1.15fr .85fr; gap:16px } .dos.iguales { grid-template-columns:1fr 1fr } .editor { display:grid; grid-template-columns:300px 1fr; gap:16px }
  .chip { display:inline-block; border-radius:12px; padding:2px 9px; font-size:11.5px; font-weight:600; white-space:nowrap } .chip.ok{background:#e6f4ec;color:var(--ok)} .chip.alerta{background:#fcf1dc;color:var(--alerta)} .chip.rojo{background:#fae6e3;color:var(--rojo)} .chip.violeta{background:#efe6f5;color:var(--violeta)} .chip.azul{background:#e6eefb;color:var(--acento)}
  .chat { display:flex; flex-direction:column; gap:10px; padding:6px 2px } .b { max-width:78%; padding:9px 12px; border-radius:12px; line-height:1.4; white-space:pre-wrap } .b.s { align-self:flex-start; background:#eef1f5; border-bottom-left-radius:3px } .b.a { align-self:flex-end; background:#dde9fb; border-bottom-right-radius:3px } .b .q { font-size:10.5px; color:var(--gris); margin-bottom:3px } .b.sistema { align-self:flex-end; background:#f1f1f1; color:var(--gris); font-style:italic } .adj { display:inline-block; border:1px dashed #9aa6b5; border-radius:6px; padding:3px 8px; font-size:11.5px; color:var(--gris); margin-top:5px }
  .paso { border-left:3px solid var(--borde); padding:4px 0 10px 12px; margin-left:4px; position:relative } .paso::before { content:""; position:absolute; left:-7px; top:7px; width:11px; height:11px; border-radius:50%; background:#fff; border:2px solid var(--acento) } .paso h4 { margin:0 0 3px; font-size:12.5px } .paso p, .paso li { margin:0; color:var(--gris); font-size:12px } .paso ul { margin:4px 0 0; padding-left:16px } .paso li.ok::marker{color:var(--ok)} .paso li.no::marker{color:var(--rojo)} .paso li b{color:var(--tinta);font-weight:600}
  table { width:100%; border-collapse:collapse } th { text-align:left; font-size:11.5px; color:var(--gris); font-weight:600; padding:8px 10px; border-bottom:1px solid var(--borde) } td { padding:10px; border-bottom:1px solid var(--borde); vertical-align:top } tr:last-child td { border-bottom:0 } .mono { font-family:ui-monospace,Menlo,monospace; font-size:12px; color:var(--acento) } td.num, th.num { text-align:right; font-variant-numeric:tabular-nums }
  .ficha { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:14px } .ficha div { background:#fff; border:1px solid var(--borde); border-radius:8px; padding:9px 12px } .ficha small { display:block; color:var(--gris); font-size:11px } .ficha b { font-size:13px }
  .lista a { display:block; padding:9px 10px; border-radius:7px; text-decoration:none; color:var(--tinta); border:1px solid transparent } .lista a.activo { background:#e6eefb; border-color:#c9d9f5 } .lista a small { display:block; color:var(--gris); font-size:11.5px }
  label { display:block; font-size:11.5px; color:var(--gris); margin:10px 0 4px } .campo { border:1px solid var(--borde); border-radius:7px; padding:9px 11px; background:#fff; min-height:20px; line-height:1.45; white-space:pre-wrap }
  .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:14px } .kpi { background:#fff; border:1px solid var(--borde); border-radius:10px; padding:14px 16px } .kpi small{display:block;color:var(--gris);font-size:11.5px} .kpi b{font-size:24px;font-weight:700} .kpi b.chico{font-size:15px}
  .nota { color:var(--gris); font-size:12px; margin:8px 0 0 } .fila-link { cursor:pointer } .fila-link:hover td { background:#fafbfd }
`;

const NAVEGACION: { seccion: Seccion; etiqueta: string }[] = [
  { seccion: "conversaciones", etiqueta: "Conversaciones" },
  { seccion: "escenarios", etiqueta: "Escenarios" },
  { seccion: "reglas", etiqueta: "Reglas" },
  { seccion: "evals", etiqueta: "Evals" },
  { seccion: "modelos", etiqueta: "Modelos y costos" },
];

export function pagina(p: Pagina, entorno: { modo: string; embudo: string; modelos: string }): Html {
  const nav = NAVEGACION.map(
    ({ seccion, etiqueta }) =>
      `<a href="/${seccion}" class="${seccion === p.seccion ? "activo" : ""}">${etiqueta}${p.contadores[seccion] ? `<span class="n">${escapar(p.contadores[seccion])}</span>` : ""}</a>`,
  ).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapar(p.titulo)} · Agente documental</title><style>${ESTILOS}</style></head>
<body><div class="app">
<aside class="lateral"><div class="marca">Agente documental<small>Red Unisol · Bitrix24</small></div><nav class="nav">${nav}</nav>
<div class="entorno">Entorno<b>${escapar(entorno.modo)}</b>${escapar(entorno.embudo)}<br>${escapar(entorno.modelos)}</div></aside>
<main class="main"><div class="cab"><div><h1>${escapar(p.titulo)}</h1>${p.subtitulo ? `<div class="sub">${p.subtitulo}</div>` : ""}</div><div>${p.acciones ?? ""}</div></div>${p.cuerpo}</main>
</div></body></html>`;
}
