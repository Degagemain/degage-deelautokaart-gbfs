#!/usr/bin/env python3
"""Het rijbereik van de elektrische wagens, als marge per model.

Leest de elektrische wagens uit `gbfs/degage_vehicles.json`, zoekt hun model op in
Open EV Data, en schrijft per merk+model een bereik naar `web/bereik.json`. De kaart
toont dat in de popup.

Draaien
-------
    py scripts/haal_bereik.py

Ná `genereer_gbfs.py`. Wat al in `web/bereik.json` staat en met de hand is ingevuld
(`"bron": "handmatig"`), blijft onaangeroerd.

Waarom een apart script
-----------------------
Om dezelfde reden als de modelfoto's en de OV-gegevens: de generator draait zonder netwerk
en deterministisch, en een externe databank kan morgen andere cijfers geven.

Waarom een MARGE en niet één getal
----------------------------------
Het bereik hangt aan de batterijversie, en het modelveld in de brondata zegt die meestal
niet. Een "Renault Zoe" had 22, 41 of 52 kWh — dat is 140, 250 of 310 km. Eén getal per
model zou voor een deel van de wagens gewoon fout zijn, en dat is wat dit dossier ook bij
de euronorm weigert: raden is geen norm.

Dus:
· Staat de batterij in de modelnaam ("Zoé R110 41kWh", "LEAF 40KWH"), dan is de versie
  bekend en blijven alleen de varianten met die batterij over.
· Liggen de overblijvende varianten binnen EEN_GETAL_KM van elkaar, dan is dat één getal:
  zo'n verschil zit binnen de onnauwkeurigheid van elke schatting.
· Anders een marge, van de kleinste tot de grootste variant.

Het bouwjaar telt mee, maar met een marge van MODELJAAR_NIEUW jaar erna en MODELJAAR_OUD
jaar ervoor. Een wagen van 2021 kan geen versie zijn die pas in 2024 uitkwam, en ook geen
eerste generatie van 2013 — maar het jaartal in Open EV Data is niet het jaar waarin een
versie op de markt kwam:
· de e-Berlingo met 50 kWh staat er als 2024, terwijl hij eind 2021 uitkwam;
· de Tesla Model 3 SR+ als 2020, terwijl hij in 2019 al verkocht werd.
Een streng filter ("niet nieuwer dan het bouwjaar") gaf daardoor een e-Berlingo van 2022 een
bereik van 100 km — de oude versie met de kleine batterij. Dat is erger dan een brede
marge: het is een vals exact getal.

De marges zijn gekozen op de gevallen waarvan we de waarheid kennen (e-Berlingo 2022 en
2023, Tesla Model 3 en SR+ 2019-2020, Zoe 2016 en 2021). Met +3/-3 kloppen ze allemaal;
met een ruimere ondergrens (-4 of meer) houdt een Zoe van 2021 nog een 22 kWh-versie over
die toen niet meer bestond. Gemeten op 11-09-2026: de mediane breedte van de marges daalt
van 190 naar 130 km, en 13 in plaats van 9 wagens krijgen één getal.

Sluit het jaar ALLE varianten uit — een model dat in de bron alleen met een ander jaar
staat — dan telt het jaar niet mee in plaats van dat er niets overblijft.

Wat het getal IS
----------------
Bruikbare batterij gedeeld door het gemiddelde verbruik uit Open EV Data. Dat is een
schatting van het bereik bij GEMENGD gebruik, geen WLTP-cijfer: WLTP ligt doorgaans hoger.
De kaart noemt het daarom een schatting en noemt de bron — die naamsvermelding is ook
een voorwaarde van de licentie (MIT met verplichte attributie).

Wat er ontbreekt
----------------
Een model dat niet gevonden wordt, krijgt geen bereik. De kaart toont dan niets — beter
dan een gok. Het script zegt bij elke run welke modellen dat zijn.
"""

from __future__ import annotations

import json
import re
import statistics
import sys
import unicodedata
import urllib.request
from collections import defaultdict
from pathlib import Path

BRON_URL = "https://raw.githubusercontent.com/KilowattApp/open-ev-data/master/data/ev-data.json"
BRON_NAAM = "Open EV Data"
BRON_PAGINA = "https://github.com/KilowattApp/open-ev-data"
UA = "DegageDeelautokaart/1.0 (https://www.degage.be/; info@degage.be)"

# Alleen volledig elektrische wagens. Een gewone hybride heeft geen elektrisch bereik om te
# tonen, en bij een plug-in hybride zou het elektrische bereik naast een benzinetank staan —
# dat leest als het bereik van de wagen, en dat is het niet.
BRANDSTOFFEN = {"elektrisch"}

# Zoveel jaar na en voor het bouwjaar mag een variant liggen. Zie de uitleg bovenaan:
# de jaartallen in de bron liggen soms tot drie jaar te laat.
MODELJAAR_NIEUW = 3
MODELJAAR_OUD = 3

