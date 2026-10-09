#!/usr/bin/env python3
"""Bouw de publieke GBFS v3.0-feed van Dégage uit een lijst wagens.

Schrijft zes bestanden naar `gbfs/`:

  gbfs.json · system_information.json · station_information.json ·
  station_status.json · vehicle_types.json   -> GBFS v3.0, voor aggregatoren
  degage_vehicles.json                       -> eigen detailbestand, enkel voor onze kaart

en stuurt daarna naar de Worker wat het in de bron rechtzette (zie stuur_correcties()),
voor de datafouten op de beheerpagina.

Waar de wagens vandaan komen
----------------------------
Dit script kent de databank van Dégage niet. Het neemt een lijst wagens in een vast,
neutraal formaat (zie INVOERVELDEN hieronder) en maakt daar de feed van. Het inlezen van
de databankreplica gebeurt in de interne repo, die deze module importeert en `genereer()`
aanroept met de wagens die ze daar gelezen heeft. Wie die repo niet heeft, kan de bouwer
toch draaien op het verzonnen voorbeeld:

    py scripts/genereer_gbfs.py --invoer scripts/voorbeeld_vloot.json --uit voorbeeld-uit

Wat dit script wél en niet doet
-------------------------------
· Een station is één uniek coördinaat. Wagens op exact hetzelfde punt delen een station.
· Elk coördinaat wordt vervaagd voor het de feed in gaat (LOCATIE_FUZZ_M). Het
  `station_id` komt uit dat vervaagde punt, dus uit niets wat niet al in de feed staat.
· `last_updated` komt uit de datum van de gegevens, nooit uit de klok. Zelfde invoer ->
  byte-voor-byte dezelfde bestanden.
· Validatie is een poort: elk bestand wordt tegen zijn JSON Schema gehouden en er wordt
  pas geschreven als álle zes slagen. Faalt er één, dan blijft de oude output staan.
· Privacy is een tweede poort: de gerenderde tekst wordt gescand op e-mailadressen,
  telefoonnummers, UUID's en lange cijferreeksen, plus wat de oproeper er nog aan toevoegt.
· Een stille correctie is erger dan geen correctie. Elke normalisatie en elke herleiding
  wordt geprint, en per auto naar de Worker gestuurd: de beheerpagina toont ze bij de
  datafouten, zodat iemand ze in de bron kan rechtzetten. Dat is het enige netwerk dat
  dit script gebruikt, pas NA het wegschrijven, en het mag mislukken: de feed hangt er
  niet van af.

Vlaggen bij `--invoer`
----------------------
    --invoer <json>      de wagens, in het formaat van INVOERVELDEN    (verplicht)
    --uit <map>          outputmap                                     (verplicht)
    --datum <dat>        datum van de gegevens   (anders: `datum` in het invoerbestand)
    --basis-url <url>    publieke basis-URL      (anders: CNAME of git)
    --no-interactive     niets vragen            (anders: alleen vragen mét terminal)

`--uit` is verplicht: zo kan een proefrun nooit per ongeluk de echte feed overschrijven.
"""

from __future__ import annotations

import argparse
import calendar
import hashlib
import json
import math
import re
import subprocess
import sys
import unicodedata
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

# ============================================================================
# HET INVOERFORMAAT
# ============================================================================
# Eén dict per wagen. Een veld dat hier niet staat, wordt geweigerd: zo kan er niets
# meeliften naar de feed wat de bouwer niet kent — ook geen intern nummer.
#
#   naam             str    de naam van de auto, uniek in de vloot
#   merk, model      str    vrije tekst; schrijfvarianten worden hier samengeklapt
#   brandstof        str    één van BRANDSTOF_NAAR_PROPULSION
#   inschrijving     str    één van INSCHRIJVING_SLUG
#   klasse           str    één van KLASSEN: de tariefklasse van Dégage, of None
#   zitplaatsen      int
#   bouwjaar         int
#   versnellingsbak  str    "manueel" of "automatisch"
#   toebehoren       list   sleutels uit TOEBEHOREN_SLEUTELS, alleen wat er IS
#   lat, lon         float  het echte punt; dit script vervaagt het
#   plaats           str    gemeente, vrije tekst; hoofdletters worden rechtgezet
#   postcode         str    vier cijfers, of None
#   euronorm         str    vrije tekst, of None; hier herleid tot "Euro 1".."Euro 6"
#   district         str    de lokale groep, of None
INVOERVELDEN = {
    "naam": str, "merk": str, "model": str, "brandstof": str, "inschrijving": str,
    "klasse": (str, type(None)), "zitplaatsen": int, "bouwjaar": int,
    "versnellingsbak": str, "toebehoren": list,
    "lat": float, "lon": float, "plaats": str, "postcode": (str, type(None)),
    "euronorm": (str, type(None)), "district": (str, type(None)),
}

# ============================================================================
# DE BRANDSTOFMAPPING
# ============================================================================
# GBFS `propulsion_type` kent geen aardgas en geen LPG. Die wagens worden `combustion`:
# de eerlijke benadering, want het zijn verbrandingsmotoren. De echte brandstof blijft
# staan in degage_vehicles.json, en het aantal herleidingen wordt bij elke run geprint.
# Een onbekende brandstof laat dit script luid vallen.
BRANDSTOF_NAAR_PROPULSION = {
    "benzine": "combustion",
    "diesel": "combustion_diesel",
    "elektrisch": "electric",
    "CNG": "combustion",  # <-- herleiding, GBFS kent geen aardgas
    "hybride": "hybrid",
    "plug-in hybride": "plug_in_hybrid",
    "LPG": "combustion",  # <-- herleiding, GBFS kent geen LPG
}
HERLEID_NAAR_COMBUSTION = {"CNG", "LPG"}

# ============================================================================
# max_range_meters — GEEN GEMETEN WAARDE, EEN GEDOCUMENTEERDE ONDERGRENS
# ============================================================================
# Het officiële v3.0-schema eist `max_range_meters` bij ÉLKE propulsion_type behalve
# `human` (zie de if/then onderaan vehicle_types.json). Het veld weglaten kan dus niet:
# dan schrijft dit script helemaal geen output weg.
#
# Wij kennen het échte bereik niet uit de data. Daarom staan hier bewust CONSERVATIEVE
# ONDERGRENZEN per aandrijving: liever te weinig beloven dan te veel. Ze worden bij elke
# run geprint.
MAX_RANGE_METERS = {
    "combustion": 400_000,  # 400 km — een volle tank benzine/CNG/LPG haalt dat ruim
    "combustion_diesel": 400_000,  # 400 km — diesel haalt in de praktijk meer
    "hybrid": 400_000,  # 400 km — hybride haalt in de praktijk meer
    "plug_in_hybrid": 400_000,  # 400 km — batterij én tank samen, ruim onder het echte bereik
    "electric": 100_000,  # 100 km — ondergrens voor de oudste kleine EV's in de vloot
}

# Aandrijving in mensentaal voor de typenaam. `combustion` is een verzamelbak
# (benzine + CNG + LPG), dus die heet hier niet "benzine" maar "benzine of gas" —
# anders belooft de naam iets wat voor de gaswagens niet klopt.
PROPULSION_NL = {
    "combustion": "benzine of gas",
    "combustion_diesel": "diesel",
    "electric": "elektrisch",
    "hybrid": "hybride",
    "plug_in_hybrid": "plug-in hybride",
}

# De inschrijving kent twee waarden. Een derde laat dit script luid vallen.
#
# LET OP BIJ HET LEZEN: dit is de INSCHRIJVING, niet de vorm van de wagen. "Lichte vracht"
# is de Belgische fiscale categorie — een bestelwagen zonder achterbank, ingeschreven met
# het bijhorende belastingregime. Het zegt niets over hoe groot of hoe busvormig een wagen
# eruitziet: hetzelfde model (een Kangoo, een Berlingo) kan in beide categorieën staan,
# afhankelijk van hoe dat exemplaar is ingeschreven.
#
# Daarom heet dit veld naar buiten "Lichte vracht" en niet "Bestelwagen". De vorm zelf
# staat in de handmatige carrosserielijst hieronder.
INSCHRIJVING_SLUG = {"personenwagen": "passenger", "lichte_vracht": "freight"}
INSCHRIJVING_NL = {"personenwagen": "Personenwagen", "lichte_vracht": "Lichte vracht"}

# De klasse is de tariefklasse van Dégage: elke wagen rijdt aan de kilometerprijs van zijn
# klasse, en B is duurder dan A. Ze zegt dus iets wat een lid wil weten vóór het boekt.
# Het is een indeling van Dégage, geen eigenschap van de wagen: de feed draagt alleen de
# letter, de prijzen zelf veranderen per kwartaal en staan op degage.be. Kent de bron
# geen klasse, dan blijft het veld weg (zoals bij de euronorm); een derde waarde laat dit
# script luid vallen.
KLASSEN = ("A", "B")

