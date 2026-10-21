"""Embudo de prueba en Bitrix24: copia las etapas de un embudo real a uno nuevo, sin robots.

    BITRIX24_WEBHOOK_URL=https://xxx.bitrix24.es/rest/<user>/<token>/ \\
        python3 scripts/bitrix/embudo_prueba.py crear "VENTAS · PRUEBA PULSO" --desde 1
    python3 scripts/bitrix/embudo_prueba.py listar
    python3 scripts/bitrix/embudo_prueba.py borrar 19

Requiere alcance `crm` y permiso de administrador de CRM. No toca el embudo de origen.
Sólo biblioteca estándar: corre en cualquier máquina con Python 3.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

URL = os.environ.get("BITRIX24_WEBHOOK_URL", "").rstrip("/")
ENTIDAD_NEGOCIACION = 2
MAX_STATUS_ID = 18  # limite de Bitrix, prefijo "C<id>:" incluido


def llamar(metodo: str, **params):
    if not URL:
        sys.exit("Falta BITRIX24_WEBHOOK_URL.")
    datos = urllib.parse.urlencode(params, doseq=True).encode()
    try:
        with urllib.request.urlopen(f"{URL}/{metodo}", datos) as r:
            cuerpo = json.load(r)
    except urllib.error.HTTPError as e:
        cuerpo = json.load(e)
    if "error" in cuerpo:
        raise RuntimeError(f"{metodo}: {cuerpo.get('error')} {cuerpo.get('error_description', '')}".strip())
    return cuerpo["result"]


def campos(prefijo: str, d: dict) -> dict:
    return {f"{prefijo}[{k}]": v for k, v in d.items()}


def etapas(categoria: int) -> list[dict]:
    filas = llamar("crm.status.list", **{"filter[ENTITY_ID]": f"DEAL_STAGE_{categoria}"})
    return sorted(filas, key=lambda s: int(s["SORT"]))


def codigo(etapa: dict) -> str:
    return etapa["STATUS_ID"].split(":", 1)[1]


def semantica(etapa: dict) -> str:
    return (etapa.get("EXTRA") or {}).get("SEMANTICS") or "process"


def listar() -> None:
    cats = llamar("crm.category.list", entityTypeId=ENTIDAD_NEGOCIACION)["categories"]
    for c in sorted(cats, key=lambda c: int(c["sort"])):
        print(f"{c['id']:>3}  {c['name']}  (sort {c['sort']})")


def crear(nombre: str, desde: int) -> None:
    origen = etapas(desde)
    if not origen:
        sys.exit(f"El embudo {desde} no tiene etapas o no existe.")
    cat = llamar("crm.category.add", entityTypeId=ENTIDAD_NEGOCIACION, **campos("fields", {"name": nombre, "sort": 9000}))["category"]
    cid = int(cat["id"])
    ent = f"DEAL_STAGE_{cid}"
    print(f"Embudo creado: id {cid} · {nombre}")
    time.sleep(1)

    existentes = {codigo(s): s for s in etapas(cid)}
    deseadas = {codigo(s): s for s in origen}

    for cod, s in existentes.items():
        if cod not in deseadas:
            llamar("crm.status.delete", id=s["ID"])
            print(f"  borrada etapa por defecto {cod}")

    # Las finales al fondo: Bitrix no deja crear etapas de proceso despues de la final.
    for cod, orden in (("WON", 9900), ("LOSE", 9910), ("APOLOGY", 9920)):
        if cod in existentes:
            llamar("crm.status.update", id=existentes[cod]["ID"], **campos("fields", {"SORT": orden}))

    def status_id(cod: str) -> str:
        sid = f"C{cid}:{cod}"
        if len(sid) <= MAX_STATUS_ID:
            return sid
        corto = cod[: MAX_STATUS_ID - len(f"C{cid}:")]
        print(f"  aviso: {cod} se acorta a {corto} (limite de {MAX_STATUS_ID} caracteres)")
        return f"C{cid}:{corto}"

    # Proceso primero.
    for s in origen:
        cod = codigo(s)
        if semantica(s) != "process" or cod in existentes:
            continue
        llamar("crm.status.add", **campos("fields", {
            "ENTITY_ID": ent, "STATUS_ID": status_id(cod), "NAME": s["NAME"], "SORT": s["SORT"], "COLOR": s.get("COLOR") or "#468ee5",
        }))
        print(f"  creada {cod} · {s['NAME']}")

    # Finales: las que existen se renombran y reordenan; las demas se crean como fallidas.
    existentes = {codigo(s): s for s in etapas(cid)}
    for s in origen:
        cod = codigo(s)
        if semantica(s) == "process":
            if cod in existentes:
                llamar("crm.status.update", id=existentes[cod]["ID"], **campos("fields", {"NAME": s["NAME"], "SORT": s["SORT"], "COLOR": s.get("COLOR") or "#468ee5"}))
                print(f"  actualizada {cod} · {s['NAME']}")
            continue
        if cod in existentes:
            llamar("crm.status.update", id=existentes[cod]["ID"], **campos("fields", {"NAME": s["NAME"], "SORT": s["SORT"], "COLOR": s.get("COLOR") or "#FF5752"}))
            print(f"  actualizada {cod} · {s['NAME']}")
            continue
        llamar("crm.status.add", **campos("fields", {
            "ENTITY_ID": ent, "STATUS_ID": status_id(cod), "NAME": s["NAME"], "SORT": s["SORT"],
            "COLOR": s.get("COLOR") or "#FF5752", "SEMANTICS": "F",
        }))
        print(f"  creada {cod} · {s['NAME']} (fallida)")

    final = etapas(cid)
    print(f"\n{len(final)} etapas en el embudo {cid} (origen: {len(origen)}).")
    for s in final:
        print(f"  {s['STATUS_ID']:<22} {s['NAME']:<36} {semantica(s)}")


def borrar(categoria: int) -> None:
    cats = {int(c["id"]): c for c in llamar("crm.category.list", entityTypeId=ENTIDAD_NEGOCIACION)["categories"]}
    if categoria not in cats:
        sys.exit(f"No existe el embudo {categoria}.")
    if "PRUEBA" not in cats[categoria]["name"].upper():
        sys.exit(f"Me niego: el embudo {categoria} se llama '{cats[categoria]['name']}' y no dice PRUEBA.")
    negociaciones = llamar("crm.deal.list", **{"filter[CATEGORY_ID]": categoria, "select[]": "ID"})
    if negociaciones:
        sys.exit(f"El embudo {categoria} tiene {len(negociaciones)} negociaciones. Borralas primero.")
    llamar("crm.category.delete", entityTypeId=ENTIDAD_NEGOCIACION, id=categoria)
    print(f"Embudo {categoria} borrado.")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="accion", required=True)
    sub.add_parser("listar")
    c = sub.add_parser("crear")
    c.add_argument("nombre")
    c.add_argument("--desde", type=int, default=1, help="embudo de origen (VENTAS = 1)")
    b = sub.add_parser("borrar")
    b.add_argument("id", type=int)
    a = p.parse_args()
    if a.accion == "listar":
        listar()
    elif a.accion == "crear":
        crear(a.nombre, a.desde)
    else:
        borrar(a.id)


if __name__ == "__main__":
    main()
