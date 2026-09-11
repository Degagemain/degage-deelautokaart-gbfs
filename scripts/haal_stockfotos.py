#!/usr/bin/env python3
"""Haal één vrij gelicentieerde stockfoto per merk+model op naar `web/fotos/`.

Waarom dit een APART script is en niet in `genereer_gbfs.py` zit
----------------------------------------------------------------
De generator heeft een hard contract: zelfde dump in -> byte-voor-byte dezelfde
bestanden uit, en hij draait zonder netwerk. Zoekopdrachten naar buiten breken dat
allebei — vandaag levert een zoekopdracht een andere foto op dan volgende maand. Dit
script staat er dus naast: het raakt de GBFS-feed niet aan en schrijft alleen in
`web/fotos/`.

Waarom Wikimedia Commons en niet "een foto van het internet"
------------------------------------------------------------
Een persfoto van een autofabrikant is auteursrechtelijk beschermd; die op degage.be
publiceren mag niet. Commons levert werk onder een vrije licentie, mét de auteur en de
licentie erbij in de metadata. Dit script:

· neemt ALLEEN bestanden met een licentie die publicatie toelaat (CC of publiek domein)
  en slaat alles wat daar niet onder valt over;
· bewaart per foto de auteur, de licentie en de bronpagina in `fotos.json`;
· de kaart TOONT die naamsvermelding bij de foto. Dat is geen beleefdheid maar de
  voorwaarde van de licentie — net als de OSM-attributie op de kaart zelf.

Wanneer de vloot de wagen anders noemt dan Commons
--------------------------------------------------
De dump noemt een wagen zoals de leden hem kennen; Commons kent hem onder de naam die
de fabrikant gebruikt. Meestal is dat hetzelfde, soms niet: de A-150 van 2007 heet op
Commons nergens zo — daar is het een Mercedes-Benz W169. Zoeken op "Mercedes A-150"
levert dan een vooroorlogse Grosser Mercedes op, en die wordt (terecht) afgekeurd.
Daar bestaat geen regel voor, want het is geen patroon maar kennis van auto's. Zet zo'n
geval met de hand in "zoek_als" in fotos.json:

    "zoek_als": { "Mercedes|A-150": "Mercedes-Benz|W169" }

Links de sleutel zoals de vloot hem kent, rechts waarop gezocht moet worden. De foto
komt onder de LINKERsleutel in het manifest, want daar vraagt de kaart hem mee op.

Snel bij een tweede run
-----------------------
Alles wat al opgehaald is, staat in `web/fotos/fotos.json`. Bij een volgende run wordt
elke sleutel die daar al in staat overgeslagen ZONDER netwerkverkeer — ook de sleutels
waarvoor niets gevonden werd, want anders zoekt het script elke keer opnieuw naar iets
wat er niet is. Een tweede run over een ongewijzigde vloot doet dus nul verzoeken en is
in een oogwenk klaar. Met `--opnieuw` gooi je die geheugensteun weg.

Draaien
-------
    py scripts/haal_stockfotos.py
    py scripts/haal_stockfotos.py --opnieuw          alles opnieuw ophalen
    py scripts/haal_stockfotos.py --max 20           eerst een handvol proberen
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

API = "https://commons.wikimedia.org/w/api.php"
# Wikimedia vraagt een herkenbare User-Agent met een contactadres. Een script dat zich
# voordoet als een browser wordt (terecht) geblokkeerd.
UA = "DegageDeelautokaart/1.0 (https://www.degage.be/; info@degage.be)"

# 480 px is ruim genoeg voor een popup van ~260 px, ook op een scherm met dubbele
# pixeldichtheid. De volledige bestanden zijn vaak enkele megabytes; die willen we niet.
THUMB_BREEDTE = 480

# Beleefd blijven tegen een gratis API: een korte pauze tussen de zoekopdrachten.
PAUZE_S = 0.25

# Hoog dit op zodra je ONGESCHIKT of `titel_ok` aanpast. Het manifest onthoudt met welke
# versie het gevuld is; wijkt die af, dan worden de eerdere missers opnieuw geprobeerd.
REGELS_VERSIE = 8

# Breedte gedeeld door hoogte. Alles daaronder valt af. Gemeten over de 230 foto's van
# de vorige ronde: 224 zitten op 1,3 of ruimer (de gewone 4:3 en 3:2 van een autofoto),
# en de zes eronder waren twee dashboardfoto's, twee rallywagens en één twijfelgeval.
# 1,15 laat dus alles door wat liggend is en houdt staand en vierkant tegen.
MIN_VERHOUDING = 1.15

# ============================================================================
# KEURING VAN EEN TREFFER — twee zeven, allebei op de bestandsnaam
# ============================================================================
# Zeef 1: woorden die verraden dat het niet de wagen is zoals een lid hem aantreft.
# Elke groep is een echt geval uit de eerste run over de vloot, niet een bedacht risico.
ONGESCHIKT = (
    # geen foto van de hele wagen
    "logo", "emblem", "badge", "interior", "dashboard", "engine", "wheel", "seat",
    "gearbox", "blueprint", "drawing", "diagram",
    # de sleutel in plaats van de wagen — 'Times Car Key Nissan NOTE E13.jpg' stond er echt
    "key", "keys", "keyfob", "fob", "sleutel", "schlussel", "ignition",
    # binnenkant: wie de wagen zoekt, wil hem van buiten zien
    "interieur", "innenraum", "cockpit", "cabin", "dash", "instrument", "steering",
    "console", "upholstery", "gauge", "speedometer", "odometer", "infotainment",
    "airbag", "pedal", "glovebox", "armrest", "headrest", "trunk",
    # losse onderdelen in close-up
    "headlight", "taillight", "grille", "bumper", "exhaust", "hubcap", "rim",
    "tyre", "tire", "mirror", "handle",
    # helemaal geen echte wagen: een afbeelding VAN een afbeelding. Een vel postzegels
    # uit Wit-Rusland met een bestelwagen erop kwam zo binnen als 'Peugeot Partner'.
    "toy", "miniature", "lego", "diecast", "scale model", "kit car", "cutaway",
    "stamp", "postage", "philately", "postmark", "banknote", "coin", "poster",
    "advertisement", "brochure", "magazine", "book", "map", "artwork", "painting",
    # racerij en rally: een i20 WRC lijkt in niets op de i20 op de standplaats
    "racing", "race", "racer", "rally", "rallye", "motorsport", "wrc", "dtm", "nascar",
    "circuit", "nurburgring", "nürburgring", "gt3", "gt4", "trophy", "rallycross",
    # opgevoerd, verlaagd, omgebouwd
    "tuning", "tuned", "modified", "custom", "stance", "widebody", "lowered",
    "airbrush", "wrapped", "camper conversion",
    # dienstvoertuigen: een politie-Touran draagt striping die niets met de vloot te maken heeft
    "police", "politie", "polizei", "policia", "polizia", "gendarmerie", "carabinieri",
    "mossos", "esquadra", "ambulance", "fire brigade", "brandweer", "taxi", "hearse",
    "military",
    # kapot, gesloopt, verlaten
    "wreck", "wrecked", "crash", "crashed", "damaged", "burnt", "burned", "abandoned",
    "scrap", "junk", "rust", "accident",
)


def zeg(regel: str = "") -> None:
    print(regel, flush=True)


# De auteursnamen komen van over de hele wereld: 'Petar Milošević', 'Jarosław Kwiatek'.
# Een Windows-console staat standaard op cp1252 en laat het script dán klappen op een
# naam die het niet kan tekenen — na een reeks geslaagde downloads, wat extra zuur is.
# We zetten de uitvoer daarom expliciet op UTF-8 en vervangen wat de console niet aankan.
# Dit raakt alleen wat je op het scherm ziet; in `fotos.json` staat de naam voluit.
for _stroom in (sys.stdout, sys.stderr):
    try:
        _stroom.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass


def haal_json(params: dict) -> dict:
    url = API + "?" + urllib.parse.urlencode(params)
    verzoek = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(verzoek, timeout=30) as antwoord:
        return json.load(antwoord)


def ontdoe_van_html(s: str) -> str:
    """De auteur komt als HTML uit de API ('<a href=...>Naam</a>')."""
    s = re.sub(r"<[^>]+>", "", s or "")
    return " ".join(s.split())


def kaal(s: str) -> str:
    """Kleine letters, zonder accenten, alleen letters en cijfers — om op te vergelijken.

    Letters en cijfers worden uit elkaar gehaald: 'Rally1' wordt 'rally 1'. Zonder dat
    glipt een rallywagen erdoor, want de zeef zoekt hele woorden en 'rally1' is er één.
    Dat gebeurde echt: '2024 Toyota GR Yaris Rally1' stond als foto van een Yaris.

    De splitsing gebeurt aan BEIDE kanten van elke vergelijking — zoekterm én
    bestandsnaam gaan door deze functie — dus modelnamen als 'i20' of 'C3' blijven
    gewoon matchen; ze worden allebei 'i 20' en 'c 3'.
    """
    zonder = "".join(c for c in unicodedata.normalize("NFKD", s or "")
                     if not unicodedata.combining(c))
    kleine = re.sub(r"[^a-z0-9]+", " ", zonder.lower())
    gesplitst = re.sub(r"(?<=[a-z])(?=[0-9])|(?<=[0-9])(?=[a-z])", " ", kleine)
    return " " + gesplitst.strip() + " "


def titel_ok(titel: str, merk: str, model: str,
             gezocht_model: str | None = None,
             categorieen: list[str] | None = None,
             verhouding: float | None = None,
             geweigerd: set[str] | None = None) -> tuple[bool, str]:
    """Keur een treffer. Geeft (goed, reden-als-afgekeurd) terug.

    De categorieën van Commons doen het zware werk, want een bestandsnaam liegt niet
    maar zwijgt wel. 'Skoda Octavia vRS (7963914636).jpg' klinkt als een keurige
    Octavia en is in werkelijkheid een close-up van het embleem — te zien aan
    'Category:Škoda Auto logos'. Ze komen mee in dezelfde API-oproep, dus dit kost geen
    extra verzoek.

    Categorieën mogen alleen AFKEUREN, nooit goedkeuren: de eis dat de modelnaam in de
    bestandsnaam staat blijft op de bestandsnaam alleen. Anders zou een postzegel in
    'Category:Peugeot Partner' alsnog voor een Partner doorgaan.

    Zeef 1 — ONGESCHIKT, met één belangrijke uitzondering. Een verbodswoord dat ZELF in
    het merk of model zit, telt niet mee. Zonder die regel sloopt 'seat' (bedoeld voor
    interieurfoto's) het volledige merk SEAT: Ibiza, Leon en Mii vielen daardoor in de
    eerste run allemaal uit. Hetzelfde zou gelden voor een 'Race'- of 'Custom'-uitvoering.

    Zeef 2 — de gezochte modelnaam MOET voluit in de bestandsnaam staan. De zoekmachine
    van Commons geeft altijd íets terug, ook als er niets past: 'Seat alhambra' leverde
    'Plaza de la Constitución 13-14.jpg' op, een foto van een plein.

    `gezocht_model` is het deel van de modelnaam waarop op dít moment gezocht wordt, want
    er wordt van specifiek naar algemeen gezocht. Dat onderscheid is wezenlijk: zonder
    het meegeven zou bij een zoektocht naar 'C3 Picasso' een gewone 'C3' al goedgekeurd
    worden, en dan wint de eerste de beste C3 het van de Picasso die verderop in de
    resultaten staat. Pas als 'C3 Picasso' niets oplevert, zakt de zoektocht naar 'C3'.
    Ontbreekt het argument (bij het herkeuren van oudere regels), dan volstaat elk
    beginstuk — anders zouden we foto's weggooien die destijds terecht zijn gekozen.
    """
    # Zeef 0: met de hand afgekeurd. Sommige foto's zijn technisch in orde maar gewoon
    # lelijk — een rommelig beursplaatje met drie andere auto's erop. Daar bestaat geen
    # regel voor, dus die beslissing hoort bij een mens. Zet de bestandsnaam in
    # "geweigerd" in fotos.json en de volgende run kiest de eerstvolgende kandidaat.
    if geweigerd and titel in geweigerd:
        return False, "met de hand geweigerd"

    # Zeef 3: de vorm van het beeld. Een auto is breder dan hoog, dus een foto van een
    # hele auto is liggend. Staand of bijna vierkant betekent bijna altijd iets anders:
    # een interieur, een detail, een close-up. Dat is de enige zeef die WERKT als de
    # bestandsnaam en de categorieën niets verraden — en dat gebeurt: '2007 Skoda Octavia
    # VRS' met enkel 'Category:Škoda Octavia II RS' bleek een foto van het dashboard.
    if verhouding is not None and verhouding < MIN_VERHOUDING:
        return False, f"staand of vierkant beeld ({verhouding:.2f}), wellicht een interieur"

    t = kaal(titel)
    # Bestandsnaam én categorieën samen doorzoeken op verbodswoorden.
    doorzoek = kaal(titel + " " + " ".join(categorieen or []))
    zoekterm = kaal(merk + " " + model)

    for woord in ONGESCHIKT:
        w = kaal(woord).strip()
        if not w or w in zoekterm:      # het woord hoort bij deze wagen zelf
            continue
        # Ook het meervoud: categorieën heten 'Škoda Auto logos', niet 'logo'.
        if " " + w + " " in doorzoek or " " + w + "s " in doorzoek:
            waar = "bestandsnaam" if (" " + w + " " in t or " " + w + "s " in t) else "categorie"
            return False, f"{waar} bevat {woord!r}"

    if gezocht_model is not None:
        woorden = kaal(gezocht_model).split()
        if woorden and all(" " + deel + " " in t for deel in woorden):
            return True, ""
        return False, f"{gezocht_model!r} staat niet in de bestandsnaam"

    woorden = kaal(model).split()
    for n in range(len(woorden), 0, -1):
        if all(" " + deel + " " in t for deel in woorden[:n]):
            return True, ""
    return False, "modelnaam staat niet in de bestandsnaam"


def slug(*delen: str) -> str:
    tekst = " ".join(delen)
    zonder = "".join(c for c in unicodedata.normalize("NFKD", tekst)
                     if not unicodedata.combining(c))
    return re.sub(r"[^A-Za-z0-9]+", "-", zonder).strip("-").lower() or "wagen"


def licentie_ok(kort: str) -> bool:
    """Alleen licenties die publicatie mét naamsvermelding toelaten."""
    k = (kort or "").strip().lower()
    if not k:
        return False
    if "fair use" in k or "non-free" in k or "nonfree" in k:
        return False
    return k.startswith("cc") or k.startswith("pd") or "public domain" in k


def vlootindex(wagens: list[dict]) -> dict[tuple[str, str], tuple[str, str]]:
    """De merk+model-combinaties die de vloot zélf kent, op vergelijkvorm.

    Wordt gebruikt door `normaliseer()` hieronder. Gesorteerd doorlopen zodat bij twee
    schrijfwijzen van dezelfde combinatie altijd dezelfde als canoniek uit de bus komt,
    ongeacht in welke volgorde de dump de wagens zet.
    """
    index: dict[tuple[str, str], tuple[str, str]] = {}
    for merk, model in sorted({(w["merk"], w["model"]) for w in wagens}):
        index.setdefault((kaal(merk), kaal(model)), (merk, model))
    return index


def normaliseer(merk: str, model: str,
                index: dict[tuple[str, str], tuple[str, str]]) -> tuple[str, str]:
    """Haal een modelnaam terug uit het merkveld wanneer die daarin beland is.

    Bij een handvol wagens staat het model in het MERK en het trimniveau in het model:
    merk 'Fiat Panda', model '1.2 Easy'. Drie andere Panda's in dezelfde vloot staan wél
    als merk 'Fiat', model 'Panda'. Zonder correctie is de sleutel 'Fiat Panda|1.2 Easy'
    een andere dan 'Fiat|Panda' en krijgt die ene wagen nooit de foto die er al ligt —
    en zoeken op Commons naar 'Fiat Panda 1.2' levert niets, want `zoekvarianten()` valt
    bewust nooit terug op enkel het merk.

    De correctie raadt niets. Ze knipt het merkveld op de spaties en houdt een splitsing
    alleen als de VLOOT ZELF die combinatie elders kent. 'Fiat Panda' wordt 'Fiat' +
    'Panda' omdat er echte Fiat-Panda's in de vloot staan; 'Alfa Romeo' blijft heel
    omdat er geen wagen bestaat met merk 'Alfa' en model 'Romeo'. Staat een merk maar
    één keer verkeerd in de dump en nergens goed, dan gebeurt er niets — dat is de
    veilige uitkomst.

    Er wordt van achteren naar voren geknipt aan beide kanten, dus het langste merk en
    daarbinnen het langste model winnen: 'Volkswagen Golf Break' wordt 'Volkswagen' +
    'Golf break' en niet 'Volkswagen' + 'Golf'. Vergelijken gebeurt via `kaal()`, dus
    hoofdletters en accenten doen niet mee: 'KIA CEE'D' vindt 'Kia' + 'Cee'd'.
    """
    woorden = merk.split()
    for i in range(len(woorden) - 1, 0, -1):
        merkdeel = " ".join(woorden[:i])
        rest = woorden[i:]
        for j in range(len(rest), 0, -1):
            treffer = index.get((kaal(merkdeel), kaal(" ".join(rest[:j]))))
            if treffer:
                return treffer
    return (merk, model)


def zoekvarianten(merk: str, model: str) -> list[tuple[str, str]]:
    """Van specifiek naar algemeen, want de modelnamen dragen trimniveaus.

    'C3 1.2 Puretech 83 S&S BVM Live' levert geen treffer; 'C3' wel. We knippen dus
    telkens het laatste woord eraf. We stoppen bij het EERSTE woord van het model en
    vallen nooit terug op alleen het merk: een willekeurige Citroën tonen bij een C3 is
    een verkeerde foto, en dat is erger dan geen foto.

    Er wordt ook op KOPPELTEKENS geknipt, niet alleen op spaties. Zonder dat leverde
    'A-170' precies één zoekterm op en was er dus geen terugval: het model werd niet
    gevonden en daarmee hield het op. Dertien modellen in de vloot zitten in dat geval —
    'C-max', 'HR-V', 'e-Niro', 'Corsa-e'. De naam zoals ze is blijft wél de eerste poging,
    want vaak ís dat de juiste schrijfwijze op Commons.

    Geeft telkens (volledige zoekterm, het modeldeel) terug — dat tweede is wat de
    bestandsnaam moet bevatten om goedgekeurd te worden.
    """
    varianten = [(f"{merk} {model}", model)]
    woorden = [w for w in re.split(r"[\s\-]+", model.strip()) if w]
    for n in range(len(woorden), 0, -1):
        deel = " ".join(woorden[:n])
        paar = (f"{merk} {deel}", deel)
        if paar not in varianten:
            varianten.append(paar)
    return varianten


def zoek_foto(zoekterm: str, merk: str, model: str, gezocht_model: str,
              geweigerd: set[str] | None = None) -> dict | None:
    """Eén zoekopdracht; geeft de eerste treffer terug die door de keuring komt."""
    try:
        data = haal_json({
            "action": "query", "format": "json",
            "generator": "search",
            "gsrsearch": zoekterm + " car",
            "gsrnamespace": "6",          # bestandsnaamruimte
            # Twintig in plaats van acht. Het kost niets extra (één oproep) en
            # geeft de afwijslijst ruimte: bij Skoda Octavia stonden de eerste tien
            # treffers vol met dezelfde besneeuwde vRS uit één Flickr-reeks, en de
            # enige bruikbare foto van de hele wagen stond op plaats elf.
            "gsrlimit": "20",
            "prop": "imageinfo|categories",
            "iiprop": "url|extmetadata|size",
            "iiurlwidth": str(THUMB_BREEDTE),
            # De categorieën zijn de tweede zeef; ze komen in dezelfde oproep mee.
            "cllimit": "50",
            "clshow": "!hidden",
        })
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        zeg(f"      netwerkfout bij {zoekterm!r}: {e}")
        return None

    paginas = data.get("query", {}).get("pages", {})
    # De API geeft geen volgorde terug; 'index' draagt de rangschikking van de zoekmachine.
    for pagina in sorted(paginas.values(), key=lambda p: p.get("index", 999)):
        titel = pagina.get("title", "")
        if not re.search(r"\.(jpe?g|png)$", titel, re.I):
            continue
        categorieen = [c.get("title", "") for c in (pagina.get("categories") or [])]
        info = (pagina.get("imageinfo") or [{}])[0]
        breedte, hoogte = info.get("width") or 0, info.get("height") or 0
        verhouding = (breedte / hoogte) if breedte and hoogte else None
        goed, reden = titel_ok(titel, merk, model, gezocht_model, categorieen,
                               verhouding, geweigerd)
        if not goed:
            continue
        thumb = info.get("thumburl")
        if not thumb:
            continue
        meta = info.get("extmetadata", {})
        licentie = meta.get("LicenseShortName", {}).get("value", "")
        if not licentie_ok(licentie):
            continue
        return {
            "titel": titel,
            "thumb": thumb,
            "categorieen": categorieen,
            "verhouding": verhouding,
            "licentie": licentie.strip(),
            "auteur": ontdoe_van_html(meta.get("Artist", {}).get("value", "")) or "onbekend",
            "bronpagina": info.get("descriptionurl", ""),
        }
    return None


def download(url: str, doel: Path) -> bool:
    try:
        verzoek = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(verzoek, timeout=60) as antwoord:
            inhoud = antwoord.read()
    except (urllib.error.URLError, TimeoutError) as e:
        zeg(f"      downloadfout: {e}")
        return False
    if len(inhoud) < 1024:
        zeg("      bestand verdacht klein, overgeslagen")
        return False
    doel.write_bytes(inhoud)
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--feed", type=Path, default=None,
                    help="pad naar degage_vehicles.json (standaard: ../gbfs/…)")
    ap.add_argument("--uit", type=Path, default=None,
                    help="fotomap (standaard: ../web/fotos)")
    ap.add_argument("--opnieuw", action="store_true",
                    help="negeer wat er al opgehaald is en zoek alles opnieuw")
    ap.add_argument("--max", type=int, default=0,
                    help="stop na dit aantal NIEUWE ophalingen (0 = geen grens)")
    args = ap.parse_args()

    wortel = Path(__file__).resolve().parent.parent
    feed = args.feed or wortel / "gbfs" / "degage_vehicles.json"
    uit = args.uit or wortel / "web" / "fotos"
    manifest_pad = uit / "fotos.json"

    def bewaar() -> None:
        """Het manifest wegschrijven. Staat hier als functie omdat er drie momenten
        zijn waarop dat moet: na elke treffer (breekt de run af, dan is het werk niet
        weg), aan het einde, en ook wanneer er niets op te halen valt maar de
        opruiming van de misserlijst wel iets veranderd heeft."""
        manifest["bijgewerkt"] = date.today().isoformat()
        manifest["bron"] = "Wikimedia Commons"
        manifest["regels_versie"] = REGELS_VERSIE
        manifest_pad.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8", newline="\n")

    if not feed.exists():
        zeg(f"FOUT: feed niet gevonden: {feed}")
        return 2
    uit.mkdir(parents=True, exist_ok=True)

    wagens = json.loads(feed.read_text(encoding="utf-8"))["data"]["vehicles"]
    # Eerst de merkvelden rechttrekken waarin een modelnaam beland is (zie
    # `normaliseer()`), anders zoekt het script naar een 'Fiat Panda 1.2' die niet
    # bestaat en krijgt die wagen nooit de Panda-foto die er al ligt.
    index = vlootindex(wagens)
    combos: dict[str, int] = {}
    hersteld: dict[str, str] = {}
    for w in wagens:
        merk, model = normaliseer(w["merk"], w["model"], index)
        if (merk, model) != (w["merk"], w["model"]):
            hersteld[f"{w['merk']}|{w['model']}"] = f"{merk}|{model}"
        combos[f"{merk}|{model}"] = combos.get(f"{merk}|{model}", 0) + 1
    # Meest voorkomende eerst: breekt de run af, dan zijn de wagens die het vaakst
    # bekeken worden toch al voorzien.
    volgorde = sorted(combos, key=lambda k: (-combos[k], k))

    manifest = {"fotos": {}, "niet_gevonden": [], "geweigerd": [], "zoek_als": {}}
    if manifest_pad.exists():
        bestaand = json.loads(manifest_pad.read_text(encoding="utf-8"))
        # De afwijslijst en de handmatige zoektermen overleven ook --opnieuw: ze zijn
        # met de hand gemaakt en zouden anders bij elke volledige herophaling
        # weggegooid worden.
        manifest["geweigerd"] = bestaand.get("geweigerd", [])
        manifest["zoek_als"] = bestaand.get("zoek_als", {})
        if not args.opnieuw:
            manifest["fotos"] = bestaand.get("fotos", {})
            manifest["niet_gevonden"] = bestaand.get("niet_gevonden", [])
            manifest["regels_versie"] = bestaand.get("regels_versie")
    geweigerd = set(manifest["geweigerd"])
    if geweigerd:
        zeg(f"afwijslijst: {len(geweigerd)} bestand(en) worden nooit gekozen")

    # Een sleutel met een handmatige zoekterm staat nooit in de misserlijst. Wie zo'n
    # regel toevoegt, doet dat juist voor een sleutel die eerder niets opleverde; bleef
    # de misser staan, dan werd de nieuwe zoekterm nooit geprobeerd. De prijs is klein:
    # zodra de zoekterm wél een foto oplevert staat die in `fotos` en wordt er niet meer
    # gezocht. Alleen een zoekterm die niets vindt kost elke run één verzoek — en die
    # mag opvallen, want dan klopt de regel niet.
    zoek_als = {k: v for k, v in manifest["zoek_als"].items() if "|" in k and "|" in v}
    if zoek_als:
        manifest["niet_gevonden"] = [k for k in manifest["niet_gevonden"]
                                     if k not in zoek_als]
        zeg(f"zoektermen: {len(zoek_als)} combinatie(s) worden onder een andere naam "
            "gezocht")

    # Herkeuring: de al opgehaalde foto's opnieuw langs de huidige zeven halen. Dat kost
    # geen enkel netwerkverzoek — de bestandsnaam staat in het manifest — en zorgt dat een
    # strenger geworden regel ook de oude oogst opschoont. Zonder dit blijft een raceauto
    # die vóór de aanscherping binnenkwam voor altijd staan.
    afgekeurd = []
    for sleutel, gegevens in sorted(manifest["fotos"].items()):
        merk, model = sleutel.split("|", 1)
        goed, reden = titel_ok(gegevens.get("titel", ""), merk, model,
                               gegevens.get("gezocht_op"),
                               gegevens.get("categorieen"),
                               gegevens.get("verhouding"), geweigerd)
        if not goed:
            afgekeurd.append((sleutel, gegevens, reden))
    if afgekeurd:
        zeg(f"herkeuring: {len(afgekeurd)} bestaande foto's voldoen niet meer")
        for sleutel, gegevens, reden in afgekeurd:
            zeg(f"  {sleutel:<40} {reden}")
            oud = uit / gegevens["bestand"]
            if oud.exists():
                oud.unlink()
            del manifest["fotos"][sleutel]
        zeg("  ze zijn verwijderd en worden hieronder opnieuw gezocht.")
        zeg()

    # Ook de missers verdienen een nieuwe kans zodra de zeven veranderd zijn: de regel die
    # het merk SEAT wegfilterde, maakte missers die er geen waren. Het manifest onthoudt
    # met welke versie van de regels het gevuld is; wijkt die af, dan wordt de misserlijst
    # één keer leeggemaakt. Bij een ongewijzigde versie gebeurt dit niet en blijft een
    # tweede run dus verzoekloos.
    if manifest.get("regels_versie") != REGELS_VERSIE and manifest["niet_gevonden"]:
        zeg(f"de keuringsregels zijn gewijzigd ({manifest.get('regels_versie', 'geen')} "
            f"-> {REGELS_VERSIE}): {len(manifest['niet_gevonden'])} eerdere missers "
            "krijgen een nieuwe kans.")
        zeg()
        manifest["niet_gevonden"] = []

    # Sleutels waar geen wagen meer bij hoort, eruit halen. Dat zijn er sinds de
    # normalisatie een handvol: van "Toyota Aygo|AYGO SD 1,0 VVTI SMT+ LHD" is een eigen
    # foto opgehaald voordat die combinatie "Toyota|Aygo" werd, en die staat er nu dubbel
    # naast. Wat het manifest noemt en niemand opvraagt, is stille rommel — precies wat de
    # wezenopruiming verderop voor de BESTANDEN doet, hier voor de SLEUTELS.
    #
    # De keerzijde: valt een model één dump lang uit de vloot, dan is zijn foto weg en
    # wordt er bij terugkeer opnieuw gezocht — mogelijk een andere foto, want de
    # zoekresultaten van Commons liggen niet vast. Dat is de prijs van een manifest dat
    # de vloot volgt; ze is klein omdat een nieuwe zoekopdracht altijd langs dezelfde
    # keuring gaat. Met --max gebeurt dit niet: dan is de run bewust onvolledig.
    #
    # Kost geen enkel netwerkverzoek: wat nog bestaat, staat in `combos`.
    verdwenen = [k for k in manifest["niet_gevonden"] if k not in combos]
    manifest["niet_gevonden"] = [k for k in manifest["niet_gevonden"] if k in combos]
    wees_sleutels = []
    if not args.max:
        wees_sleutels = sorted(k for k in manifest["fotos"] if k not in combos)
        for sleutel in wees_sleutels:
            bestand = uit / manifest["fotos"][sleutel]["bestand"]
            if bestand.exists():
                bestand.unlink()
            del manifest["fotos"][sleutel]

    gekend = set(manifest["fotos"]) | set(manifest["niet_gevonden"])
    te_doen = [k for k in volgorde if k not in gekend]

    zeg("=" * 84)
    zeg("Dégage — stockfoto's per merk+model, van Wikimedia Commons")
    zeg("=" * 84)
    zeg(f"feed         {feed}")
    zeg(f"fotomap      {uit}")
    zeg(f"combinaties  {len(volgorde)} uniek over {len(wagens)} wagens")
    if hersteld:
        zeg(f"merkveld     {len(hersteld)} combinatie(s) rechtgetrokken:")
        for van, naar in sorted(hersteld.items()):
            zeg(f"             {van}  ->  {naar}")
    if verdwenen:
        zeg(f"opgeruimd    {len(verdwenen)} misser(s) zonder wagen meer in de vloot")
    if wees_sleutels:
        zeg(f"opgeruimd    {len(wees_sleutels)} foto('s) zonder wagen meer in de vloot:")
        for sleutel in wees_sleutels:
            zeg(f"             {sleutel}")
    zeg(f"al gekend    {len(gekend)}  ({len(manifest['fotos'])} met foto, "
        f"{len(manifest['niet_gevonden'])} zonder)")
    zeg(f"op te halen  {len(te_doen)}")
    if not te_doen:
        zeg()
        if verdwenen or wees_sleutels:
            bewaar()
            zeg("Niets op te halen — geen enkel netwerkverzoek. De opruiming is "
                "wel weggeschreven.")
        else:
            zeg("Niets te doen — geen enkel netwerkverzoek. "
                "Gebruik --opnieuw om te vernieuwen.")
        return 0
    if args.max:
        te_doen = te_doen[: args.max]
        zeg(f"begrensd tot {len(te_doen)} door --max")
    zeg()

    nieuw = gemist = 0
    for i, sleutel in enumerate(te_doen, 1):
        merk, model = sleutel.split("|", 1)
        zeg(f"[{i}/{len(te_doen)}] {merk} {model}  ({combos[sleutel]} wagens)")

        treffer = None
        gebruikt = model
        zoekmerk, zoekmodel = merk, model
        if sleutel in zoek_als:
            zoekmerk, zoekmodel = zoek_als[sleutel].split("|", 1)
            zeg(f"      met de hand gezocht als {zoekmerk} {zoekmodel}")
        for variant, modeldeel in zoekvarianten(zoekmerk, zoekmodel):
            treffer = zoek_foto(variant, merk, model, modeldeel, geweigerd)
            time.sleep(PAUZE_S)
            if treffer:
                gebruikt = modeldeel
                if variant != f"{zoekmerk} {zoekmodel}":
                    zeg(f"      geen treffer op de volledige naam; gezocht op {variant!r}")
                break

        if not treffer:
            zeg("      niets bruikbaars gevonden — geen foto (beter dan een verkeerde)")
            manifest["niet_gevonden"].append(sleutel)
            gemist += 1
            continue

        bestand = slug(merk, model) + Path(treffer["titel"]).suffix.lower()
        if not download(treffer["thumb"], uit / bestand):
            manifest["niet_gevonden"].append(sleutel)
            gemist += 1
            continue

        manifest["fotos"][sleutel] = {
            "bestand": bestand,
            "titel": treffer["titel"],
            # Op welk deel van de modelnaam deze treffer gevonden is. Staat hier zodat de
            # herkeuring bij een volgende run precies dezelfde eis kan stellen, en zodat
            # zichtbaar is wanneer een foto van het basismodel is in plaats van de uitvoering.
            "gezocht_op": gebruikt,
            # Bewaard zodat de herkeuring bij een volgende run dezelfde zeef kan draaien
            # zonder Commons opnieuw te bevragen.
            "categorieen": treffer["categorieen"],
            "verhouding": (round(treffer["verhouding"], 3)
                           if treffer["verhouding"] else None),
            "licentie": treffer["licentie"],
            "auteur": treffer["auteur"],
            "bronpagina": treffer["bronpagina"],
        }
        nieuw += 1
        zeg(f"      {bestand}  ({treffer['licentie']}, {treffer['auteur'][:40]})")

        # Na elke treffer wegschrijven: breekt de run af, dan is het werk niet weg en
        # slaat de volgende run alles over wat al binnen is.
        bewaar()

    bewaar()

    # Wezen opruimen. Een afgekeurde of vervangen foto blijft anders op schijf staan —
    # het postzegelvel bleef zo als `peugeot-partner-full-electric.jpeg` achter naast de
    # nieuwe `.jpg`. Wat het manifest niet noemt, hoort er niet te zijn.
    # Alleen na een volledige run: met --max is het manifest bewust onvolledig en zou dit
    # de foto's van de nog niet behandelde wagens weggooien.
    if not args.max:
        in_gebruik = {g["bestand"] for g in manifest["fotos"].values()} | {manifest_pad.name}
        wezen = [p for p in uit.iterdir() if p.is_file() and p.name not in in_gebruik]
        if wezen:
            zeg()
            zeg(f"opruiming: {len(wezen)} bestand(en) waar geen wagen meer naar verwijst")
            for p in wezen:
                zeg(f"  {p.name}")
                p.unlink()

    zeg()
    zeg(f"klaar — {nieuw} nieuwe foto's, {gemist} zonder treffer")
    zeg(f"totaal nu {len(manifest['fotos'])} foto's voor {len(volgorde)} combinaties")
    zeg(f"manifest  {manifest_pad}")
    zeg("Een volgende run slaat dit alles over en doet geen enkel verzoek.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
