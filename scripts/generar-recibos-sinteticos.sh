#!/bin/sh
# Renderiza los recibos sintéticos de evals/recibos/casos.json a PNG (carpeta ignorada por git).
set -e
cd "$(dirname "$0")/../evals/recibos"
mkdir -p generados
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
node -e '
const fs=require("fs");const plantilla=fs.readFileSync("plantilla.html","utf8");
for(const caso of JSON.parse(fs.readFileSync("casos.json","utf8"))){
  const html=Object.entries(caso).reduce((h,[k,v])=>h.replaceAll(`{{${k}}}`,v),plantilla);
  fs.writeFileSync(`generados/${caso.archivo}.html`,html);
}'
cp no-recibo-factura.html generados/
for html in generados/*.html; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=800,640 --screenshot="${html%.html}.png" "file://$PWD/$html" >/dev/null 2>&1
  rm "$html"
done
ls generados