# ============================================================================
# CARROSSERIE — een handmatige lijst
# ============================================================================
# De vraag "is dit een bestelwagen?" is niet uit de gegevens te beantwoorden. De
# inschrijving gaat over de belasting (zie hierboven), en de modelnaam is vrije tekst
# waar we niets uit afleiden.
#
# Daarom een lijst die met de hand wordt bijgehouden: `scripts/carrosserie.json`, met per
# 'merk|model' één van twee waarden. Dat is geen omweg maar de enige eerlijke manier —
# iemand die de vloot kent, beslist het één keer, en daarna ligt het vast.
#
# Duikt er een model op dat er niet in staat, dan VRAAGT de generator ernaar. Met
# --no-interactive doet hij dat niet en faalt hij luid met de lijst erbij, zodat een
# geautomatiseerde run nooit stilzwijgend iets verzint.
CARROSSERIE_WAARDEN = ("Personenwagen", "Bestelwagen")
CARROSSERIE_BESTAND = "carrosserie.json"

# ============================================================================
# DISTRICT EN CONTACTADRES
# ============================================================================
# Elke wagen hangt aan een district — de lokale Dégage-groep ("Gent - Brugse Poort",
# "Beveren"). Dat is een organisatiegegeven, geen persoonsgegeven. Het mag dus mee.
#
# Het e-mailadres van zo'n groep komt uit een tweede handmatige lijst,
# `scripts/districten.json`, met per districtsnaam een adres. Het wordt nergens uit
# afgeleid — een verzonnen adres levert post op die nergens aankomt. Staat er niets, dan
# draagt de feed geen adres.
DISTRICTEN_BESTAND = "districten.json"

# ============================================================================
# GEGEVENS VAN HET SYSTEEM
# ============================================================================
# `None` betekent: het veld blijft weg uit de feed, want een verzonnen URL is erger dan
# een leeg veld.
SYSTEM_ID = "degage"
TAAL = "nl"
NAAM = "Dégage"
OPERATOR = "Dégage"
SITE_URL = "https://www.degage.be/"
# Nooit een persoonlijk adres.
FEED_CONTACT_EMAIL = "info@degage.be"
PURCHASE_URL = None
# Licentie van de data: CC BY 4.0.
LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
# Basis-URL van de gepubliceerde feed. De feed woont op GitHub Pages onder de publieke
# repo; de GBFS-bestanden staan daar in de submap `gbfs`. Komt er later een eigen domein,
# dan wint een `CNAME` in de root hierop — of geef `--basis-url` mee.
BASIS_URL_STANDAARD = "https://degagemain.github.io/degage-deelautokaart-gbfs/gbfs"

# `ttl` staat op de refreshcadans. Wij verversen manueel per kwartaal, dus een korte ttl
# liegt. 86400 = één dag: consumers mogen dagelijks pollen zonder valse belofte.
TTL = 86_400
GBFS_VERSIE = "3.0"
EIGEN_VERSIE = "1.0"

# Coördinaten worden op 6 decimalen naar buiten gebracht (±0,1 m) en OP DIE AFGERONDE
# WAARDE geclusterd, zodat elk station in de output een eigen punt heeft.
COORD_DECIMALEN = 6

# ============================================================================
# COÖRDINATEN VERVAGEN
# ============================================================================
# De feed draagt de plek waar een deelauto staat, en dat is bij de meeste wagens het huis
# van de eigenaar. Een coördinaat op de meter nauwkeurig wijst dan één voordeur aan.
# Daarom krijgt elke standplaats een vaste verschuiving van LOCATIE_FUZZ_M meter in een
# richting die niet uit de data af te leiden is.
#
# Wat dit wél en niet doet
# ------------------------
# · Het is een VASTE afstand, geen toevallige tussen nul en twintig meter. Zo ligt het
#   echte punt altijd op een cirkel van twintig meter rond de stip, en nooit toevallig
#   er bovenop.
# · Het is geen garantie. In een straat met smalle rijhuizen dekt twintig meter een paar
#   huizen; in een verkaveling met brede percelen minder. Het maakt de voordeur
#   dubbelzinnig, het maakt hem niet onvindbaar. Wie meer wil, moet de precisie zelf
#   omlaag brengen (een groter getal, of afronden op straatniveau).
# · De feed draagt géén straat en huisnummer, alleen gemeente en postcode. De verschuiving
#   hoeft dus alleen het coördinaat zelf dubbelzinnig te maken.
#
# Waarom het bestendig is
# -----------------------
# De richting komt uit een hash van het AFGERONDE COÖRDINAAT, niet uit een toevalsgetal.
# Dat heeft twee gevolgen die allebei nodig zijn:
#   · Dezelfde invoer levert dezelfde bestanden op — de generator blijft deterministisch.
#   · Dezelfde plek houdt kwartaal na kwartaal dezelfde verschuiving, ook als de wagens
#     die er staan wisselen. Anders zou elke verversing de stippen zichtbaar laten
#     verspringen, en dat leest als data die niet klopt.
#
# De kaart vertelt de bezoeker dat de locatie bij benadering is; het getal hieronder gaat
# als `locatie_nauwkeurigheid_m` mee in degage_vehicles.json, zodat die twee niet uit
# elkaar kunnen lopen.
LOCATIE_FUZZ_M = 20

# Meter per graad breedte. Voor lengte deelt dit nog door cos(breedte); op onze
# breedtegraad scheelt dat ruim een derde, en dat weglaten zou de verschuiving in
# oost-westrichting een halve meter te groot maken.
METER_PER_GRAAD = 111_320.0


def verschuif(lat: float, lon: float) -> tuple[float, float]:
    """Zet een coördinaat LOCATIE_FUZZ_M meter opzij, in een bestendige richting.

    De hoek komt uit een SHA-256 van het afgeronde coördinaat: hetzelfde punt geeft altijd
    dezelfde hoek, op elke machine en in elke Python-versie. (De ingebouwde `hash()` kan
    dat niet beloven — die is per proces gezouten.)
    """
    sleutel = f"{lat:.6f},{lon:.6f}".encode("utf-8")
    # 64 bits is ruim genoeg voor een hoek en houdt het getal leesbaar in de logs.
    getal = int.from_bytes(hashlib.sha256(sleutel).digest()[:8], "big")
    hoek = (getal / 2**64) * 2 * math.pi

    dnoord = LOCATIE_FUZZ_M * math.cos(hoek)
    doost = LOCATIE_FUZZ_M * math.sin(hoek)
    nieuwe_lat = lat + dnoord / METER_PER_GRAAD
    nieuwe_lon = lon + doost / (METER_PER_GRAAD * math.cos(math.radians(lat)))
    return round(nieuwe_lat, COORD_DECIMALEN), round(nieuwe_lon, COORD_DECIMALEN)


def station_id(vaag_lat: float, vaag_lon: float) -> str:
    """Het station_id van een standplaats: een korte hash van het VERVAAGDE punt.

    Uit het vervaagde punt en uit niets anders, zodat het id niets prijsgeeft wat niet al
    in de feed staat. Het is bestendig zolang de plek dezelfde blijft, en de kaart rekent
    het op dezelfde manier uit voor een standplaats die nog niet in de feed staat
    (`stationId()` in map/index.js). Wijzigt de ene, wijzig dan de andere mee.

    Alleen letters, geen hexadecimaal: een reeks cijfers in een id zou de privacyscan
    doen aanslaan op iets wat op een telefoonnummer lijkt.
    """
    sleutel = f"{vaag_lat:.6f},{vaag_lon:.6f}".encode("utf-8")
    return "st-" + "".join(chr(97 + b % 26) for b in hashlib.sha256(sleutel).digest()[:12])


# De toebehoren: de sleutels in het detailbestand.
#
# EEN TOEBEHOREN KOMT ALLEEN MEE ALS HET ER IS. In de bron is "niet aanwezig" niet te
# scheiden van "nooit ingevuld". Een `false` wegschrijven zou die onwetendheid als feit
# presenteren, en de kaart zou er "trekhaak: nee" van kunnen maken. Wagens zonder enig
# toebehoren houden een leeg object: dat zegt "wij weten van geen enkel toebehoren", niet
# "er is er geen".
TOEBEHOREN_SLEUTELS = [
    "gps", "trekhaak", "huisdieren", "kinderzitje", "fietsdrager", "aanhanger", "bed",
    "leren_autorijden",
]

# De versnellingsbak is een eigen veld, geen toebehoren: elke wagen heeft er een, en ze is
# manueel of automatisch. "Afwezig" bestaat hier niet, dus dit veld is altijd ingevuld.
VERSNELLINGSBAKKEN = ("manueel", "automatisch")

# ============================================================================
# EURONORM — vrije tekst in de bron, hier herleid tot één generatie
# ============================================================================
# De euronorm wordt met de hand ingevuld en dat zie je: '6', '6b', 'Euro 6b', 'euro 6',
# '6*', 'nvt', ... De norm kent zelf maar zes generaties, en de subletters (6b, 6c, 6d,
# 6e) zijn verfijningen bínnen generatie 6. Daarom wordt alles herleid tot "Euro 1" t/m
# "Euro 6", en valt de rest op onbekend.
#
# Drie dingen die deze herleiding bewust NIET doet:
# · Ze raadt niet bij een dubbelzinnige invoer. Uit '5 of 6' het eerste cijfer pikken zou
#   een gok als feit presenteren. Alles met het woord "of" erin valt op onbekend.
# · Ze verzint geen norm waar er geen staat. Ontbreekt de waarde, of is ze '', 'nvt',
#   '*' of '0', dan komt het veld niet in het bestand — dezelfde regel als bij de
#   toebehoren: liever niets dan een onwetendheid als feit.
# · Ze knipt geen betekenis weg die ze niet kent. De asterisk ('6*') wordt genegeerd, en
#   bij elke run wordt geprint hoeveel waarden er een droegen.
RE_EURONORM_DUBBELZINNIG = re.compile(r"\bof\b")
RE_EURONORM_GENERATIE = re.compile(r"^([1-6])")

