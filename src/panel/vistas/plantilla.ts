import { escapar, type Html } from "../html.js";

export type Seccion = "conversaciones" | "prompt" | "escenarios" | "reglas" | "evals" | "modelos";

export interface Pagina {
  seccion: Seccion;
  titulo: string;
  subtitulo?: string;
  cuerpo: Html;
  contadores: Partial<Record<Seccion, string | undefined>>;
}

export interface Entorno {
  modo: string;
  embudo: string;
  modelos: string;
}

// Identidad del panel: hoja cálida, tinta azul, filetes finos, cifras en mono y
// títulos condensados. Nada de sombras ni tarjetas flotando: lo que separa el
// contenido son líneas y espacio.
const ESTILOS = `
  :root {
    --hoja:#F2EFE7; --papel:#FAF8F3; --tinta:#1A2747; --azul:#2346A0; --gris:#5B6889;
    --linea:#D8D3C6; --linea-azul:#2346A0; --linea-suave:#E6E2D8; --azul-suave:#E3E8F4;
    --ok:#3A7D5C; --alerta:#A8730F; --rojo:#B5382B; --violeta:#6B4E9B;
    --sans:"IBM Plex Sans",-apple-system,"Segoe UI",sans-serif; --mono:"IBM Plex Mono",ui-monospace,Menlo,monospace; --cond:"IBM Plex Sans Condensed",var(--sans);
  }
  * { box-sizing:border-box } html { background:var(--hoja) }
  body { margin:0; font-family:var(--sans); color:var(--tinta); font-size:14px; line-height:1.45; -webkit-font-smoothing:antialiased }
  a { color:var(--azul); text-decoration:none } a:hover { text-decoration:underline; text-underline-offset:2px }
  b { font-weight:600 }

  .mono, .eyebrow, th, .kpi small, .rotulo small, .nav .n, .lista small .ref, .ledger .quien, .eje, .leyenda { font-family:var(--mono); text-transform:uppercase; letter-spacing:.08em }
  .eyebrow { font-size:10.5px; color:var(--gris); font-weight:500 }
  .cond { font-family:var(--cond); font-weight:600 }

  header.cab { border-bottom:1px solid var(--linea-azul); background:var(--hoja) }
  .cab .fila { max-width:1280px; margin:0 auto; padding:0 32px; display:flex; align-items:stretch; gap:20px }
  .marca { display:flex; align-items:center; gap:12px; padding:14px 0; white-space:nowrap }
  .marca .iso { width:28px; height:28px; display:block }
  .marca .nombre { font-family:var(--cond); font-weight:600; font-size:17px; letter-spacing:.01em; color:var(--azul); text-transform:uppercase; line-height:1 }
  .marca .para { display:block; font-family:var(--mono); font-size:9.5px; letter-spacing:.1em; color:var(--gris); margin-top:4px; text-transform:uppercase }
  .nav { display:flex; align-items:stretch; margin-left:auto }
  .nav a { display:flex; align-items:center; gap:7px; padding:0 11px; color:var(--tinta); font-size:13px; border-bottom:2px solid transparent; margin-bottom:-1px; white-space:nowrap }
  .nav a:hover { text-decoration:none; color:var(--azul) }
  .nav a.activo { color:var(--azul); border-bottom-color:var(--azul) }
  .nav .n { font-size:10px; color:var(--gris); letter-spacing:.06em } .nav a.activo .n { color:var(--azul) }
  .nav .cuenta { font-family:var(--mono); font-size:10.5px; color:var(--gris); border:1px solid var(--linea); padding:1px 6px; border-radius:2px }
  .entorno { display:flex; align-items:center; gap:14px; padding-left:18px; border-left:1px solid var(--linea); font-family:var(--mono); font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:var(--gris); white-space:nowrap }
  @media (max-width:1400px) { .entorno .modelos { display:none } }
  .entorno b { color:var(--azul); font-weight:500 } .entorno .punto { width:7px; height:7px; border-radius:50%; background:var(--alerta); display:inline-block; margin-right:7px; vertical-align:0 }

  main { max-width:1280px; margin:0 auto; padding:30px 32px 60px }
  .titulo { display:flex; align-items:flex-end; justify-content:space-between; gap:24px; padding-bottom:16px; border-bottom:1px solid var(--linea-azul); margin-bottom:26px }
  h1 { font-family:var(--cond); font-weight:600; font-size:30px; line-height:1; margin:0; color:var(--azul); text-transform:uppercase; letter-spacing:.01em }
  .titulo .sub { font-size:14px; color:var(--gris); margin:10px 0 0; max-width:820px }
  .titulo .num { font-family:var(--mono); font-size:11px; letter-spacing:.1em; color:var(--gris); display:block; margin-bottom:10px }

  .sec { display:flex; align-items:baseline; gap:12px; padding-bottom:7px; border-bottom:1px solid var(--linea-azul); margin:0 0 14px }
  .sec .n { font-family:var(--mono); font-size:10.5px; color:var(--azul); letter-spacing:.08em }
  .sec h2 { font-family:var(--cond); font-weight:600; font-size:17px; margin:0; text-transform:uppercase; letter-spacing:.02em; color:var(--azul); flex:1 }
  .sec .der { font-family:var(--mono); font-size:10.5px; color:var(--gris); letter-spacing:.06em; text-transform:uppercase }
  .bloque { margin-bottom:30px }
  .dos { display:grid; grid-template-columns:1.15fr .85fr; gap:28px; align-items:start } .dos.iguales { grid-template-columns:1fr 1fr }
  .editor { display:grid; grid-template-columns:320px 1fr; gap:28px; align-items:start }
  @media (max-width:980px) { .dos, .dos.iguales, .editor { grid-template-columns:1fr } .entorno { display:none } }

  .parrafo { font-size:14px; max-width:760px; margin:0 0 12px } .nota { color:var(--gris); font-size:12.5px; margin:10px 0 0; line-height:1.5; max-width:760px }
  .chip { display:inline-block; font-family:var(--mono); font-size:10px; letter-spacing:.06em; text-transform:uppercase; padding:2px 7px; border:1px solid currentColor; border-radius:2px; white-space:nowrap; line-height:1.5; font-weight:500 }
  .chip.ok { color:var(--ok) } .chip.alerta { color:var(--alerta) } .chip.rojo { color:var(--rojo) } .chip.violeta { color:var(--violeta) } .chip.azul { color:var(--azul) }
  .chip.lleno { background:var(--azul); color:#fff; border-color:var(--azul) }

  .kpis { display:grid; grid-template-columns:repeat(4,1fr); border:1px solid var(--linea-azul); margin-bottom:28px; background:var(--papel) }
  .kpi { padding:14px 18px 16px; border-left:1px solid var(--linea-azul) } .kpi:first-child { border-left:0 }
  .kpi small { display:block; font-size:10px; color:var(--gris); margin-bottom:8px }
  .kpi b { display:block; font-family:var(--mono); font-weight:600; font-size:26px; line-height:1; color:var(--azul); letter-spacing:-.01em } .kpi b.chico { font-size:17px; padding-top:5px }
  .kpi b.ok { color:var(--ok) } .kpi b.rojo { color:var(--rojo) }
  .kpi span { display:block; font-size:12px; color:var(--gris); margin-top:7px }

  .panel { background:var(--papel); border:1px solid var(--linea) }
  .panel .relleno { padding:16px 18px }

  table { width:100%; border-collapse:collapse } th { text-align:left; font-size:10px; color:var(--gris); font-weight:500; padding:0 10px 7px; border-bottom:1px solid var(--linea-azul); vertical-align:bottom }
  td { padding:9px 10px; border-bottom:1px solid var(--linea-suave); vertical-align:top; font-size:13.5px } tr:last-child td { border-bottom:0 }
  td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap } td.num { font-family:var(--mono); font-size:12.5px }
  td.cod, .cod { font-family:var(--mono); font-size:12px; color:var(--azul); text-transform:none; letter-spacing:0 }
  tr.activa td { background:var(--azul-suave) }
  .tabla-caja { padding:14px 8px 6px }

  .lista { background:var(--papel); border:1px solid var(--linea) }
  .lista a { display:block; padding:10px 14px 10px 16px; color:var(--tinta); border-bottom:1px solid var(--linea-suave); border-left:2px solid transparent } .lista a:last-child { border-bottom:0 }
  .lista a:hover { text-decoration:none; background:#F4F2EC }
  .lista a.activo { border-left-color:var(--azul); background:var(--azul-suave) }
  .lista a b { font-family:var(--mono); font-weight:500; font-size:11px; color:var(--azul); letter-spacing:.04em; margin-right:6px }
  .lista a small { display:block; color:var(--gris); font-size:12px; margin-top:3px; line-height:1.4 }
  .lista .cabecera { padding:9px 14px; font-family:var(--mono); font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--gris); border-bottom:1px solid var(--linea-azul) }

  .campo { margin:0 0 16px } .campo label { display:block; font-family:var(--mono); font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--gris); margin:0 0 6px }
  .campo .valor { padding:12px 14px; background:var(--papel); border:1px solid var(--linea); white-space:pre-wrap; line-height:1.5; font-size:13.5px }
  .campo .valor.codigo { font-family:var(--mono); font-size:12px; color:var(--tinta) }

  .ficha { display:grid; grid-template-columns:repeat(4,1fr); border:1px solid var(--linea); background:var(--papel); margin-bottom:24px }
  .ficha div { padding:10px 14px; border-left:1px solid var(--linea) } .ficha div:first-child { border-left:0 }
  .ficha small { display:block; font-family:var(--mono); font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--gris); margin-bottom:5px } .ficha b { font-size:13.5px; font-weight:500 }

  .ledger { background:var(--papel); border:1px solid var(--linea) }
  .ledger .m { display:grid; grid-template-columns:92px 1fr; gap:14px; padding:12px 16px; border-bottom:1px solid var(--linea-suave) } .ledger .m:last-child { border-bottom:0 }
  .ledger .quien { font-size:10px; color:var(--gris); padding-top:3px; line-height:1.5 } .ledger .quien small { display:block; letter-spacing:.04em; color:#8A94AE }
  .ledger .m.a .quien { color:var(--azul) }
  .ledger .txt { white-space:pre-wrap; line-height:1.5 } .ledger .m.a .txt { color:var(--tinta) } .ledger .m.s .txt { color:#3A4663 }
  .ledger .m.sistema .txt { color:var(--gris); font-style:italic }
  .adj { display:inline-block; margin-top:6px; font-family:var(--mono); font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:var(--gris); border:1px dashed var(--gris); padding:2px 8px }

  .pasos { background:var(--papel); border:1px solid var(--linea) }
  .paso { display:grid; grid-template-columns:28px 1fr; gap:12px; padding:12px 16px; border-bottom:1px solid var(--linea-suave) } .paso:last-child { border-bottom:0 }
  .paso .n { font-family:var(--mono); font-size:10.5px; color:var(--azul); padding-top:3px }
  .paso h4 { margin:0 0 3px; font-size:13.5px; font-weight:600 } .paso p { margin:0; color:var(--gris); font-size:12.5px; line-height:1.5 }
  .paso ul { margin:5px 0 0; padding:0; list-style:none } .paso li { font-size:12.5px; color:var(--gris); padding-left:16px; position:relative; line-height:1.55 }
  .paso li::before { content:"✓"; position:absolute; left:0; color:var(--ok); font-family:var(--mono) } .paso li.no::before { content:"✗"; color:var(--rojo) } .paso li b { color:var(--tinta) }
  .paso .pie { margin-top:6px }
  .uso { display:flex; flex-wrap:wrap; gap:8px 22px; padding:10px 16px; border-top:1px solid var(--linea-azul); font-family:var(--mono); font-size:10.5px; letter-spacing:.04em; color:var(--gris) } .uso b { color:var(--azul); font-weight:500 }

  .celdas { display:grid; grid-template-columns:repeat(5,1fr); border:1px solid var(--linea-azul); background:var(--papel) }
  .celdas > div { padding:12px 14px 14px; border-left:1px solid var(--linea-azul); font-size:12.5px; color:var(--gris); line-height:1.5 } .celdas > div:first-child { border-left:0 }
  .celdas b { display:block; font-family:var(--mono); font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--azul); margin-bottom:6px } .celdas strong { display:block; color:var(--tinta); font-weight:600; margin-bottom:3px; font-size:13.5px }

  .numerada { margin:0; padding:0; list-style:none } .numerada li { display:grid; grid-template-columns:30px 1fr; gap:10px; padding:8px 0; border-bottom:1px solid var(--linea-suave); font-size:13.5px; break-inside:avoid } .numerada li:last-child { border-bottom:0 }
  .numerada .n { font-family:var(--mono); font-size:10.5px; color:var(--azul); padding-top:3px }

  .aviso { border:1px dashed var(--azul); padding:12px 16px; background:var(--papel); font-size:13px; line-height:1.5 } .aviso b.t { display:block; font-family:var(--mono); font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--azul); margin-bottom:5px }

  .barras { padding:14px 18px 10px } .barra { display:grid; grid-template-columns:230px 1fr 110px; align-items:center; gap:14px; margin-bottom:9px }
  .barra .et { font-size:12.5px; line-height:1.3 } .barra .et small { display:block; color:var(--gris); font-family:var(--mono); font-size:10px; letter-spacing:.04em }
  .barra .pista { height:12px; border:1px solid #A8B1CA; position:relative; background:transparent } .barra .pista i { position:absolute; left:0; top:0; bottom:0; background:var(--azul) } .barra .pista i.gris { background:#A8B1CA } .barra .pista i.ambar { background:#C9A15A }
  .barra .v { font-family:var(--mono); font-size:12px; color:var(--azul); text-align:right; font-weight:500 }
  .eje { display:flex; justify-content:space-between; margin:4px 0 0 244px; padding-right:124px; font-size:9.5px; color:var(--gris) }
  .leyenda { display:flex; gap:18px; font-size:10px; color:var(--gris); margin-top:10px } .leyenda i { display:inline-block; width:10px; height:8px; vertical-align:-1px; margin-right:6px; border:1px solid var(--azul); background:var(--azul) } .leyenda i.gris { background:#A8B1CA; border-color:#A8B1CA } .leyenda i.ambar { background:#C9A15A; border-color:#C9A15A }

  footer { max-width:1280px; margin:0 auto; padding:0 32px 30px; display:flex; justify-content:space-between; font-family:var(--mono); font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--gris) }
`;

