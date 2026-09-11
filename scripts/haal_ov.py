#!/usr/bin/env python3
"""Hoe bereikbaar is elke standplaats? De Mobiscore, en wat er aan openbaar vervoer rijdt.

Leest de standplaatsen uit `gbfs/station_information.json` en schrijft per standplaats naar
`web/ov.json`:

· de MOBISCORE — de officiële score van de Vlaamse overheid (Departement Omgeving), dezelfde
  die Immoweb bij een woning toont: van 0 tot 10, hoger is beter;
· de feiten over OPENBAAR VERVOER eronder: de dichtste halte met vaste lijnen en hoe vaak
  daar iets rijdt, hoeveel van zulke haltes er in de buurt zijn, en het dichtste station.

De kaart toont dat in de popup.

Draaien
-------
    py scripts/haal_ov.py

Ná `genereer_gbfs.py`, want het leest de standplaatsen uit de feed — en bij ÉLKE nieuwe feed:
de kaart gebruikt dit bestand alleen als het bij de feed hoort die ze toont (`voor_feed`).
De eerste keer duurt het een paar minuten: de dienstregeling van De Lijn is een zip van ruim
200 MB, en de Mobiscore wordt per standplaats opgevraagd. Allebei komen in een cachemap
BUITEN de repo: de dienstregelingen worden een week hergebruikt, de Mobiscore per punt drie
maanden — die wordt maar af en toe herberekend. Een volgende run duurt zo een halve minuut.

Waarom een apart script en niet in de generator
-----------------------------------------------
Om dezelfde reden als de modelfoto's: de generator moet zonder netwerk en deterministisch
draaien. Een dienstregeling verandert elke paar maanden, en de Mobiscore wordt af en toe
herberekend — dat hoort in een verrijking, niet in de feed.

De Mobiscore
------------
Wat hij meet, volgens het Departement Omgeving: hoe dicht een plek ligt bij vijf soorten
voorzieningen, te voet of met de fiets —

    openbaar vervoer · onderwijs · winkels en diensten · vrije tijd en cultuur · zorg

— telkens met de gemiddelde afstand tot de vier dichtstbijzijnde. Bij openbaar vervoer tellen
stations, tram- en metrohaltes, en bushaltes met hoogstens een halfuur wachttijd, en ook hoe
snel je van daar andere centra bereikt. Van 0 tot 10; hoger is beter. Actualisatie en
bijstelling van de methode: oktober 2025.

Waar hij vandaan komt: de geodatalaag "Mobiscore per ha" (`ni:ni_mobiscore_ha`) op de
publieke kaartdienst Mercator van de Vlaamse overheid — één totaalscore per hectarecel.
Opgevraagd per standplaats met een WMS-GetFeatureInfo, zodat er geen rasterbibliotheek nodig
is. Licentie: Modellicentie Gratis Hergebruik, met vermelding van de bron — die staat op de
kaart.

Twee dingen om te weten:
· Er is alleen een TOTAALSCORE per hectare. De deelscores per soort voorziening die de
  Mobiscore-site bij een adres toont, staan niet in de open laag.
· Hij wordt opgevraagd op het VERVAAGDE punt uit de feed (20 m opzij, zie LOCATIE_FUZZ_M in
  genereer_gbfs.py). Op cellen van honderd meter kan dat een buurcel zijn; die verschilt
  zelden meer dan een paar tienden.

De OV-feiten — en dat zijn KEUZES, geen feiten
----------------------------------------------
· Bus en tram (De Lijn): de dichtste halte met VASTE LIJNEN binnen HALTE_ZOEK_M, en hoeveel
  bussen of trams er daar per uur PER RICHTING vertrekken. Haltes met dezelfde naam —
  meestal de twee kanten van de straat — horen bij elkaar; elke kant is één richting, en
  we tonen de drukste kant. Daarnaast: hoeveel zulke haltes er binnen HALTE_M liggen. Een
  halte zonder ritten op de referentiedag telt niet: die bestaat op de kaart, maar er
  stopt niets.
· Waarom per richting. Een eerdere versie telde beide richtingen samen: "vier ritten per
  uur" waren er twee naar elke kant — en wie aan de halte staat, heeft dan een bus om het
  halfuur, niet om het kwartier. Per richting is wat een mens aan de halte ervaart.
  (11-09-2026)
· Waarom zo ruim. Een eerste versie telde alleen haltes binnen 400 m in vogelvlucht. In
  Melsele viel een standplaats zo op "geen bus", terwijl er op 480 tot 690 m drie haltes
  liggen (zes perrons), de dichtste met elf ritten per uur. Vogelvlucht is korter dan de wandeling, maar
  400 m was te krap om iets te zeggen over wat een mens werkelijk loopt. (11-09-2026)
· Trein (NMBS): het dichtste station binnen TREIN_M, en hoeveel treinen er daar per uur
  stoppen, GEDEELD DOOR TWEE richtingen. Per perron tellen, zoals bij de bus, gaat hier niet:
  een groot station heeft tot twaalf perrons in dezelfde richting, en veel ritten staan op
  een perron zonder nummer. Het totaal gedeeld door twee klopt voor een gewoon station op
  een lijn.
· Waarom 3 km voor een station. Een eerste versie zocht tot 1,5 km. Daarmee stond bij
  bijna de helft van de standplaatsen geen station, ook waar er een op fietsafstand ligt:
  in Melsele ligt het station op ongeveer 2 km, en de popup zweeg erover. Naar een station
  fietst men; 3 km is een tiental minuten. (11-09-2026)
· Op één gewone WERKDAG, tussen VENSTER_VAN en VENSTER_TOT: de dinsdag binnen de geldigheid
  van beide dienstregelingen met de meeste diensten. Dat is een schooldag en geen
  vakantiedag, zonder dat hier een vakantiekalender hoeft te staan.
· Flexvervoer (De Lijn op afroep) staat niet in de dienstregeling en telt dus niet mee.
· Afstanden in vogelvlucht, vanaf het vervaagde punt.

Bronnen
-------
· Mobiscore — Departement Omgeving, via Mercator.
· De Lijn — via data.gtfs.be, dat de officiële GTFS van De Lijn herpubliceert.
· NMBS — via gtfs.irail.be, dat de officiële GTFS van de NMBS herpubliceert.
Allemaal vermeld op de kaart en in `web/ov.json`.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import statistics
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

# ============================================================================
# DE KEUZES — zie de uitleg bovenaan
# ============================================================================
HALTE_M = 800             # "haltes in de buurt": ongeveer tien minuten wandelen
HALTE_ZOEK_M = 1000       # zo ver zoeken we naar de dichtste halte met vaste lijnen
TREIN_M = 3000            # een station: daar fietst men naartoe, zo'n tien minuten
VENSTER_VAN = 7 * 3600    # 07:00
VENSTER_TOT = 19 * 3600   # 19:00

MOBISCORE = {
    "naam": "Mobiscore",
    "uitgever": "Departement Omgeving, Vlaamse overheid",
    "laag": "ni:ni_mobiscore_ha",
    "dienst": "https://www.mercator.vlaanderen.be/raadpleegdienstenmercatorpubliek/ows",
    "pagina": "https://omgeving.vlaanderen.be/mobiscore",
    "licentie": "Modellicentie Gratis Hergebruik",
}
# Beleefd blijven tegen een publieke dienst: één verzoek tegelijk, met een korte pauze.
MOBISCORE_PAUZE_S = 0.15
# Hoe lang een opgevraagde score per punt geldig blijft. De Mobiscore wordt af en toe
# herberekend (laatst oktober 2025); elke kwartaalrun 565 keer opnieuw vragen is onnodig.
MOBISCORE_CACHE_DAGEN = 90

BRONNEN = {
    "delijn": {
        "naam": "De Lijn",
        "url": "https://data.gtfs.be/delijn/gtfs/be-delijn-gtfs.zip",
        "via": "data.gtfs.be",
        "soorten": {"0": "tram", "3": "bus"},
    },
    "nmbs": {
        "naam": "NMBS",
        "url": "https://gtfs.irail.be/nmbs/gtfs/latest.zip",
        "via": "gtfs.irail.be",
        "soorten": {"2": "trein"},
    },
}

UA = "DegageDeelautokaart/1.0 (https://www.degage.be/; info@degage.be)"
CACHE_DAGEN = 7
METER_PER_GRAAD = 111_320.0


def zeg(regel: str = "") -> None:
    print(regel, flush=True)


# ============================================================================
# downloaden
# ============================================================================
def cachemap() -> Path:
    """Buiten de repo: een GTFS-zip van 200 MB hoort nooit in git te belanden."""
    return Path.home() / ".cache" / "degage-gtfs"


def haal_zip(sleutel: str, vernieuw: bool) -> Path:
    bron = BRONNEN[sleutel]
    doel = cachemap() / f"{sleutel}.zip"
    doel.parent.mkdir(parents=True, exist_ok=True)
    if doel.exists() and not vernieuw:
        leeftijd = (time.time() - doel.stat().st_mtime) / 86400
        if leeftijd < CACHE_DAGEN:
            zeg(f"  {bron['naam']:<8} uit de cache ({leeftijd:.1f} dagen oud): {doel}")
            return doel
    zeg(f"  {bron['naam']:<8} downloaden van {bron['url']} ...")
    verzoek = urllib.request.Request(bron["url"], headers={"User-Agent": UA})
    tijdelijk = doel.with_suffix(".deel")
    with urllib.request.urlopen(verzoek, timeout=300) as antwoord, open(tijdelijk, "wb") as uit:
        while True:
            blok = antwoord.read(1 << 20)
            if not blok:
                break
            uit.write(blok)
    # Pas hernoemen als de download af is: een afgebroken download mag de oude, goede
    # cache niet vervangen door een halve zip.
    tijdelijk.replace(doel)
    zeg(f"  {'':<8} {doel.stat().st_size / 1e6:.0f} MB binnen")
    return doel


# ============================================================================
# de Mobiscore
# ============================================================================
def mobiscore(lat: float, lon: float) -> float | None:
    """De Mobiscore van de hectarecel waarin (lat, lon) valt, of None als er geen is.

    Een GetFeatureInfo op een klein vierkantje rond het punt, met het punt in het midden.
    WMS 1.3.0 met EPSG:4326 verwacht de assen als breedte, lengte — anders dan bijna elke
    andere plek waar je coördinaten doorgeeft.
    """
    d = 0.0005
    vraag = {
        "SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetFeatureInfo",
        "LAYERS": MOBISCORE["laag"], "QUERY_LAYERS": MOBISCORE["laag"], "STYLES": "",
        "CRS": "EPSG:4326", "BBOX": f"{lat - d},{lon - d},{lat + d},{lon + d}",
        "WIDTH": "101", "HEIGHT": "101", "I": "50", "J": "50",
        "INFO_FORMAT": "application/json",
    }
    url = MOBISCORE["dienst"] + "?" + urllib.parse.urlencode(vraag)
    for poging in range(3):
        try:
            verzoek = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(verzoek, timeout=30) as antwoord:
                data = json.load(antwoord)
            for f in data.get("features", []):
                for waarde in (f.get("properties") or {}).values():
                    if isinstance(waarde, (int, float)) and 0 <= waarde <= 10:
                        return round(float(waarde), 1)
            return None          # buiten Vlaanderen, of een cel zonder score
        except Exception:
            time.sleep(2 * (poging + 1))
    return None


# ============================================================================
# GTFS lezen
# ============================================================================
def lees(z: zipfile.ZipFile, naam: str):
    return csv.DictReader(io.TextIOWrapper(z.open(naam), encoding="utf-8-sig", newline=""))


def seconden(t: str) -> int:
    """GTFS-tijd, mag voorbij 24:00 lopen (ritten na middernacht van de vorige dienstdag)."""
    u, m, s = t.split(":")
    return int(u) * 3600 + int(m) * 60 + int(s)


def feedversie(z: zipfile.ZipFile) -> str:
    if "feed_info.txt" not in z.namelist():
        return ""
    for rij in lees(z, "feed_info.txt"):
        return (rij.get("feed_version") or "").strip()
    return ""


def geldigheid(z: zipfile.ZipFile) -> tuple[date, date]:
    """Van de eerste tot de laatste dag waarop er volgens de feed iets rijdt."""
    dagen = []
    if "calendar.txt" in z.namelist():
        for rij in lees(z, "calendar.txt"):
            dagen += [rij["start_date"], rij["end_date"]]
    if "calendar_dates.txt" in z.namelist():
        for rij in lees(z, "calendar_dates.txt"):
            dagen.append(rij["date"])
    d = sorted(dagen)
    return datetime.strptime(d[0], "%Y%m%d").date(), datetime.strptime(d[-1], "%Y%m%d").date()


def actieve_diensten(z: zipfile.ZipFile, dag: date) -> set[str]:
    """De service_id's die op `dag` rijden: calendar.txt plus de uitzonderingen."""
    actief: set[str] = set()
    ds = dag.strftime("%Y%m%d")
    weekdag = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][dag.weekday()]
    if "calendar.txt" in z.namelist():
        for rij in lees(z, "calendar.txt"):
            if rij["start_date"] <= ds <= rij["end_date"] and rij[weekdag] == "1":
                actief.add(rij["service_id"])
    if "calendar_dates.txt" in z.namelist():
        for rij in lees(z, "calendar_dates.txt"):
            if rij["date"] != ds:
                continue
            if rij["exception_type"] == "1":
                actief.add(rij["service_id"])
            elif rij["exception_type"] == "2":
                actief.discard(rij["service_id"])
    return actief