# ============================================================================
# PRIVACY — de poort op de output
# ============================================================================
# Nooit in de output, ook niet in een tussenbestand. De scan zoekt op de vorm (e-mail,
# telefoon, UUID, lange cijferreeks). De oproeper kan er termen aan toevoegen die hij zelf
# kent en die nooit naar buiten mogen (`extra_verboden` in genereer()).
RE_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
RE_UUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
RE_CIJFERREEKS = re.compile(r"\d{9,}")
RE_TELEFOON = re.compile(r"(?:\+?32|\b0)[\s./-]?[1-9](?:[\s./-]?\d){7,8}\b")


# ============================================================================
# hulpjes
# ============================================================================
def zeg(regel: str = "") -> None:
    print(regel, flush=True)


def _laatste_zondag(jaar: int, maand: int) -> date:
    laatste = date(jaar, maand, calendar.monthrange(jaar, maand)[1])
    return laatste - timedelta(days=(laatste.weekday() + 1) % 7)


def brussel_offset(d: date) -> str:
    """De UTC-offset van Europe/Brussels op datum `d`, als '+01:00' of '+02:00'.

    De EU-regel staat hier expliciet uitgeschreven in plaats van via `zoneinfo`: op
    Windows hangt die af van een los `tzdata`-pakket, en een kwartaalrefresh over een
    jaar mag daar niet op stuklopen. Zomertijd loopt van de laatste zondag van maart
    tot de laatste zondag van oktober; we rekenen op dagniveau, dus het omschakelingsuur
    zelf speelt niet mee.
    """
    return "+02:00" if _laatste_zondag(d.year, 3) <= d < _laatste_zondag(d.year, 10) else "+01:00"


def tijdstempel(d: date) -> str:
    """RFC3339-tijdstempel voor de datum van de gegevens, middernacht Brusselse tijd."""
    return f"{d.isoformat()}T00:00:00{brussel_offset(d)}"


def nl_getal(x: float | int, nd: int = 0) -> str:
    return f"{float(x):,.{nd}f}".replace(",", "@").replace(".", ",").replace("@", ".")


def tekst(s: str) -> list[dict[str, str]]:
    """GBFS v3.0 wil een array van gelokaliseerde strings, geen platte string."""
    return [{"text": s, "language": TAAL}]


def _variantsleutel(s: str) -> str:
    """Sleutel om schrijfvarianten te groeperen: zonder accenten, zonder hoofdletters."""
    kaal = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    return " ".join(kaal.split()).lower()


def _heeft_accenten(s: str) -> bool:
    return any(unicodedata.combining(c) for c in unicodedata.normalize("NFKD", s))


def controleer_invoer(vloot: list[dict]) -> None:
    """Houd de invoer tegen INVOERVELDEN en de toegelaten waarden; faal luid bij afwijking.

    Een onbekend veld wordt geweigerd, ook als de bouwer er niets mee zou doen: wie het
    meegeeft, verwacht dat het ergens heen gaat, en dat moet dan een bewuste keuze in dit
    script zijn.
    """
    fouten: list[str] = []
    namen = Counter()
    for i, w in enumerate(vloot):
        wie = f"wagen {i + 1} ({w.get('naam', '?')!r})"
        if not isinstance(w, dict):
            fouten.append(f"{wie}: geen object")
            continue
        for veld in sorted(set(w) - set(INVOERVELDEN)):
            fouten.append(f"{wie}: onbekend veld {veld!r}")
        for veld, soort in INVOERVELDEN.items():
            if veld not in w:
                fouten.append(f"{wie}: veld {veld!r} ontbreekt")
                continue
            waarde = w[veld]
            # Een int is ook een geldige float voor een coördinaat, een bool geen int.
            goed = (isinstance(waarde, (int, float)) and not isinstance(waarde, bool)
                    if soort is float else
                    isinstance(waarde, soort) and not isinstance(waarde, bool))
            if not goed:
                fouten.append(f"{wie}: {veld} = {waarde!r} heeft het verkeerde type")
        if w.get("brandstof") not in BRANDSTOF_NAAR_PROPULSION:
            fouten.append(f"{wie}: onbekende brandstof {w.get('brandstof')!r}")
        if w.get("inschrijving") not in INSCHRIJVING_SLUG:
            fouten.append(f"{wie}: onbekende inschrijving {w.get('inschrijving')!r}")
        if w.get("klasse") is not None and w.get("klasse") not in KLASSEN:
            fouten.append(f"{wie}: onbekende klasse {w.get('klasse')!r}")
        if w.get("versnellingsbak") not in VERSNELLINGSBAKKEN:
            fouten.append(f"{wie}: onbekende versnellingsbak {w.get('versnellingsbak')!r}")
        for t in w.get("toebehoren") or []:
            if t not in TOEBEHOREN_SLEUTELS:
                fouten.append(f"{wie}: onbekend toebehoren {t!r}")
        if isinstance(w.get("naam"), str):
            namen[w["naam"].strip()] += 1
    for naam, n in sorted(namen.items()):
        if n > 1:
            fouten.append(f"de naam {naam!r} staat {n} keer in de vloot; namen zijn uniek")
    if fouten:
        raise SystemExit("FOUT in de invoer — niets weggeschreven:\n  " + "\n  ".join(fouten))


def laad_carrosserie(pad: Path) -> dict:
    if not pad.exists():
        return {"carrosserie": {}}
    gegevens = json.loads(pad.read_text(encoding="utf-8"))
    gegevens.setdefault("carrosserie", {})
    return gegevens


def bewaar_carrosserie(pad: Path, gegevens: dict) -> None:
    """Schrijf de lijst weg, alfabetisch gesorteerd.

    Let op: het dict in `gegevens` wordt NIET vervangen door een gesorteerde kopie. Dat
    deed deze functie eerst, en dan wijst een `lijst`-verwijzing bij de oproeper naar het
    oude object — waarna elk antwoord ná het eerste in het niets verdween.
    """
    uit = dict(gegevens)
    uit["carrosserie"] = dict(sorted(gegevens["carrosserie"].items()))
    pad.write_text(json.dumps(uit, ensure_ascii=False, indent=2) + "\n",
                   encoding="utf-8", newline="\n")


def vul_carrosserie_aan(vloot: list[dict], merk_map: dict, model_map: dict,
                        pad: Path, interactief: bool) -> dict[str, str]:
    """Zorg dat elk merk+model in de lijst staat; vraag ernaar of faal luid.

    Geeft de afbeelding {'merk|model' -> carrosserie} terug.
    """
    gegevens = laad_carrosserie(pad)
    lijst = gegevens["carrosserie"]

    aantallen: dict[str, int] = {}
    for r in vloot:
        sleutel = f"{merk_map[r['merk']]}|{model_map[r['model']]}"
        r["carrosserie_sleutel"] = sleutel
        aantallen[sleutel] = aantallen.get(sleutel, 0) + 1

    ontbreekt = sorted((s for s in aantallen if s not in lijst),
                       key=lambda s: (-aantallen[s], s))

    zeg("carrosserie — handmatige lijst, want de gegevens kennen het soort voertuig niet")
    zeg(f"  lijst: {pad}")
    zeg(f"  {len(aantallen)} modellen in de vloot, {len(aantallen) - len(ontbreekt)} al ingedeeld")

    if ontbreekt and not interactief:
        zeg()
        zeg(f"FOUT: {len(ontbreekt)} model(len) staan niet in {pad.name} en --no-interactive")
        zeg("staat aan, dus er wordt niets gevraagd en niets geraden:")
        for s in ontbreekt:
            zeg(f"  {s}   ({aantallen[s]} wagens)")
        zeg()
        zeg("Draai dit script één keer zonder --no-interactive, of vul de lijst met de hand aan.")
        raise SystemExit(1)

    if ontbreekt:
        zeg()
        zeg(f"  {len(ontbreekt)} nieuw model(len) — graag één keer indelen.")
        zeg("  Antwoord met 'p' voor personenwagen of 'b' voor bestelwagen.")
        zeg("  Een MPV of ruime gezinswagen (Touran, Zafira, Scenic) is een PERSONENWAGEN;")
        zeg("  bestelwagen is de busvorm (Berlingo, Kangoo, Caddy, Transit).")
        zeg()
        for i, sleutel in enumerate(ontbreekt, 1):
            merk, model = sleutel.split("|", 1)
            while True:
                antwoord = input(
                    f"  [{i}/{len(ontbreekt)}] {merk} {model}  ({aantallen[sleutel]} wagens) "
                    "— [p]ersonenwagen of [b]estelwagen? "
                ).strip().lower()
                if antwoord in ("p", "b"):
                    break
                zeg("      Antwoord met 'p' of 'b'.")
            lijst[sleutel] = "Bestelwagen" if antwoord == "b" else "Personenwagen"
            # Meteen wegschrijven: breekt iemand af, dan is het antwoord niet weg.
            bewaar_carrosserie(pad, gegevens)
        zeg()
        zeg(f"  {len(ontbreekt)} model(len) toegevoegd aan {pad.name}.")

    telling = Counter(lijst[s] for s in aantallen)
    for soort in CARROSSERIE_WAARDEN:
        wagens = sum(aantallen[s] for s in aantallen if lijst[s] == soort)
        zeg(f"  {soort:<14} {telling[soort]:>3} modellen, {wagens:>3} wagens")
    zeg()
    return lijst