const NAVEGACION: { seccion: Seccion; etiqueta: string }[] = [
  { seccion: "conversaciones", etiqueta: "Conversaciones" },
  { seccion: "prompt", etiqueta: "Prompt base" },
  { seccion: "escenarios", etiqueta: "Escenarios" },
  { seccion: "reglas", etiqueta: "Reglas" },
  { seccion: "evals", etiqueta: "Evals" },
  { seccion: "modelos", etiqueta: "Modelos y costos" },
];

// Marca neutra del panel: un documento con el filete de verificación.
const ISOTIPO = `<svg class="iso" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" fill="#2346A0"/><path d="M20 14h17l9 9v27H20z" fill="none" stroke="#F4F0E8" stroke-width="3.5" stroke-linejoin="miter"/><path d="M37 14v9h9" fill="none" stroke="#F4F0E8" stroke-width="3.5"/><path d="M26 36l4 4 8-9" fill="none" stroke="#F4F0E8" stroke-width="3.5"/></svg>`;

export function numeroDeSeccion(seccion: Seccion): string {
  return String(NAVEGACION.findIndex((n) => n.seccion === seccion) + 1).padStart(2, "0");
}

export function seccionHtml(numero: string, titulo: string, derecha?: Html): Html {
  return `<div class="sec"><span class="n">${escapar(numero)}</span><h2>${escapar(titulo)}</h2>${derecha ? `<span class="der">${derecha}</span>` : ""}</div>`;
}