def actieve_ritten(z: zipfile.ZipFile, dag: date, soorten: dict[str, str]) -> dict[str, str]:
    """trip_id -> soort, voor de ritten van de soorten die we tellen die op `dag` rijden."""
    diensten = actieve_diensten(z, dag)
    soort_van_lijn = {r["route_id"]: soorten[r["route_type"]]
                      for r in lees(z, "routes.txt") if r["route_type"] in soorten}
    uit = {}
    for r in lees(z, "trips.txt"):
        soort = soort_van_lijn.get(r["route_id"])
        if soort and r["service_id"] in diensten:
            uit[r["trip_id"]] = soort
    return uit


def ritten_per_halte(z: zipfile.ZipFile, actief: dict[str, str], haltes: set[str]) -> dict[str, set]:
    """Per halte uit `haltes`: de actieve ritten die er binnen het venster vertrekken.

    Het zware deel: bij De Lijn 1,7 GB aan haltetijden, rij voor rij. csv.reader en geen
    DictReader, en eerst de goedkoopste test (is dit een halte die ons aanbelangt?) zodat
    het overgrote deel van de rijen meteen afvalt. Een rij waar je niet mag opstappen
    (pickup_type 1) telt niet.
    """
    per: dict[str, set] = defaultdict(set)
    ruw = csv.reader(io.TextIOWrapper(z.open("stop_times.txt"), encoding="utf-8-sig", newline=""))
    kop = next(ruw)
    i_stop, i_rit = kop.index("stop_id"), kop.index("trip_id")
    i_tijd, i_op = kop.index("departure_time"), kop.index("pickup_type")
    begin, n = time.time(), 0
    for rij in ruw:
        n += 1
        if n % 5_000_000 == 0:
            zeg(f"    {n / 1e6:.0f} miljoen haltetijden gelezen ({time.time() - begin:.0f} s)")
        if rij[i_stop] not in haltes or rij[i_rit] not in actief:
            continue
        if rij[i_op] == "1" or not rij[i_tijd]:
            continue
        if VENSTER_VAN <= seconden(rij[i_tijd]) < VENSTER_TOT:
            per[rij[i_stop]].add(rij[i_rit])
    zeg(f"  {n:,} haltetijden gelezen in {time.time() - begin:.0f} s".replace(",", "."))
    return per