RE_DEGAGE_MAIL = re.compile(r"^[A-Za-z0-9._%+-]+@degage\.be$")


def laad_districten(vloot: list[dict], pad: Path) -> dict[str, str]:
    """Lees de handmatige lijst district -> contactadres, en vul ontbrekende namen aan.

    Nieuwe districten komen er leeg bij staan; ze worden NIET gevraagd zoals bij de
    carrosserie. Reden: een leeg adres is hier ongevaarlijk — de feed draagt dan gewoon
    geen contact — terwijl een ontbrekende carrosserie een filter stuk zou maken.
    """
    namen = sorted({r["district"] for r in vloot if r["district"]})
    gegevens = {"toelichting": "", "adressen": {}}
    if pad.exists():
        gegevens = json.loads(pad.read_text(encoding="utf-8"))
        gegevens.setdefault("adressen", {})

    gegevens["toelichting"] = (
        "Handmatig onderhouden: het contactadres van de lokale Dégage-groep, per district. "
        "Wordt nergens uit afgeleid. "
        "Laat een adres leeg als je het niet zeker weet: dan "
        "draagt de feed er gewoon geen. Alleen adressen op @degage.be worden aanvaard; "
        "een persoonlijk adres hoort hier nooit in."
    )

    nieuw = [n for n in namen if n not in gegevens["adressen"]]
    for n in nieuw:
        gegevens["adressen"][n] = ""
    gegevens["adressen"] = dict(sorted(gegevens["adressen"].items()))
    pad.write_text(json.dumps(gegevens, ensure_ascii=False, indent=2) + "\n",
                   encoding="utf-8", newline="\n")

    adressen, fout = {}, []
    for naam, adres in gegevens["adressen"].items():
        adres = (adres or "").strip()
        if not adres:
            continue
        if not RE_DEGAGE_MAIL.match(adres):
            fout.append(f"{naam}: {adres!r}")
            continue
        adressen[naam] = adres

    zeg("districten — contactadres per lokale groep (handmatige lijst)")
    zeg(f"  lijst: {pad}")
    zeg(f"  {len(namen)} districten in de vloot, {len(adressen)} met een adres, "
        f"{len(namen) - len(adressen)} zonder")
    if nieuw:
        zeg(f"  {len(nieuw)} nieuw district(en) leeg toegevoegd aan {pad.name}: "
            + ", ".join(nieuw))
    if fout:
        raise SystemExit(
            "FOUT: deze adressen staan niet op @degage.be en worden geweigerd:\n  "
            + "\n  ".join(fout)
            + "\nEen persoonlijk adres hoort niet in een publieke feed."
        )
    if not adressen:
        zeg("  (nog geen enkel adres ingevuld — de feed draagt dan geen contact)")
    zeg()
    return adressen


def euronorm(ruw: str | None) -> str | None:
    """Herleid de vrije tekst van de euronorm tot 'Euro 1'..'Euro 6', of None.

    None betekent hier "wij weten het niet", nooit "de wagen heeft geen norm". Zie de
    toelichting bij RE_EURONORM_GENERATIE hierboven voor waarom er niet geraden wordt.
    """
    if ruw is None:
        return None
    s = " ".join(str(ruw).split()).lower()
    if not s or RE_EURONORM_DUBBELZINNIG.search(s):
        return None
    s = re.sub(r"^euro\s*", "", s)
    m = RE_EURONORM_GENERATIE.match(s)
    return f"Euro {m.group(1)}" if m else None


def normaliseer(waarden: list[str], label: str) -> dict[str, str]:
    """Klap schrijfvarianten van vrije tekst samen, zonder er één te verzinnen.

    Merk en model zijn vrije tekst: `caddy maxi` naast `Caddy Maxi`, spaties vooraan,
    'Citroen' naast 'Citroën'. De regel is: groepeer op een accent- en
    hoofdletterongevoelige sleutel en kies binnen elke groep de vorm die het VAAKST in de
    data staat. Bij gelijke stand wint eerst de vorm met gemengde hoofdletters, dan de
    vorm mét accenten (een ontbrekend accent is de typische tikafkorting, niet andersom),
    dan alfabetisch. Zo komt er nooit een schrijfwijze in de feed die niet in de bron
    stond — de keuze is altijd een waarde die iemand echt heeft ingetypt.

    Wat dit uitdrukkelijk NIET doet: trimniveaus wegknippen ('Trekking Beats 1.6 Mjet
    105 HP' blijft staan). Daarvoor is een modellijst nodig die we niet hebben, en raden
    is erger dan laten staan.

    Geeft een afbeelding {ruwe waarde -> gekozen waarde} terug en print elke groep die
    meer dan één schrijfwijze had.
    """
    per_sleutel: dict[str, Counter] = defaultdict(Counter)
    for ruw in waarden:
        per_sleutel[_variantsleutel(ruw)][" ".join(ruw.split())] += 1

    keuze_per_sleutel: dict[str, str] = {}
    groepen: list[tuple[list[str], str, int]] = []
    for sleutel, teller in per_sleutel.items():
        varianten = sorted(teller)
        gekozen = min(
            varianten,
            key=lambda v: (
                -teller[v],
                0 if (v != v.lower() and v != v.upper()) else 1,  # gemengde hoofdletters eerst
                0 if _heeft_accenten(v) else 1,  # dan de vorm mét accenten
                v,
            ),
        )
        keuze_per_sleutel[sleutel] = gekozen
        if len(varianten) > 1:
            groepen.append((varianten, gekozen, sum(teller.values())))

    geraakt = sum(n for _, _, n in groepen)  # rijen in groepen met meer dan één schrijfwijze
    zeg(f"  {label}: {len(per_sleutel)} unieke waarden na normalisatie "
        f"(ruw: {len(set(waarden))}), {len(groepen)} groepen samengeklapt, {geraakt} rijen geraakt")
    for varianten, gekozen, n in sorted(groepen):
        zeg(f"    {' | '.join(repr(v) for v in varianten)}  ->  {gekozen!r}  ({n} rijen)")

    return {ruw: keuze_per_sleutel[_variantsleutel(ruw)] for ruw in set(waarden)}


# Gemeentenamen: de voegwoordjes die in een samengestelde naam klein blijven —
# "Heist-op-den-Berg", "Louvain-la-Neuve", "Braine-l'Alleud", "Petegem a/d Leie".
KLEINE_WOORDJES = {"aan", "de", "den", "der", "het", "in", "op", "ten", "ter", "van",
                   "a", "d", "la", "le", "les", "l", "sur", "sous", "lez", "en"}
RE_WOORD = re.compile(r"[^\W\d_]+")


def plaatsnaam(ruw: str) -> str:
    """Zet de hoofdletters van een gemeentenaam recht, en alleen de hoofdletters.

    De gemeente is met de hand ingevuld, en dat zie je: 'GENTBRUGGE', 'gent',
    'Sint-amandsberg (gent)', 'Petegem-Aan-De-Leie'. Elk woord krijgt één hoofdletter
    vooraan; de voegwoordjes uit KLEINE_WOORDJES blijven klein binnen een samengestelde
    naam (vóór een koppelteken, apostrof of schuine streep, of net erna), maar niet waar
    ze een eigen naam beginnen: 'Nazareth-De Pinte'. 'ij' vooraan wordt 'IJ'. Cijfers en
    leestekens blijven staan.

    Waarom hier wél een regel en niet de meerderheidskeuze van normaliseer(): bij een
    gemeente is de juiste schrijfwijze vaak nergens in de bron te vinden ('SINT-AMANDSBERG
    (GENT)' naast 'Sint-amandsberg (gent)'). De regel verzint niets: de letters blijven
    exact dezelfde, alleen hun grootte verandert — en dat wordt hieronder afgedwongen.
    Een ontbrekend koppelteken ('Sint Amandsberg') of een postcode in het veld ('9120
    (Melsele)') blijft dus staan; dat rechtzetten zou wél raden zijn.
    """
    s = " ".join(ruw.split())

    def schrijf(m: re.Match) -> str:
        klein = m.group(0).lower()
        voor = s[m.start() - 1] if m.start() else ""
        na = s[m.end()] if m.end() < len(s) else ""
        begin = m.start() == 0 or voor == "("
        if not begin and klein in KLEINE_WOORDJES and (na in ("-", "'", "’", "/") or voor == "/"):
            return klein
        if klein.startswith("ij"):
            return "IJ" + klein[2:]
        return klein[:1].upper() + klein[1:]

    uit = RE_WOORD.sub(schrijf, s)
    if uit.lower() != s.lower():
        raise ValueError(f"plaatsnaam() veranderde meer dan hoofdletters: {ruw!r} -> {uit!r}")
    return uit