# Liggen de varianten binnen zoveel km van elkaar, dan tonen we één getal.
EEN_GETAL_KM = 20
# Afronden: een schatting op de kilometer beweert een precisie die ze niet heeft.
AFRONDEN_KM = 10
# Hoeveel de batterij uit de modelnaam mag afwijken van de bruikbare batterij in de bron.
# Fabrikanten noemen vaak de bruto capaciteit ("40 kWh"), Open EV Data de bruikbare (39).
BATTERIJ_MARGE_KWH = 4

# Schrijfwijzen in onze vrije tekst die anders heten in de bron. Alleen wat gemeten is;
# niet om "voor de zekerheid" alles te laten matchen.
MODEL_ALIAS = [
    (" eniro ", " e niro "),   # "Kia eNiro"
    (" ec 3 ", " e c 3 "),     # "Citroën eC3"
    (" r 5 ", " 5 "),          # "Renault R5" heet "5 E-Tech"
]

RE_KWH = re.compile(r"(\d{2}(?:[.,]\d)?)\s*kwh", re.I)


def zeg(regel: str = "") -> None:
    print(regel, flush=True)


def kaal(s: str) -> str:
    """Kleine letters, zonder accenten, letters en cijfers uit elkaar ("ID3" -> "id 3").

    Met spaties aan de randen, zodat "in" altijd op hele woorden werkt: " 5 " zit niet in
    " ze 50 ".
    """
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"[^a-z0-9.]+", " ", s)
    # Een punt tussen letter en cijfer is een schrijfwijze, geen decimaal: "ID.3" en "ID3"
    # zijn hetzelfde model. Een punt tússen cijfers blijft staan ("64.8 kWh"); elke
    # andere punt verdwijnt.
    s = re.sub(r"(?<=[a-z])\.(?=[0-9])", " ", s)
    s = re.sub(r"\.(?![0-9])|(?<![0-9])\.", " ", s)
    s = re.sub(r"([a-z])([0-9])", r"\1 \2", s)
    s = re.sub(r"([0-9])([a-z])", r"\1 \2", s)
    return " " + " ".join(s.split()) + " "


def modelsleutel(model: str) -> str:
    m = kaal(model)
    for oud, nieuw in MODEL_ALIAS:
        m = m.replace(oud, nieuw)
    return m