export function pagina(p: Pagina, entorno: Entorno): Html {
  const nav = NAVEGACION.map(
    ({ seccion, etiqueta }, i) =>
      `<a href="/${seccion}" class="${seccion === p.seccion ? "activo" : ""}"><span class="n">${String(i + 1).padStart(2, "0")}</span>${etiqueta}${p.contadores[seccion] ? `<span class="cuenta">${escapar(p.contadores[seccion])}</span>` : ""}</a>`,
  ).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapar(p.titulo)} · Agente documental</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>${ESTILOS}</style></head>
<body>
<header class="cab"><div class="fila">
  <a class="marca" href="/conversaciones">${ISOTIPO}<span><span class="nombre">Agente documental</span><span class="para">Red Unisol · Bitrix24</span></span></a>
  <nav class="nav">${nav}</nav>
  <div class="entorno"><span><span class="punto"></span><b>${escapar(entorno.modo)}</b></span><span class="modelos">${escapar(entorno.modelos)}</span></div>
</div></header>
<main>
  <div class="titulo"><div><span class="num">${numeroDeSeccion(p.seccion)} · ${escapar(entorno.embudo)}</span><h1>${escapar(p.titulo)}</h1>${p.subtitulo ? `<p class="sub">${p.subtitulo}</p>` : ""}</div></div>
  ${p.cuerpo}
</main>
<footer><span>Agente documental · ${escapar(entorno.modo)}</span><span>Sólo lectura · datos de prueba</span></footer>
</body></html>`;
}