def normaliseer_plaatsen(waarden: list[str]) -> dict[str, str]:
    """Pas plaatsnaam() toe op elke gemeente en print elke schrijfwijze die verandert.

    Geeft een afbeelding {ruwe waarde -> rechtgezette waarde} terug, zoals normaliseer().
    """
    teller = Counter(waarden)
    afbeelding = {ruw: plaatsnaam(ruw) for ruw in teller}
    gewijzigd = {ruw: uit for ruw, uit in afbeelding.items() if uit != " ".join(ruw.split())}
    geraakt = sum(teller[ruw] for ruw in gewijzigd)
    zeg(f"  plaats: {len(set(afbeelding.values()))} unieke waarden na "
        f"normalisatie (ruw: {len(teller)}), {len(gewijzigd)} schrijfwijzen rechtgezet, "
        f"{geraakt} rijen geraakt — alleen hoofdletters, nooit letters")
    for ruw in sorted(gewijzigd, key=lambda v: (v.lower(), v)):
        zeg(f"    {ruw!r}  ->  {gewijzigd[ruw]!r}  ({teller[ruw]} rijen)")
    return afbeelding


# ============================================================================
# validatie
# ============================================================================
def _formatchecker():
    """Een FormatChecker die niet stil overslaat wat hij niet kan checken.

    `jsonschema` controleert `format` alleen als de bijhorende extra pakketten er zijn:
    `date-time` vraagt `rfc3339-validator`, `uri` vraagt `rfc3987`. Die zitten niet in de
    repo-dependencies, en dan slaat de validator die formats zwijgend over — precies het
    soort stille gat waar deze feed niet op mag draaien. Daarom registreren we ze hier
    zelf, zodat het gedrag niet afhangt van wat toevallig geïnstalleerd staat.
    """
    from jsonschema import Draft7Validator, FormatChecker

    fc = FormatChecker()
    for naam, checker in Draft7Validator.FORMAT_CHECKER.checkers.items():
        fc.checkers[naam] = checker

    rfc3339 = re.compile(
        r"^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$"
    )

    @fc.checks("date-time", raises=())
    def _date_time(waarde) -> bool:
        return not isinstance(waarde, str) or bool(rfc3339.match(waarde))

    absolute_uri = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*://[^\s]+$")

    @fc.checks("uri", raises=())
    def _uri(waarde) -> bool:
        return not isinstance(waarde, str) or bool(absolute_uri.match(waarde))

    return fc


def valideer(naam: str, payload: dict, schema_pad: Path, fc) -> list[str]:
    """Houd één payload tegen zijn schema en geef de fouten leesbaar terug."""
    from jsonschema import Draft7Validator

    if not schema_pad.exists():
        return [f"schema ontbreekt: {schema_pad}"]
    schema = json.loads(schema_pad.read_text(encoding="utf-8"))
    validator = Draft7Validator(schema, format_checker=fc)
    fouten = []
    for f in sorted(validator.iter_errors(payload), key=lambda e: list(e.absolute_path)):
        pad = "/".join(str(p) for p in f.absolute_path) or "(root)"
        fouten.append(f"{naam}: {pad}: {f.message}")
    return fouten


def controleer_privacy(naam: str, ruwe_tekst: str,
                       toegelaten_mail: set[str] | None = None,
                       extra_verboden: list[str] | None = None) -> list[str]:
    """Scan de gerenderde JSON op alles wat nooit naar buiten mag.

    `toegelaten_mail` zijn de groepsadressen uit `districten.json`. Die uitzondering is
    smal en met opzet: een adres komt er alleen in als een mens het met de hand in dat
    bestand heeft gezet én het op @degage.be staat. Elk ander adres laat deze poort
    falen. `extra_verboden` zijn termen die de oproeper meegeeft; ze mogen nergens in de
    output staan, ongeacht hoofdletters.
    """
    toegelaten = {FEED_CONTACT_EMAIL} | (toegelaten_mail or set())
    lekken = []
    klein = ruwe_tekst.lower()
    for term in extra_verboden or []:
        if term.lower() in klein:
            lekken.append(f"{naam}: verboden term {term!r} staat in de output")
    for m in RE_EMAIL.finditer(ruwe_tekst):
        if m.group(0) not in toegelaten:
            lekken.append(f"{naam}: e-mailadres in de output: {m.group(0)!r}")
    for m in RE_UUID.finditer(ruwe_tekst):
        lekken.append(f"{naam}: UUID in de output: {m.group(0)!r}")
    for m in RE_CIJFERREEKS.finditer(ruwe_tekst):
        lekken.append(f"{naam}: cijferreeks van 9+ cijfers: {m.group(0)!r}")
    for m in RE_TELEFOON.finditer(ruwe_tekst):
        lekken.append(f"{naam}: ziet eruit als een telefoonnummer: {m.group(0)!r}")
    return lekken


def render(payload: dict) -> str:
    """Deterministische JSON: UTF-8, vaste inspringing, altijd LF, altijd een slotregel."""
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