def haal_bron() -> list[dict]:
    zeg(f"bron        {BRON_URL}")
    verzoek = urllib.request.Request(BRON_URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(verzoek, timeout=120) as antwoord:
        data = json.load(antwoord)
    lijst = data.get("data", data)
    zeg(f"            {len(lijst)} varianten, bijgewerkt {data.get('meta', {}).get('updated_at', '?')}")
    return lijst


def varianten_per_merk(bron: list[dict]) -> dict[str, list[dict]]:
    uit: dict[str, list[dict]] = defaultdict(list)
    for v in bron:
        if v.get("vehicle_type") not in (None, "car"):
            continue
        batterij = v.get("usable_battery_size")
        verbruik = (v.get("energy_consumption") or {}).get("average_consumption")
        if not batterij or not verbruik:
            continue
        # Op het EERSTE woord van het merk, net als bij het opzoeken: de bron schrijft
        # "Opel / Vauxhall", onze data "Opel".
        uit[kaal(v.get("brand", "")).strip().split(" ")[0]].append({
            "naam": f"{v['model']} {v.get('variant') or ''}".strip(),
            "batterij": batterij,
            "km": batterij / verbruik * 100,
            "sleutel": modelsleutel(v["model"]),
            "jaar": v.get("release_year"),
        })
    return uit


def zoek(merk: str, model: str, per_merk: dict[str, list[dict]],
         bouwjaar: int | None = None) -> dict | None:
    """Het bereik voor één merk+model+bouwjaar, of None als het model niet gevonden wordt."""
    merknaam = kaal(merk).strip().split(" ")[0] if merk.strip() else ""
    sleutel = modelsleutel(model)
    kandidaten = [v for v in per_merk.get(merknaam, [])
                  if v["sleutel"] in sleutel or (sleutel.strip() and sleutel in v["sleutel"])]
    if not kandidaten:
        return None

    versie_bekend = False
    m = RE_KWH.search(model)
    if m:
        kwh = float(m.group(1).replace(",", "."))
        met_batterij = [v for v in kandidaten if abs(v["batterij"] - kwh) <= BATTERIJ_MARGE_KWH]
        # Staat er een batterij in de naam die in de bron niet voorkomt, dan houden we de
        # volle marge in plaats van niets: de naam kan zich vergissen, de marge niet.
        if met_batterij:
            kandidaten, versie_bekend = met_batterij, True

    jaar_gebruikt = False
    if bouwjaar:
        in_de_tijd = [v for v in kandidaten if v["jaar"]
                      and bouwjaar - MODELJAAR_OUD <= v["jaar"] <= bouwjaar + MODELJAAR_NIEUW]
        # Sluit het jaar alles uit, dan telt het niet mee: liever de volle marge dan niets.
        if in_de_tijd:
            kandidaten, jaar_gebruikt = in_de_tijd, True

    kms = sorted(v["km"] for v in kandidaten)
    if kms[-1] - kms[0] <= EEN_GETAL_KM:
        midden = round(statistics.median(kms) / AFRONDEN_KM) * AFRONDEN_KM
        km = [midden, midden]
    else:
        km = [round(kms[0] / AFRONDEN_KM) * AFRONDEN_KM, round(kms[-1] / AFRONDEN_KM) * AFRONDEN_KM]
    return {
        "km": km,
        "versie_bekend": versie_bekend,
        "jaar_gebruikt": jaar_gebruikt,
        "varianten": sorted({v["naam"] for v in kandidaten}),
        "bron": "open-ev-data",
    }


def main() -> int:
    repo = Path(__file__).resolve().parent.parent
    feed = repo / "gbfs" / "degage_vehicles.json"
    uit = repo / "web" / "bereik.json"
    if not feed.exists():
        zeg(f"FOUT: {feed} bestaat niet. Draai eerst genereer_gbfs.py.")
        return 2

    zeg("=" * 90)
    zeg("Dégage — rijbereik van de elektrische wagens")
    zeg("=" * 90)

    oud = {}
    if uit.exists():
        oud = json.loads(uit.read_text(encoding="utf-8")).get("modellen", {})

    wagens = json.loads(feed.read_text(encoding="utf-8"))["data"]["vehicles"]
    # Per merk+model+BOUWJAAR: twee Zoe's van een ander jaar kunnen een andere marge hebben.
    modellen = sorted({(w["merk"], w["model"], w.get("bouwjaar") or 0)
                       for w in wagens if w.get("brandstof") in BRANDSTOFFEN})
    zeg(f"feed        {len(modellen)} elektrische merk+model+bouwjaar-combinaties")
    per_merk = varianten_per_merk(haal_bron())
    zeg()

    resultaat, handmatig, niet_gevonden = {}, 0, []
    # Handmatige regels ZONDER bouwjaar blijven als ze zijn: ze gelden voor elk jaar.
    for sleutel, r in oud.items():
        if sleutel.count("|") == 1 and r.get("bron") == "handmatig":
            resultaat[sleutel] = r
    for merk, model, jaar in modellen:
        sleutel = f"{merk}|{model}|{jaar}"
        # Met de hand ingevuld of met de hand uitgezet: nooit overschrijven. Een handmatige
        # regel mag met of zonder bouwjaar staan ("merk|model" geldt dan voor elk jaar);
        # die zonder jaar laat de kaart zelf terugvallen, dus die hoeft hier niet mee.
        if oud.get(sleutel, {}).get("bron") == "handmatig":
            resultaat[sleutel] = oud[sleutel]
            handmatig += 1
            continue
        if oud.get(f"{merk}|{model}", {}).get("bron") == "handmatig":
            handmatig += 1
            continue
        gevonden = zoek(merk, model, per_merk, jaar or None)
        if gevonden:
            resultaat[sleutel] = gevonden
        else:
            niet_gevonden.append(sleutel)

    zeg(f"{'model':<60} {'bereik':>12}")
    for sleutel, r in sorted(resultaat.items()):
        if r.get("km"):
            lo, hi = r["km"]
            tekst = f"{lo} km" if lo == hi else f"{lo}–{hi} km"
        else:
            tekst = "(uitgezet)"
        merk = " (handmatig)" if r.get("bron") == "handmatig" else (
            " (batterij bekend)" if r.get("versie_bekend") else "")
        zeg(f"  {sleutel.replace('|', ' ')[:58]:<58} {tekst:>12}{merk}")
    zeg()
    enkel = sum(1 for r in resultaat.values() if r.get("km") and r["km"][0] == r["km"][1])
    zeg(f"samen       {len(resultaat)} van {len(modellen)} met een bereik "
        f"({enkel} als één getal, {handmatig} met de hand)")
    if niet_gevonden:
        zeg(f"niet in de bron ({len(niet_gevonden)}) — die tonen geen bereik:")
        for s in niet_gevonden:
            zeg(f"  {s.replace('|', ' ')}")
        zeg("  Weet je het bereik wel? Zet het in web/bereik.json met \"bron\": \"handmatig\".")
    zeg()

    bestand = {
        "toelichting": (
            "Geschat rijbereik bij gemengd gebruik per elektrisch merk+model, door "
            "scripts/haal_bereik.py: bruikbare batterij gedeeld door gemiddeld verbruik uit "
            "Open EV Data. Geen WLTP. Een marge waar de batterijversie niet bekend is; het "
            "bouwjaar telt mee met drie jaar speling. Sleutel: merk|model|bouwjaar, of "
            "merk|model voor een handmatige regel die voor elk jaar geldt. "
            "Handmatige regels (\"bron\": \"handmatig\") laat het script ongemoeid; zet "
            "\"km\": null om een model bewust geen bereik te geven."
        ),
        "bron": {"naam": BRON_NAAM, "pagina": BRON_PAGINA, "licentie": "MIT met naamsvermelding"},
        "modellen": dict(sorted(resultaat.items())),
    }
    uit.write_text(json.dumps(bestand, ensure_ascii=False, indent=1) + "\n",
                   encoding="utf-8", newline="\n")
    zeg(f"weggeschreven: {uit} ({uit.stat().st_size / 1000:.0f} kB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
