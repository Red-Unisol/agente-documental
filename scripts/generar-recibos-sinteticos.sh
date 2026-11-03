#!/bin/sh
# Renderiza los recibos sintéticos de evals/recibos/casos.json a PNG o PDF (carpeta ignorada por git).
set -e
cd "$(dirname "$0")/../evals/recibos"
mkdir -p generados
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
node -e '
const fs=require("fs");
for(const caso of JSON.parse(fs.readFileSync("casos.json","utf8"))){
  const plantilla=fs.readFileSync(caso.plantilla?`plantilla-${caso.plantilla}.html`:"plantilla.html","utf8");
  const campos={ESTILO:"",NOTA:"",...caso};
  const html=Object.entries(campos).reduce((h,[k,v])=>h.replaceAll(`{{${k}}}`,v),plantilla);
  fs.writeFileSync(`generados/${caso.archivo}.${caso.formato==="pdf"?"pdf":"png"}.html`,html);
}'
cp no-recibo-factura.html generados/no-recibo-factura.png.html
for html in generados/*.html; do
  salida="${html%.html}"
  case "$salida" in
    *.pdf) "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="$salida" "file://$PWD/$html" >/dev/null 2>&1 ;;
    *) "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=800,640 --screenshot="$salida" "file://$PWD/$html" >/dev/null 2>&1 ;;
  esac
  rm "$html"
done
ls generados