# ============================================================================
# opbouw van de feed
# ============================================================================
def bouw(vloot: list[dict], stempel: str, basis_url: str,
         carrosserie_pad: Path, districten_pad: Path, interactief: bool,
         correcties_uit: list[dict] | None = None) -> dict[str, dict]:
    """Bouw de zes payloads. Print elke keuze die de data aanraakt.

    Wat er per auto rechtgezet werd, komt in `correcties_uit` als de oproeper een lijst
    meegeeft (zie stuur_correcties()); het hoort niet in de feed."""
    # Werk op een kopie: de oproeper mag zijn lijst terugkrijgen zoals hij ze gaf.
    vloot = [dict(w) for w in vloot]

    zeg("normalisatie van de vrije tekst (niets stil gecorrigeerd)")
    merk_map = normaliseer([r["merk"] for r in vloot], "merk")
    model_map = normaliseer([r["model"] for r in vloot], "model")
    zeg("    let op: trimniveaus worden NIET weggeknipt — daarvoor is een modellijst nodig "
        "die we niet hebben.")
    plaats_map = normaliseer_plaatsen([r["plaats"] for r in vloot])
    zeg()

    carrosserie = vul_carrosserie_aan(vloot, merk_map, model_map,
                                      carrosserie_pad, interactief)
    district_mail = laad_districten(vloot, districten_pad)

    soort_telling = Counter(INSCHRIJVING_NL[r["inschrijving"]] for r in vloot)
    zitplaats_telling = Counter(r["zitplaatsen"] for r in vloot)
    zeg("inschrijving en zitplaatsen")
    for soort, n in soort_telling.most_common():
        zeg(f"  {soort:<16} {n:>4} wagens")
    zeg("  zitplaatsen: " + ", ".join(
        f"{z}x{zitplaats_telling[z]}" for z in sorted(zitplaats_telling)))
    zeg()

    klasse_telling = Counter(r["klasse"] for r in vloot)
    zeg("klasse — de tariefklasse van Dégage; onbekend krijgt geen veld")
    for klasse in (*KLASSEN, None):
        n = klasse_telling[klasse]
        zeg(f"  {klasse or 'onbekend':<12} {n:>4} wagens ({n / len(vloot) * 100:.1f}%)")
    zeg()

    bak_telling = Counter(r["versnellingsbak"] for r in vloot)
    zeg("versnellingsbak — apart veld, geen toebehoren, altijd ingevuld")
    for bak, n in bak_telling.most_common():
        zeg(f"  {bak:<13} {n:>4} wagens ({n / len(vloot) * 100:.1f}%)")
    zeg()

    brandstof_telling = Counter(r["brandstof"] for r in vloot)
    herleid = sum(brandstof_telling[f] for f in HERLEID_NAAR_COMBUSTION)
    zeg("brandstof -> propulsion_type")
    for b in sorted(brandstof_telling, key=lambda f: (-brandstof_telling[f], f)):
        vlag = "   <-- herleid, GBFS kent deze brandstof niet" if b in HERLEID_NAAR_COMBUSTION else ""
        zeg(f"  {b:<16} {brandstof_telling[b]:>4}  ->  {BRANDSTOF_NAAR_PROPULSION[b]}{vlag}")
    zeg(f"  herleidingen naar combustion (CNG + LPG): {herleid} wagens")
    zeg()

    # --- vehicle_types ----------------------------------------------------------------
    for r in vloot:
        r["propulsion"] = BRANDSTOF_NAAR_PROPULSION[r["brandstof"]]
        r["vehicle_type_id"] = (
            f"car-{r['propulsion']}-{INSCHRIJVING_SLUG[r['inschrijving']]}-{r['zitplaatsen']}"
        )

    types: dict[str, dict] = {}
    for r in vloot:
        types.setdefault(
            r["vehicle_type_id"],
            {
                "vehicle_type_id": r["vehicle_type_id"],
                "form_factor": "car",
                "propulsion_type": r["propulsion"],
                "max_range_meters": MAX_RANGE_METERS[r["propulsion"]],
                "name": tekst(
                    f"{INSCHRIJVING_NL[r['inschrijving']]}, {PROPULSION_NL[r['propulsion']]}, "
                    f"{r['zitplaatsen']} zitplaatsen"
                ),
                "rider_capacity": r["zitplaatsen"],
            },
        )
    vehicle_types = sorted(types.values(), key=lambda t: t["vehicle_type_id"])

    zeg("max_range_meters — GEEN gemeten waarde, een conservatieve ondergrens")
    zeg("  het v3.0-schema eist dit veld bij élke propulsion_type behalve 'human', niet")
    zeg("  alleen bij elektrisch. Weglaten kan dus niet zonder de validatiepoort te breken.")
    for propulsion, meters in sorted(MAX_RANGE_METERS.items()):
        n = sum(1 for r in vloot if r["propulsion"] == propulsion)
        zeg(f"  {propulsion:<18} {nl_getal(meters):>9} m ({meters // 1000} km) "
            f"voor {n} wagens")
    zeg()

    # --- stations = uniek coördinaat ---------------------------------------------------
    per_punt: dict[tuple[float, float], list[dict]] = defaultdict(list)
    for r in vloot:
        per_punt[(round(r["lat"], COORD_DECIMALEN), round(r["lon"], COORD_DECIMALEN))].append(r)

    zeg("coördinaten vervagen (privacy — zie LOCATIE_FUZZ_M in dit script)")
    zeg(f"  elke standplaats {LOCATIE_FUZZ_M} m opzij, in een richting uit een hash van het punt zelf")
    zeg("  vast bedrag, geen toeval: het echte punt ligt altijd op die afstand, nooit eronder")
    zeg("  bestendig: dezelfde plek houdt dezelfde verschuiving, ook na een nieuwe dump")
    zeg()

    stations, statussen = [], []
    for punt, wagens in per_punt.items():
        wagens.sort(key=lambda r: r["naam"].strip())
        # Pas hier vervagen, niet eerder: het groeperen moet op het ECHTE punt gebeuren,
        # anders vallen twee wagens op dezelfde stoep uit elkaar.
        vaag_lat, vaag_lon = verschuif(punt[0], punt[1])
        sid = station_id(vaag_lat, vaag_lon)
        for r in wagens:
            r["station_id"] = sid
        naam = " + ".join(w["naam"].strip() for w in wagens)
        stations.append({
            "station_id": sid,
            "name": tekst(naam),
            "lat": vaag_lat,
            "lon": vaag_lon,
            "post_code": wagens[0]["postcode"],
            # Geen fysieke infrastructuur: de wagens staan gewoon op straat.
            "is_virtual_station": True,
        })
        per_type = Counter(w["vehicle_type_id"] for w in wagens)
        statussen.append({
            "station_id": sid,
            "num_vehicles_available": len(wagens),
            "vehicle_types_available": [
                {"vehicle_type_id": t, "count": n} for t, n in sorted(per_type.items())
            ],
            "is_installed": True,
            "is_renting": True,
            "is_returning": True,
            "last_reported": stempel,
        })

    dubbel = [s for s, n in Counter(s["station_id"] for s in stations).items() if n > 1]
    if dubbel:
        # Twee echte punten die na het vervagen op hetzelfde id uitkomen. Praktisch
        # onmogelijk, maar stil samenvoegen zou twee standplaatsen tot één maken.
        raise SystemExit(f"FOUT: station_id komt meer dan eens voor: {dubbel}. Niets weggeschreven.")
    stations.sort(key=lambda s: s["station_id"])
    statussen.sort(key=lambda s: s["station_id"])

    meervoudig = [s for s in statussen if s["num_vehicles_available"] > 1]
    zeg("stationsmodel — één station per uniek coördinaat")
    zeg(f"  stations: {len(stations)}")
    zeg(f"  stations met meer dan één wagen: {len(meervoudig)}")
    for s in meervoudig:
        naam = next(x["name"][0]["text"] for x in stations if x["station_id"] == s["station_id"])
        zeg(f"    {s['station_id']}: {s['num_vehicles_available']} wagens — {naam}")
    zeg(f"  vehicle_types: {len(vehicle_types)}")
    zeg()

    # --- eigen detailbestand ----------------------------------------------------------
    vehicles = []
    toebehoren_geteld = Counter()
    zonder_toebehoren = 0
    euronorm_afbeelding: dict[str, Counter] = defaultdict(Counter)
    euronorm_geteld = Counter()
    met_asterisk = 0
    # Wat er per auto rechtgezet of weggelaten werd, voor de beheerpagina (zie
    # stuur_correcties()). Alleen wat in de bron FOUT staat; een
    # subletter ("6b" -> "Euro 6") is geen fout maar een verfijning, en blijft eruit.
    correcties: list[dict] = []
    for r in sorted(vloot, key=lambda r: (r["station_id"], r["naam"].strip())):
        # Alleen wat er is, in een vaste volgorde. Zie TOEBEHOREN_SLEUTELS.
        toebehoren = {s: True for s in TOEBEHOREN_SLEUTELS if s in r["toebehoren"]}
        for sleutel in toebehoren:
            toebehoren_geteld[sleutel] += 1
        if not toebehoren:
            zonder_toebehoren += 1

        norm = euronorm(r["euronorm"])
        ruw = "(leeg)" if r["euronorm"] is None else str(r["euronorm"])
        euronorm_afbeelding[norm or "(onbekend)"][ruw] += 1
        euronorm_geteld[norm or "(onbekend)"] += 1
        if "*" in ruw:
            met_asterisk += 1
        naam = r["naam"].strip()
        for veld, kaart in (("merk", merk_map), ("model", model_map)):
            bron = " ".join(r[veld].split())
            if bron != kaart[r[veld]]:
                correcties.append({"naam": naam, "veld": veld, "soort": "schrijfwijze",
                                   "bron": bron, "feed": kaart[r[veld]]})
        bron = " ".join(r["plaats"].split())
        if bron != plaats_map[r["plaats"]]:
            correcties.append({"naam": naam, "veld": "plaats", "soort": "hoofdletters",
                               "bron": bron, "feed": plaats_map[r["plaats"]]})
        if r["euronorm"] is not None and str(r["euronorm"]).strip():
            if not norm:
                correcties.append({"naam": naam, "veld": "euronorm", "soort": "onbruikbaar",
                                   "bron": ruw.strip()})
            elif "*" in ruw:
                correcties.append({"naam": naam, "veld": "euronorm", "soort": "asterisk",
                                   "bron": ruw.strip(), "feed": norm})

        wagen = {
            "station_id": r["station_id"],
            "vehicle_type_id": r["vehicle_type_id"],
            "naam": r["naam"].strip(),
            "merk": merk_map[r["merk"]],
            "model": model_map[r["model"]],
            # Het soort voertuig komt uit de handmatige lijst, niet uit de gegevens.
            "carrosserie": carrosserie[r["carrosserie_sleutel"]],
            # De inschrijving (de fiscale categorie, zie INSCHRIJVING_NL) staat bewust
            # niet in het detailbestand: ze leest als een vorm terwijl ze een
            # belastingregime is, en niets in de kaart doet er iets mee. Ze zit nog wel in
            # vehicle_type_id.
            "brandstof": r["brandstof"],
            "zitplaatsen": r["zitplaatsen"],
            "bouwjaar": r["bouwjaar"],
            "versnellingsbak": r["versnellingsbak"],
        }
        # Een onbekende klasse krijgt geen veld, net als een onbekende euronorm.
        if r["klasse"]:
            wagen["klasse"] = r["klasse"]
        # Alleen wegschrijven als we de norm kennen — zelfde regel als bij de
        # toebehoren. Een ontbrekend veld zegt "onbekend", niet "geen norm".
        if norm:
            wagen["euronorm"] = norm
        wagen["toebehoren"] = toebehoren
        # Hoofdletters rechtgezet ('GENTBRUGGE' -> 'Gentbrugge'); zie plaatsnaam().
        wagen["plaats"] = plaats_map[r["plaats"]]
        wagen["postcode"] = r["postcode"]
        if r["district"]:
            wagen["district"] = r["district"].strip()
            # Alleen als iemand het adres met de hand heeft ingevuld.
            if r["district"] in district_mail:
                wagen["contact"] = district_mail[r["district"]]
        vehicles.append(wagen)

    zeg("toebehoren — alleen wat er is komt in het bestand")
    for sleutel in TOEBEHOREN_SLEUTELS:
        n = toebehoren_geteld[sleutel]
        zeg(f"  {sleutel:<16} aanwezig bij {n:>3} van {len(vloot)} wagens "
            f"({n / len(vloot) * 100:.1f}%)")
    zeg(f"  wagens zonder énig toebehoren: {zonder_toebehoren} van {len(vloot)} "
        f"({zonder_toebehoren / len(vloot) * 100:.1f}%) — leeg object, geen rij vol 'false'.")
    zeg()

    zeg("euronorm — vrije tekst, herleid tot één generatie")
    bekend = sum(n for k, n in euronorm_geteld.items() if k != "(onbekend)")
    for norm in sorted(euronorm_afbeelding, key=lambda k: (k == "(onbekend)", k)):
        varianten = euronorm_afbeelding[norm]
        n = euronorm_geteld[norm]
        bron = ", ".join(f"{v!r}x{varianten[v]}" for v in sorted(varianten))
        zeg(f"  {norm:<12} {n:>4} wagens   <-  {bron}")
    zeg(f"  bekend: {bekend} van {len(vloot)} wagens ({bekend / len(vloot) * 100:.1f}%); "
        f"onbekend: {euronorm_geteld['(onbekend)']} — die krijgen géén veld in het bestand.")
    zeg(f"  waarden met een asterisk: {met_asterisk} — de asterisk wordt genegeerd.")
    zeg("  Dubbelzinnige invoer ('5 of 6') valt bewust op onbekend: raden is geen norm.")
    zeg()

    # --- envelopes --------------------------------------------------------------------
    def envelop(data: dict, versie: str = GBFS_VERSIE) -> dict:
        return {"last_updated": stempel, "ttl": TTL, "version": versie, "data": data}

    basis = basis_url.rstrip("/")
    gbfs = envelop({"feeds": [
        {"name": naam, "url": f"{basis}/{naam}.json"}
        for naam in ("gbfs", "system_information", "vehicle_types",
                     "station_information", "station_status")
    ]})

    system = {
        "system_id": SYSTEM_ID,
        "languages": [TAAL],
        "name": tekst(NAAM),
        "opening_hours": "24/7",
        "timezone": "Europe/Brussels",
        "feed_contact_email": FEED_CONTACT_EMAIL,
        "operator": tekst(OPERATOR),
        "url": SITE_URL,
    }
    if PURCHASE_URL:
        system["purchase_url"] = PURCHASE_URL
    if LICENSE_URL:
        system["license_url"] = LICENSE_URL

    eigen = {
        "last_updated": stempel,
        "ttl": TTL,
        "version": EIGEN_VERSIE,
        # De kaart leest dit en zet het in de popup. Eén bron, zodat de belofte aan de
        # bezoeker en de werkelijke verschuiving niet uit elkaar kunnen lopen.
        "locatie_nauwkeurigheid_m": LOCATIE_FUZZ_M,
        "toelichting": tekst(
            "Eigen detailbestand van Dégage, geen GBFS. Aggregatoren mogen dit negeren. "
            "Let op bij het lezen van de feed: Dégage kent geen live beschikbaarheid — "
            "num_vehicles_available in station_status.json is het aantal wagens dat op die "
            "standplaats staat, niet het aantal dat nu vrij is. De feed wordt manueel "
            "ververst, per kwartaal. De coördinaten in station_information.json zijn "
            "bewust vervaagd: elke standplaats staat een vaste afstand opzij "
            "(locatie_nauwkeurigheid_m), zodat het coördinaat geen voordeur aanwijst."
        ),
        "data": {"vehicles": vehicles},
    }

    correcties.sort(key=lambda c: (c["naam"], c["veld"]))
    zeg(f"datacorrecties — {len(correcties)} rechtzettingen per auto, voor de beheerpagina")
    for soort, n in sorted(Counter(c["soort"] for c in correcties).items()):
        zeg(f"  {soort:<14} {n:>4}")
    zeg()
    if correcties_uit is not None:
        correcties_uit.extend(correcties)

    return {
        "gbfs": gbfs,
        "system_information": envelop(system),
        "station_information": envelop({"stations": stations}),
        "station_status": envelop({"stations": statussen}),
        "vehicle_types": envelop({"vehicle_types": vehicle_types}),
        "degage_vehicles": eigen,
    }