# ============================================================================
# afstand
# ============================================================================
def meter(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Vogelvlucht. Op deze afstanden is de platte benadering ruim nauwkeurig genoeg."""
    dy = (lat2 - lat1) * METER_PER_GRAAD
    dx = (lon2 - lon1) * METER_PER_GRAAD * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(dx, dy)


class Raster:
    """Punten in vakjes, zodat niet elke halte tegen elke standplaats gemeten hoeft te worden.

    De vakjes zijn in graden, en een graad lengte is op onze breedte maar 70 km tegen 111 km
    voor een graad breedte. Een vakje moet dus in BEIDE richtingen minstens de straal
    breed zijn — anders mist `binnen()` wat net over de rand van het buurvakje ligt. Een
    eerdere versie rekende met 0,01° in beide richtingen en zag zo in oost-westrichting
    maar ~700 m ver.
    """

    def __init__(self, punten: list[tuple[str, float, float]], straal_m: float):
        self.straal = straal_m
        self.dlat = straal_m / METER_PER_GRAAD
        self.dlon = straal_m / (METER_PER_GRAAD * math.cos(math.radians(51)))
        self.cellen: dict[tuple[int, int], list] = defaultdict(list)
        for p in punten:
            self.cellen[self._cel(p[1], p[2])].append(p)

    def _cel(self, lat: float, lon: float) -> tuple[int, int]:
        return int(math.floor(lat / self.dlat)), int(math.floor(lon / self.dlon))

    def binnen(self, lat: float, lon: float):
        cy, cx = self._cel(lat, lon)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for p in self.cellen.get((cy + dy, cx + dx), ()):
                    d = meter(lat, lon, p[1], p[2])
                    if d <= self.straal:
                        yield p, d


# ============================================================================
# de referentiedag
# ============================================================================
def kies_dag(zips: dict[str, zipfile.ZipFile]) -> date:
    """De dinsdag binnen de geldigheid van beide feeds met de meeste actieve diensten.

    Waarom de méeste: een vakantiedag rijdt met een uitgedunde dienstregeling. De drukste
    dinsdag is dus een gewone schooldag, zonder dat hier een vakantiekalender moet staan.
    """
    van = max(geldigheid(z)[0] for z in zips.values())
    tot = min(geldigheid(z)[1] for z in zips.values())
    if van > tot:
        raise SystemExit(f"FOUT: de dienstregelingen overlappen niet ({van} tot {tot}).")
    dag = van + timedelta(days=(1 - van.weekday()) % 7)
    beste, beste_n = None, -1
    while dag <= tot:
        n = len(actieve_diensten(zips["delijn"], dag))
        if n > beste_n:
            beste, beste_n = dag, n
        dag += timedelta(days=7)
    if beste is None:
        raise SystemExit("FOUT: geen dinsdag binnen de geldigheid van beide dienstregelingen.")
    return beste


# ============================================================================
# bus en tram
# ============================================================================
def bus_tram(z: zipfile.ZipFile, dag: date, standplaatsen: list) -> dict:
    """Per standplaats: de dichtste halte met vaste lijnen, en hoeveel er in de buurt liggen."""
    actief = actieve_ritten(z, dag, BRONNEN["delijn"]["soorten"])
    zeg(f"  {len(actief):,} bus- en tramritten op {dag}".replace(",", "."))

    raster = Raster(standplaatsen, HALTE_ZOEK_M)
    naam_van: dict[str, str] = {}
    buren: dict[str, list[tuple[str, float]]] = {}
    for h in lees(z, "stops.txt"):
        try:
            lat, lon = float(h["stop_lat"]), float(h["stop_lon"])
        except (ValueError, KeyError):
            continue
        dicht = [(p[0], d) for p, d in raster.binnen(lat, lon)]
        if dicht:
            buren[h["stop_id"]] = dicht
            naam_van[h["stop_id"]] = h.get("stop_name", "").strip()
    zeg(f"  {len(buren):,} haltes liggen binnen {HALTE_ZOEK_M} m van een standplaats".replace(",", "."))

    per_halte = ritten_per_halte(z, actief, set(buren))
    uren = (VENSTER_TOT - VENSTER_VAN) / 3600

    # Per standplaats per HALTENAAM: de kleinste afstand, alle ritten samen, en de drukste
    # KANT. De twee kanten van de straat heten meestal hetzelfde en zijn in de data twee
    # haltes, één per richting; de drukste kant is wat je aan die halte per richting krijgt.
    groepen: dict[str, dict[str, list]] = defaultdict(dict)
    for stop_id, lijst in buren.items():
        ritten = per_halte.get(stop_id)
        if not ritten:
            continue                        # bestaat, maar er stopt niets: telt niet
        naam = naam_van[stop_id]
        tram = any(actief.get(r) == "tram" for r in ritten)
        for sid, d in lijst:
            g = groepen[sid].setdefault(naam, [d, set(), False, 0])
            g[0] = min(g[0], d)
            g[1] |= ritten
            g[2] = g[2] or tram
            g[3] = max(g[3], len(ritten))

    uit = {}
    for sid, _, _ in standplaatsen:
        g = groepen.get(sid)
        if not g:
            uit[sid] = None
            continue
        naam, (d, ritten, tram, drukste_kant) = min(g.items(), key=lambda kv: kv[1][0])
        uit[sid] = {
            "halte": {"naam": naam, "m": round(d / 10) * 10,
                      "per_richting": round(drukste_kant / uren, 1),
                      "per_uur": round(len(ritten) / uren, 1), "tram": tram},
            "haltes_binnen": sum(1 for x in g.values() if x[0] <= HALTE_M),
        }
    return uit


# ============================================================================
# trein
# ============================================================================
def trein(z: zipfile.ZipFile, dag: date, standplaatsen: list) -> dict:
    """Per standplaats: het dichtste station binnen TREIN_M, en de treinen per uur daar."""
    actief = actieve_ritten(z, dag, BRONNEN["nmbs"]["soorten"])
    zeg(f"  {len(actief):,} treinritten op {dag}".replace(",", "."))

    # Stationsnamen staan in het Frans in stops.txt; de andere talen in translations.txt.
    vertaling: dict[str, dict[str, str]] = defaultdict(dict)
    if "translations.txt" in z.namelist():
        for r in lees(z, "translations.txt"):
            if r.get("table_name") == "stops" and r.get("field_name") == "stop_name":
                vertaling[r["field_value"]][r["language"]] = r["translation"]

    stations, ouder = [], {}
    namen = {}
    for h in lees(z, "stops.txt"):
        if h.get("location_type") == "1":
            naam = h["stop_name"]
            n = {"fr": naam, **{t: v for t, v in vertaling.get(naam, {}).items() if t in ("nl", "en")}}
            # Tweetalige stations staan soms als "Gent-Sint-Pieters / Gand-Saint-Pierre" in
            # een vertaling; de eerste helft is dan de naam in die taal.
            namen[h["stop_id"]] = {t: v.split(" / ")[0].strip() for t, v in n.items()}
            stations.append((h["stop_id"], float(h["stop_lat"]), float(h["stop_lon"])))
        elif h.get("parent_station"):
            ouder[h["stop_id"]] = h["parent_station"]

    alle_perrons = set(ouder) | {s[0] for s in stations}
    per_perron = ritten_per_halte(z, actief, alle_perrons)
    per_station: dict[str, set] = defaultdict(set)
    for perron, ritten in per_perron.items():
        per_station[ouder.get(perron, perron)] |= ritten

    raster = Raster(stations, TREIN_M)
    uren = (VENSTER_TOT - VENSTER_VAN) / 3600
    uit = {}
    for sid, lat, lon in standplaatsen:
        beste = min(((d, p[0]) for p, d in raster.binnen(lat, lon)
                     if per_station.get(p[0])), default=None)
        if beste:
            d, st_id = beste
            per_uur = len(per_station[st_id]) / uren
            uit[sid] = {"naam": namen[st_id], "m": round(d / 10) * 10,
                        "per_uur": round(per_uur, 1), "per_richting": round(per_uur / 2, 1)}
    return uit


# ============================================================================
def main() -> int:
    ap = argparse.ArgumentParser(description="Mobiscore en openbaar vervoer per standplaats.")
    ap.add_argument("--vernieuw", action="store_true",
                    help="dienstregelingen en Mobiscore opnieuw ophalen, ook als de cache nog vers is")
    args = ap.parse_args()

    repo = Path(__file__).resolve().parent.parent
    feed = repo / "gbfs" / "station_information.json"
    uit = repo / "web" / "ov.json"
    if not feed.exists():
        zeg(f"FOUT: {feed} bestaat niet. Draai eerst genereer_gbfs.py.")
        return 2

    zeg("=" * 90)
    zeg("Dégage — Mobiscore en openbaar vervoer per standplaats")
    zeg("=" * 90)
    info = json.loads(feed.read_text(encoding="utf-8"))
    standplaatsen = [(s["station_id"], s["lat"], s["lon"]) for s in info["data"]["stations"]]
    zeg(f"standplaatsen      {len(standplaatsen)} (uit {feed.name}, feed van {info['last_updated']})")
    zeg(f"keuzes             dichtste halte binnen {HALTE_ZOEK_M} m · haltes geteld binnen {HALTE_M} m · "
        f"station binnen {TREIN_M} m · {VENSTER_VAN // 3600:02d}:00–{VENSTER_TOT // 3600:02d}:00")
    zeg()

    zeg(f"Mobiscore ({MOBISCORE['uitgever']}, laag {MOBISCORE['laag']})")
    # Per PUNT gecachet, niet per station_id: een station_id kan tussen twee dumps van
    # plaats veranderen, een coördinaat niet. Alleen gevonden scores gaan in de cache — een
    # mislukte opvraging moet de volgende keer opnieuw geprobeerd worden, niet drie maanden
    # als "geen score" blijven staan.
    cache_pad = cachemap() / "mobiscore.json"
    try:
        cache = json.loads(cache_pad.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        cache = {}
    vandaag = date.today()
    scores, opgevraagd, uit_cache = {}, 0, 0
    begin = time.time()
    for sid, lat, lon in standplaatsen:
        punt = f"{lat:.6f},{lon:.6f}"
        rij = cache.get(punt)
        if (rij and not args.vernieuw and
                (vandaag - date.fromisoformat(rij["op"])).days < MOBISCORE_CACHE_DAGEN):
            scores[sid] = rij["score"]
            uit_cache += 1
            continue
        scores[sid] = mobiscore(lat, lon)
        if scores[sid] is not None:
            cache[punt] = {"score": scores[sid], "op": vandaag.isoformat()}
        opgevraagd += 1
        if opgevraagd % 100 == 0:
            zeg(f"    {opgevraagd} opgevraagd ({time.time() - begin:.0f} s)")
        time.sleep(MOBISCORE_PAUZE_S)
    cache_pad.parent.mkdir(parents=True, exist_ok=True)
    cache_pad.write_text(json.dumps(cache, indent=0, sort_keys=True), encoding="utf-8")
    zeg(f"  {uit_cache} uit de cache (jonger dan {MOBISCORE_CACHE_DAGEN} dagen), {opgevraagd} opgevraagd")
    gekend = sorted(v for v in scores.values() if v is not None)
    zeg(f"  {len(gekend)} van {len(standplaatsen)} met een score · laagste {gekend[0]} · "
        f"mediaan {statistics.median(gekend)} · hoogste {gekend[-1]}" if gekend else "  GEEN ENKELE SCORE")
    if len(gekend) < len(standplaatsen):
        zeg(f"  zonder score: {', '.join(s for s, v in scores.items() if v is None)}")
    zeg()

    zeg("dienstregelingen")
    paden = {k: haal_zip(k, args.vernieuw) for k in BRONNEN}
    zips = {k: zipfile.ZipFile(p) for k, p in paden.items()}
    versies = {k: feedversie(z) for k, z in zips.items()}
    for k, z in zips.items():
        van, tot = geldigheid(z)
        zeg(f"  {BRONNEN[k]['naam']:<8} versie {versies[k] or '?'} · geldig {van} tot {tot}")
    dag = kies_dag(zips)
    zeg(f"  referentiedag     {dag} (dinsdag met de meeste diensten)")
    zeg()

    zeg("bus en tram (De Lijn)")
    bus = bus_tram(zips["delijn"], dag, standplaatsen)
    zeg()
    zeg("trein (NMBS)")
    tr = trein(zips["nmbs"], dag, standplaatsen)
    zeg()

    resultaat = {}
    for sid, _, _ in standplaatsen:
        rij = {"mobiscore": scores[sid]}
        if bus[sid]:
            rij.update(bus[sid])
        if sid in tr:
            rij["trein"] = tr[sid]
        resultaat[sid] = rij

    zonder_halte = sum(1 for r in resultaat.values() if "halte" not in r)
    met_station = sum(1 for r in resultaat.values() if "trein" in r)
    zeg("samen")
    zeg(f"  {len(resultaat) - zonder_halte} standplaatsen met een halte met vaste lijnen binnen {HALTE_ZOEK_M} m, "
        f"{zonder_halte} zonder")
    zeg(f"  {met_station} met een station binnen {TREIN_M} m")
    zeg()

    bestand = {
        "toelichting": (
            "Per standplaats de Mobiscore (Departement Omgeving, Vlaamse overheid) en feiten "
            "over openbaar vervoer, door scripts/haal_ov.py. De Mobiscore is de totaalscore van "
            "de hectarecel, opgevraagd op het vervaagde punt uit de feed. De OV-feiten zijn "
            "keuzes, geen gegevens: zie de uitleg bovenaan dat script. Bussen en trams per "
            "richting (de drukste kant van de halte), treinen als totaal gedeeld door twee; "
            "flexvervoer telt niet mee; afstanden in vogelvlucht."
        ),
        # De kaart gebruikt dit bestand alleen als het bij de feed hoort die ze toont.
        # Een standplaats kan tussen twee dumps verhuizen met hetzelfde station_id; dan
        # zou ze anders de bereikbaarheid van haar oude adres dragen.
        "voor_feed": info["last_updated"],
        "referentiedag": dag.isoformat(),
        "venster": f"{VENSTER_VAN // 3600:02d}:00-{VENSTER_TOT // 3600:02d}:00",
        "stralen_m": {"halte": HALTE_M, "halte_zoek": HALTE_ZOEK_M, "trein": TREIN_M},
        "mobiscore_bron": MOBISCORE,
        "bronnen": {k: {"naam": b["naam"], "url": b["url"], "via": b["via"],
                        "versie": versies[k]} for k, b in BRONNEN.items()},
        "stations": dict(sorted(resultaat.items())),
    }
    uit.write_text(json.dumps(bestand, ensure_ascii=False, indent=1) + "\n",
                   encoding="utf-8", newline="\n")
    zeg(f"weggeschreven: {uit} ({uit.stat().st_size / 1000:.0f} kB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