# ============================================================================
# de basis-URL
# ============================================================================
SCHEMA_VAN = {
    "gbfs": "v3.0/gbfs.json",
    "system_information": "v3.0/system_information.json",
    "station_information": "v3.0/station_information.json",
    "station_status": "v3.0/station_status.json",
    "vehicle_types": "v3.0/vehicle_types.json",
    "degage_vehicles": "degage_vehicles.json",  # eigen schema, geen MobilityData-schema
}

# ============================================================================
# DATACORRECTIES NAAR DE WORKER
# ============================================================================
# Wat bouw() in de bron rechtzette (een merk in een andere schrijfwijze, een gemeente in
# hoofdletters, een onbruikbare euronorm), gaat naar de D1-databank van de Worker, waar
# de beheerders het op /beheer/datafouten zien. Niet in de feed: het is geen gegeven over
# de auto's maar een werklijst om de bron te verbeteren.
#
# De Worker neemt het aan op POST /api/datacorrecties, met een token: hetzelfde als het
# geheim CORRECTIES_TOKEN van de Worker (feedback-worker/README.md, stap 7). Het token
# staat in de interne repo, naast deze, in TOKEN_BESTAND — niet hier, want deze repo is
# publiek. Het is bewust een eenvoudig token: wie het kent, kan alleen deze werklijst
# overschrijven, en dat risico is aanvaard (README.md van de interne repo). Zonder
# bestand wordt er niets gestuurd en zegt het script dat; de feed is daar niet minder om.
WORKER_URL = "https://degage-kaart-feedback.degage.workers.dev"
# De interne repo staat naast deze (REPO.parent; REPO wordt pas verderop gezet).
TOKEN_BESTAND = (Path(__file__).resolve().parent.parent.parent
                 / "degage-deelautokaart-gbfs-private" / "correcties-token.txt")


def _post_json(url: str, gegevens: dict, kop: dict | None = None, timeout: int = 30) -> dict:
    vraag = urllib.request.Request(
        url, data=json.dumps(gegevens, ensure_ascii=False).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json; charset=utf-8",
                 "Accept": "application/json", **(kop or {})})
    with urllib.request.urlopen(vraag, timeout=timeout) as antwoord:
        return json.loads(antwoord.read().decode("utf-8") or "{}")


def stuur_correcties(correcties: list[dict], stempel: str) -> bool:
    """Stuur de correcties naar de Worker. True als het lukte; mislukken is geen fout."""
    zeg("datacorrecties naar de beheerpagina")
    try:
        token = TOKEN_BESTAND.read_text(encoding="utf-8").strip()
    except OSError:
        token = ""
    if not token:
        zeg(f"  NIET gestuurd: geen token in {TOKEN_BESTAND}. De feed is in orde; alleen")
        zeg("  /beheer/datafouten mist de rechtzettingen van deze run.")
        zeg("  Zie feedback-worker/README.md, stap 7.")
        return False
    try:
        uit = _post_json(WORKER_URL + "/api/datacorrecties",
                         {"feed": stempel, "correcties": correcties},
                         {"Authorization": "Bearer " + token})
        zeg(f"  {uit.get('bewaard', len(correcties))} rechtzettingen bewaard op {WORKER_URL}")
        return True
    except urllib.error.HTTPError as e:
        try:
            reden = json.loads(e.read().decode("utf-8", "replace")).get("fout", "")
        except ValueError:
            reden = ""
        zeg(f"  NIET gestuurd: de Worker gaf {e.code}" + (f" — {reden}" if reden else ""))
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        zeg(f"  NIET gestuurd: {WORKER_URL} niet bereikbaar ({e})")
    zeg("  De feed is in orde. Draai de feedstap later opnieuw om de lijst bij te werken.")
    return False
    lichaam = json.dumps({"feed": stempel, "correcties": correcties},
                         ensure_ascii=False).encode("utf-8")
    vraag = urllib.request.Request(
        WORKER_URL + "/api/datacorrecties", data=lichaam, method="POST",
        headers={"Content-Type": "application/json; charset=utf-8",
                 "Authorization": "Bearer " + sleutel})
    try:
        with urllib.request.urlopen(vraag, timeout=30) as antwoord:
            uit = json.loads(antwoord.read().decode("utf-8") or "{}")
        zeg(f"  {uit.get('bewaard', len(correcties))} rechtzettingen bewaard op {WORKER_URL}")
        return True
    except urllib.error.HTTPError as e:
        reden = e.read().decode("utf-8", "replace")[:300]
        zeg(f"  NIET gestuurd: de Worker gaf {e.code} — {reden}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        zeg(f"  NIET gestuurd: {WORKER_URL} niet bereikbaar ({e})")
    zeg("  De feed is in orde. Draai de feedstap later opnieuw om de lijst bij te werken.")
    return False

# Elke instelling die dit script zelf kan vinden, hoort het zelf te vinden — en bij elke
# waarde print het waar ze vandaan komt. Wat niet te vinden is, wordt niet geraden.
REPO = Path(__file__).resolve().parent.parent


def _git_remote(repo: Path) -> str | None:
    """Het adres van `origin`, of None als dit geen git-repo is of git ontbreekt."""
    try:
        klaar = subprocess.run(
            ["git", "-C", str(repo), "remote", "get-url", "origin"],
            capture_output=True, text=True, timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return klaar.stdout.strip() if klaar.returncode == 0 else None


def _pages_url(remote: str) -> str | None:
    """`git@github.com:eigenaar/repo.git` of de https-vorm -> het GitHub Pages-adres.

    Alleen GitHub: daar is de vertaling van repo naar publiek adres vastgelegd. Voor een
    andere host valt er niets te weten en geven we None terug in plaats van te gokken.
    """
    m = re.match(r"^(?:git@github\.com:|https://github\.com/)([^/]+)/(.+?)(?:\.git)?/?$",
                 remote.strip())
    if not m:
        return None
    eigenaar, repo = m.group(1), m.group(2)
    # De repo `eigenaar.github.io` is de gebruikerssite en staat op de wortel van het
    # domein; elke andere repo hangt eronder in een map met zijn eigen naam.
    if repo.lower() == f"{eigenaar.lower()}.github.io":
        return f"https://{repo.lower()}"
    return f"https://{eigenaar.lower()}.github.io/{repo}"


def zoek_basis_url(repo: Path, expliciet: str | None) -> tuple[str, str]:
    """De publieke basis-URL van de feed, met waar hij vandaan komt.

    Dit is de enige waarde die de feed over zichzelf beweert en die niet uit de data
    komt: `gbfs.json` adverteert hem, en auto-discovery bij partners volgt die adressen
    en niet het adres waar ze het bestand vandaan haalden. Staat hij verkeerd, dan leest
    een aggregator vijf adressen in die niet bestaan.
    """
    if expliciet:
        return expliciet.rstrip("/"), "meegegeven met --basis-url"

    # Een CNAME-bestand betekent dat GitHub Pages op een eigen domein staat; dat wint,
    # want dan is het github.io-adres niet waar de feed woont.
    cname = repo / "CNAME"
    if cname.is_file():
        domein = cname.read_text(encoding="utf-8").strip().splitlines()
        if domein and domein[0].strip():
            return f"https://{domein[0].strip()}/gbfs", "uit CNAME (eigen domein)"

    remote = _git_remote(repo)
    if remote:
        pages = _pages_url(remote)
        if pages:
            return f"{pages}/gbfs", f"afgeleid uit de git-remote ({remote})"

    return (BASIS_URL_STANDAARD,
            "standaardadres van de publieke repo op GitHub Pages")


def herkomst(label: str, waarde: str, bron: str) -> None:
    """Eén regel met de waarde, eronder ingesprongen waar ze vandaan komt.

    Twee regels in plaats van één, want de paden zijn lang en de herkomst is het
    belangrijkste deel: wie deze uitvoer later terugleest, wil zien waaróp een feed
    gebouwd is en niet alleen wat eruit kwam.
    """
    zeg(f"  {label:<14} {waarde}")
    zeg(f"  {'':<14} <- {bron}")


# ============================================================================
# genereren
# ============================================================================
def genereer(vloot: list[dict], datum: date, *, uit: Path | None = None,
             basis_url: str | None = None, interactief: bool = False,
             extra_verboden: list[str] | None = None) -> dict[str, dict] | None:
    """Bouw, controleer en schrijf de feed. Geeft de payloads terug, of None bij een fout.

    Dit is de ingang voor de oproeper die de wagens zelf inleest. Hij print vooraf zelf
    waar de wagens en de datum vandaan komen; dit print de rest.
    """
    controleer_invoer(vloot)

    uit = (uit or REPO / "gbfs").resolve()
    # De schema's zijn INVOER, geen uitvoer: ze staan vast in de repo, los van --uit.
    schema_map = REPO / "gbfs" / "schema"
    stempel = tijdstempel(datum)
    basis, url_bron = zoek_basis_url(REPO, basis_url)

    herkomst("datum", f"{datum.isoformat()}   ->   last_updated {stempel}", "van de oproeper")
    herkomst("basis-URL", basis, url_bron)
    herkomst("outputmap", str(uit), "standaard" if uit == (REPO / "gbfs").resolve()
             else "meegegeven")
    zeg(f"  {'vragen':<14} {'ja' if interactief else 'nee'}")
    zeg()

    correcties: list[dict] = []
    payloads = bouw(vloot, stempel, basis, REPO / "scripts" / CARROSSERIE_BESTAND,
                    REPO / "scripts" / DISTRICTEN_BESTAND, interactief, correcties)

    # ---- poort 1: validatie tegen de officiële schema's -------------------------------
    zeg("validatie tegen de JSON Schemas (poort — er wordt niets geschreven als dit faalt)")
    fc = _formatchecker()
    fouten: list[str] = []
    for naam, payload in payloads.items():
        f = valideer(naam, payload, schema_map / SCHEMA_VAN[naam], fc)
        fouten += f
        bron = "MobilityData v3.0" if SCHEMA_VAN[naam].startswith("v3.0/") else "eigen schema"
        zeg(f"  {naam + '.json':<28} {'OK' if not f else f'{len(f)} FOUT(EN)':<12} ({bron})")
    if fouten:
        zeg()
        zeg("VALIDATIE GEFAALD — geen enkel bestand weggeschreven:")
        for f in fouten:
            zeg(f"  {f}")
        return None
    zeg()

    # ---- poort 2: privacy -------------------------------------------------------------
    zeg("privacyscan (e-mail, telefoon, UUID, lange cijferreeksen"
        + (f", {len(extra_verboden)} verboden termen" if extra_verboden else "") + ")")
    gerenderd = {naam: render(p) for naam, p in payloads.items()}
    # Alleen de groepsadressen die daadwerkelijk in het detailbestand staan.
    toegelaten_mail = {w["contact"] for w in payloads["degage_vehicles"]["data"]["vehicles"]
                       if "contact" in w}
    lekken: list[str] = []
    for naam, ruw in gerenderd.items():
        lek = controleer_privacy(naam, ruw, toegelaten_mail, extra_verboden)
        lekken += lek
        zeg(f"  {naam + '.json':<28} {'schoon' if not lek else f'{len(lek)} LEK(KEN)'}")
    if lekken:
        zeg()
        zeg("PRIVACYPOORT GEFAALD — geen enkel bestand weggeschreven:")
        for lek in lekken:
            zeg(f"  {lek}")
        return None
    zeg(f"  (toegelaten '@': {FEED_CONTACT_EMAIL} en de groepsadressen uit {DISTRICTEN_BESTAND})")
    zeg()

    # ---- schrijven --------------------------------------------------------------------
    uit.mkdir(parents=True, exist_ok=True)
    zeg("wegschrijven")
    for naam, ruw in gerenderd.items():
        pad = uit / f"{naam}.json"
        pad.write_text(ruw, encoding="utf-8", newline="\n")
        zeg(f"  {pad}  ({len(ruw.encode('utf-8')):,} bytes)".replace(",", "."))
    zeg()
    zeg("samenvatting")
    zeg(f"  {len(payloads['station_information']['data']['stations'])} stations · "
        f"{len(payloads['vehicle_types']['data']['vehicle_types'])} vehicle_types · "
        f"{len(payloads['degage_vehicles']['data']['vehicles'])} wagens in het detailbestand")
    zeg()
    # Alleen bij de echte feed: een proefrun naar een andere map mag de werklijst van de
    # beheerders niet overschrijven.
    if uit == (REPO / "gbfs").resolve():
        stuur_correcties(correcties, stempel)
    else:
        zeg("datacorrecties niet gestuurd: dit is een proefrun naar een andere map.")
    zeg()
    zeg("  klaar. Publiceren gebeurt NIET door dit script — dat is een aparte, expliciete stap.")
    return payloads


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Bouw de GBFS v3.0-feed van Dégage uit een lijst wagens in JSON.",
        epilog="De echte feed wordt gebouwd vanuit de interne repo, die de wagens uit de "
               "databank leest. Dit is de ingang voor een proefrun op eigen gegevens, "
               "zoals scripts/voorbeeld_vloot.json.",
    )
    ap.add_argument("--invoer", type=Path, required=True, metavar="JSON",
                    help="JSON-bestand met {\"datum\": \"JJJJ-MM-DD\", \"wagens\": [...]}.")
    ap.add_argument("--uit", type=Path, required=True, metavar="MAP",
                    help="outputmap. Verplicht, zodat een proefrun de echte feed nooit "
                         "overschrijft.")
    ap.add_argument("--datum", default=None, metavar="JJJJ-MM-DD",
                    help="datum van de gegevens; voedt last_updated. Standaard `datum` "
                         "uit het invoerbestand.")
    ap.add_argument("--basis-url", default=None, metavar="URL",
                    help="publieke basis-URL van de feed. Standaard afgeleid uit CNAME "
                         "of de git-remote.")
    ap.add_argument("--no-interactive", action="store_true",
                    help="vraag niets; faal luid bij een model dat niet in carrosserie.json "
                         "staat. Gebeurt vanzelf zonder terminal.")
    args = ap.parse_args()

    zeg("=" * 100)
    zeg("Dégage — GBFS v3.0 feedbouwer")
    zeg("=" * 100)
    zeg()

    invoer = json.loads(args.invoer.read_text(encoding="utf-8"))
    ruwe_datum = args.datum or invoer.get("datum")
    if not ruwe_datum:
        zeg("FOUT: geen datum. Zet `datum` in het invoerbestand of geef --datum mee.")
        return 2
    try:
        datum = date.fromisoformat(ruwe_datum)
    except ValueError:
        zeg(f"FOUT: {ruwe_datum!r} is geen datum in JJJJ-MM-DD.")
        return 2

    zeg("waar deze run op gebouwd is")
    herkomst("invoer", str(args.invoer.resolve()), f"{len(invoer.get('wagens', []))} wagens")
    payloads = genereer(
        invoer.get("wagens", []), datum, uit=args.uit, basis_url=args.basis_url,
        interactief=sys.stdin.isatty() and not args.no_interactive,
    )
    return 0 if payloads is not None else 1


if __name__ == "__main__":
    sys.exit(main())
