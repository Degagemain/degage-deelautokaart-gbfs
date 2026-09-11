#!/usr/bin/env python3
"""Genereer de publieke GBFS v3.0-feed van Dégage uit de DuckDB-replica.

Schrijft zes bestanden naar `varia/deelautokaart/gbfs/`:

  gbfs.json · system_information.json · station_information.json ·
  station_status.json · vehicle_types.json   -> GBFS v3.0, voor aggregatoren
  degage_vehicles.json                       -> eigen detailbestand, enkel voor onze kaart

Wat dit script wél en niet doet
-------------------------------
· De replica gaat READ-ONLY open (via `degage.geo.connect_with_geo`, die de database
  read-only aanhangt en de postcodelaag `pc` meebrengt).
· De poort op de coördinaten is `AUTO_COORD_OK`, letterlijk overgenomen uit
  `notebooks/06_member_surveys/2026August/29_geo_coordinaatkeuring.py` (sectie E).
  Ze draait bij elke run opnieuw en de vijf getallen worden geprint.
· Een station is één uniek coördinaat, nooit één `car_location`: de 568 wagens hebben
  568 verschillende adresrijen, ook waar het adres fysiek hetzelfde is (SCOPE.md).
· `last_updated` komt uit de dumpdatum, nooit uit de klok. Zelfde dump in -> byte-voor-byte
  dezelfde bestanden uit. Die datum leest het script uit de tabel `_meta` in de replica,
  zodat hij niet van iemands geheugen afhangt.
· Validatie is een poort: elk bestand wordt tegen zijn JSON Schema gehouden en er wordt
  pas geschreven als álle zes slagen. Faalt er één, dan blijft de oude output staan.
· Privacy is een tweede poort: de gerenderde tekst wordt gescand op e-mailadressen,
  telefoonnummers, UUID's en de verboden kolomnamen uit SCOPE.md.
· Een stille correctie is erger dan geen correctie (huisstijl: `scripts/fetch_geo.py`).
  Elke normalisatie, elke herleiding en elke afgevallen rij wordt geprint.

Draaien
-------
    py scripts/genereer_gbfs.py

Meer is er niet nodig. Het script zoekt de replica, de dumpdatum en de publieke basis-URL
zelf op, en print bij elke waarde waar ze vandaan komt. Wat het niet kan vinden, vult het
niet in: dan faalt het en zegt het wat je mee moet geven.

Draait de geolaag uit de data-analytics-repo mee, dan wordt ook de twijfelvlag gemeten:

    uv --directory "<data-analytics-repo>" run python \
       "<pad>/deelautokaart/scripts/genereer_gbfs.py"

Overrulen kan, maar hoeft niet:

    --replica <pad>      andere replica            (anders: DEGAGE_REPLICA of naast de repo)
    --dump-datum <dat>   andere dumpdatum          (anders: uit `_meta` in de replica)
    --basis-url <url>    andere publieke basis-URL (anders: DEGAGE_BASIS_URL, CNAME of git)
    --uit <map>          andere outputmap          (anders: `gbfs/` naast dit script)
    --no-interactive     niets vragen              (anders: alleen vragen mét terminal)

De geolaag `data/geo/postcodes_be_dissolved.parquet` in de data-analytics-repo
(`uv run python scripts/fetch_geo.py`) is nodig voor de twijfelvlag uit sectie E. Zonder
die laag draait het script door; het zegt dan dat de vlag niet gemeten is.
"""

from __future__ import annotations

import argparse
import calendar
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

# ============================================================================
# DE POORT — letterlijk overgenomen, niet herafgeleid
# ============================================================================
# Bron: notebooks/06_member_surveys/2026August/29_geo_coordinaatkeuring.py, sectie E.
# Verwacht deze join:
#   FROM degage.cars c JOIN degage.addresses a ON a.address_id = c.car_location
AUTO_COORD_OK = """
    c.vehicle_type = 'CAR'
AND c.car_active = 1
AND c.car_location > 0
AND a.address_latitude  IS NOT NULL
AND a.address_longitude IS NOT NULL
AND a.address_latitude  BETWEEN 49.4 AND 51.6
AND a.address_longitude BETWEEN 2.5  AND 6.5
AND NOT (round(a.address_latitude::DOUBLE,  3) = round(a.address_latitude::DOUBLE,  5)
     AND round(a.address_longitude::DOUBLE, 3) = round(a.address_longitude::DOUBLE, 5))
"""

# Geo-afhankelijke twijfelvlag uit dezelfde sectie: niet uitsluiten, wel apart tellen.
TWIJFEL_METER = 2500
L72 = "'EPSG:4326','EPSG:31370',always_xy:=true"

# Referentie op dump 31-07-2026 (SCOPE.md, "Datafeiten"). Puur om naast de eigen telling
# te zetten — een verse dump mág hiervan afwijken, dan hoort dat zichtbaar te zijn.
REFERENTIE = {
    "in deling": 568,
    "door de poort": 568,
    "afgevallen": 0,
    "twijfelvlag": 5,
    "gedeeld punt": 6,
    "stations": 565,
}

# ============================================================================
# DE BRANDSTOFMAPPING LIGT VAST — FEEDSPEC.md, niet zelf invullen
# ============================================================================
# GBFS `propulsion_type` kent geen aardgas en geen LPG. Die wagens worden `combustion`:
# de eerlijke benadering, want het zijn verbrandingsmotoren. De echte brandstof blijft
# staan in degage_vehicles.json, en het aantal herleidingen wordt bij elke run geprint.
# Duikt er een achtste waarde op in een volgende dump, dan faalt dit script luid.
FUEL_NAAR_PROPULSION = {
    "PETROL": "combustion",
    "DIESEL": "combustion_diesel",
    "ELECTRIC": "electric",
    "CNG": "combustion",  # <-- herleiding, GBFS kent geen aardgas
    "HYBRID": "hybrid",
    "PLUGINHYBRID": "plug_in_hybrid",
    "LPG": "combustion",  # <-- herleiding, GBFS kent geen LPG
}
HERLEID_NAAR_COMBUSTION = {"CNG", "LPG"}

# Brandstof in mensentaal voor het eigen detailbestand — hier mag CNG wél CNG heten.
FUEL_NL = {
    "PETROL": "benzine",
    "DIESEL": "diesel",
    "ELECTRIC": "elektrisch",
    "CNG": "CNG",
    "HYBRID": "hybride",
    "PLUGINHYBRID": "plug-in hybride",
    "LPG": "LPG",
}

# ============================================================================
# max_range_meters — GEEN GEMETEN WAARDE, EEN GEDOCUMENTEERDE ONDERGRENS
# ============================================================================
# Het officiële v3.0-schema eist `max_range_meters` bij ÉLKE propulsion_type behalve
# `human` (zie de if/then onderaan vehicle_types.json). FEEDSPEC.md ging uit van "enkel
# bij electric en plug_in_hybrid" — het schema is strenger, dus de vraag geldt voor alle
# types die wij publiceren. Het veld weglaten kan dus niet: dan schrijft dit script
# helemaal geen output weg.
#
# Wij kennen het échte bereik niet uit de data. `car_fuel_economy` is geen bereik en mag
# volgens SCOPE.md sowieso niet mee. Daarom staan hier bewust CONSERVATIEVE ONDERGRENZEN
# per aandrijving: liever te weinig beloven dan te veel. Ze worden bij elke run geprint.
#
# OPEN PUNT voor Pieter: bevestigen of vervangen door echte cijfers vóór livegang.
MAX_RANGE_METERS = {
    "combustion": 400_000,  # 400 km — een volle tank benzine/CNG/LPG haalt dat ruim
    "combustion_diesel": 400_000,  # 400 km — diesel haalt in de praktijk meer
    "hybrid": 400_000,  # 400 km — hybride haalt in de praktijk meer
    "plug_in_hybrid": 400_000,  # 400 km — batterij én tank samen, ruim onder het echte bereik
    "electric": 100_000,  # 100 km — ondergrens voor de oudste kleine EV's in de vloot
}

# Aandrijving in mensentaal voor de typenaam. `combustion` is een verzamelbak
# (benzine + CNG + LPG), dus die heet hier niet "benzine" maar "benzine of gas" —
# anders belooft de naam iets wat voor 22 wagens niet klopt.
PROPULSION_NL = {
    "combustion": "benzine of gas",
    "combustion_diesel": "diesel",
    "electric": "elektrisch",
    "hybrid": "hybride",
    "plug_in_hybrid": "plug-in hybride",
}

# `car_car_type` kent twee waarden. Een derde laat dit script luid vallen.
#
# LET OP BIJ HET LEZEN: dit is de INSCHRIJVING, niet de vorm van de wagen. `LIGHT_FREIGHT`
# is de Belgische fiscale categorie "lichte vracht" — een bestelwagen zonder achterbank,
# ingeschreven met het bijhorende belastingregime. Het zegt niets over hoe groot of
# hoe busvormig een wagen eruitziet.
#
# Dat verschil is niet theoretisch; hetzelfde model staat in de dump van 31-07-2026 in
# beide categorieën, afhankelijk van hoe dat exemplaar is ingeschreven:
#
#     Renault Kangoo     1 lichte vracht  tegen 18 personenwagen
#     Citroën Berlingo   2                tegen 11
#     Dacia Dokker       2                tegen  7
#     Fiat Doblo         2                tegen  5
#
# Een Berlingo mét ruiten en achterbank is een personenwagen; dezelfde Berlingo als
# gesloten bestelwagen is lichte vracht. Alle 13 wagens met `LIGHT_FREIGHT` hebben dan
# ook 2, 3 of 6 zitplaatsen, en één eigenaar typte het zelf in de modelnaam:
# "Fiat Doblo Cargo Maxi - Lichte vracht".
#
# Daarom heet dit veld naar buiten "Lichte vracht" en niet "Bestelwagen". Dat laatste
# leest als een vorm en wekt de indruk dat er maar 13 grote wagens in de vloot zitten,
# terwijl er ruim honderd busvormige wagens zijn die gewoon als personenwagen zijn
# ingeschreven. De vorm zélf is uit deze data niet af te leiden: daarvoor zou je een
# modellijst nodig hebben die we niet hebben, en ze zou nog fout zijn ook, want een
# Berlingo kan allebei zijn.
CAR_TYPE_SLUG = {"PASSENGER_CAR": "passenger", "LIGHT_FREIGHT": "freight"}
CAR_TYPE_NL = {"PASSENGER_CAR": "Personenwagen", "LIGHT_FREIGHT": "Lichte vracht"}

# ============================================================================
# CARROSSERIE — een handmatige lijst, want de databank kent dit niet
# ============================================================================
# De vraag "is dit een bestelwagen?" is niet uit de data te beantwoorden. `car_car_type`
# gaat over de inschrijving (zie hierboven), en de modelnaam is vuile vrije tekst waar we
# volgens FEEDSPEC.md niets uit afleiden.
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
# "Beveren"). Dat is een organisatiegegeven, geen persoonsgegeven, en alle 568 wagens
# hebben er een. Het mag dus mee.
#
# Het e-mailadres van zo'n groep komt NIET uit de databank: `district_email` en
# `car_email` zijn allebei leeg in de gegevens waar deze generator mee werkt. We kunnen
# het er dus niet uit halen, en we leiden het al helemaal niet af uit een plaatsnaam —
# een verzonnen adres levert post op die nergens aankomt.
#
# Daarom een tweede handmatige lijst, net als carrosserie.json: `scripts/districten.json`
# met per districtsnaam een adres. Staat er niets, dan toont de kaart geen adres. Het
# `district_contact_id` (een persoon) wordt NOOIT aangeraakt.
DISTRICTEN_BESTAND = "districten.json"

# ============================================================================
# OPENSTAANDE KEUZES VAN PIETER — voorlopige waarden, bevestigen vóór publicatie
# ============================================================================
# Elk van deze waarden wordt bij elke run geprint als open punt. `None` betekent:
# het veld blijft weg uit de feed, want een verzonnen URL is erger dan een leeg veld.
SYSTEM_ID = "degage"
TAAL = "nl"
NAAM = "Dégage"
OPERATOR = "Dégage"
SITE_URL = "https://www.degage.be/"
# FEEDSPEC.md: gebruik info@degage.be als voorlopige waarde, nooit een persoonlijk adres.
FEED_CONTACT_EMAIL = "info@degage.be"
# "word-lid-pagina" — er is geen URL die te verifiëren viel in de app-broncode of de
# dossiers. Blijft leeg tot Pieter er een aanlevert.
PURCHASE_URL = None
# Licentie van de data. Een licentiekeuze is een beslissing van Dégage, geen technische:
# CC BY 4.0 staat hier als voorstel omdat de geo-bronnen in deze codebase dezelfde
# licentie dragen. Bevestigen of vervangen.
LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
# Basis-URL van de gepubliceerde feed. De feed woont voorlopig op GitHub Pages onder de
# publieke repo; de GBFS-bestanden staan daar in de submap `gbfs`. Komt er later een eigen
# domein, dan wint een `CNAME` in de root hierop — of geef `--basis-url` mee.
BASIS_URL_STANDAARD = "https://degagemain.github.io/degage-deelautokaart-gbfs/gbfs"

# `ttl` staat op de refreshcadans. Wij verversen manueel per kwartaal, dus een korte ttl
# liegt. 86400 = één dag: consumers mogen dagelijks pollen zonder valse belofte.
TTL = 86_400
GBFS_VERSIE = "3.0"
EIGEN_VERSIE = "1.0"

# Coördinaten worden op 6 decimalen naar buiten gebracht (±0,1 m) en OP DIE AFGERONDE
# WAARDE geclusterd, zodat elk station in de output een eigen punt heeft. Notebook 29
# sectie D: de data draagt hoogstens vijf decimalen, dus 6 verliest niets.
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
# De richting komt uit een hash van het AFGERONDE COÖRDINAAT, niet uit een toevalsgetal en
# niet uit het station_id. Dat heeft twee gevolgen die allebei nodig zijn:
#   · Dezelfde dump levert dezelfde bestanden op — de generator blijft deterministisch.
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

# De negen toebehoren uit FEEDSPEC.md: (kolom in `cars`, sleutel in het detailbestand).
#
# EEN VELD KOMT ALLEEN MEE ALS HET `true` IS (FEEDSPEC.md, "Toebehoren: enkel wat aan
# staat"). Reden: 176 van de 568 wagens (31%) hebben álle vlaggen op nul, en in de data
# is niet te scheiden of dat "niet aanwezig" of "nooit ingevuld" betekent. Een `false`
# wegschrijven zou die onwetendheid als feit presenteren, en de kaart zou er "trekhaak:
# nee" van kunnen maken. Wagens zonder enig toebehoren houden een leeg object: dat zegt
# "wij weten van geen enkel toebehoren", niet "er is er geen".
#
# `car_student_OK` ("leren autorijden", 113 wagens) stond tot 09-09-2026 op de
# verbodslijst hieronder: SCOPE.md hield het aan als open vraag omdat het uitleenbeleid
# is en geen voertuigeigenschap. Die vraag is beantwoord — het veld hoort publiek — dus
# het staat nu hier en niet meer bij de verboden kolommen. Het volgt exact dezelfde
# regel als de rest: alleen een `true` komt mee.
TOEBEHOREN = [
    ("car_gps", "gps"),
    ("car_hook", "trekhaak"),
    ("car_pets_OK", "huisdieren"),
    ("car_kidseat_available", "kinderzitje"),
    ("car_bicycle_rack_available", "fietsdrager"),
    ("car_trailer_available", "aanhanger"),
    ("car_has_bed", "bed"),
    ("car_student_OK", "leren_autorijden"),
]

# ============================================================================
# VERSNELLINGSBAK — de ENIGE plek waar een nul wél iets betekent
# ============================================================================
# `car_manual` stond tot 09-09-2026 tussen de toebehoren hierboven. Dat was fout, en
# FEEDSPEC.md zei het zelf al: het is "eerder een eigenschap van de wagen dan een
# toebehoren". Nu is het een eigen veld met twee waarden.
#
# Daarmee wijkt dit veld bewust af van de regel "een nul is dubbelzinnig", en dat
# verdient uitleg, want die regel is de ruggengraat van dit bestand:
#
# · Bij een toebehoren betekent 0 "afwezig OF nooit ingevuld" — die twee zijn niet te
#   scheiden, en daarom komt een 0 daar nooit in de feed.
# · Bij een versnellingsbak bestaat "afwezig" niet. Elke wagen heeft er een, en ze is
#   manueel of automatisch. Er is geen derde toestand om mee verward te worden.
# · De kolom is nergens NULL — niet in de vloot en niet in de hele tabel (1.854 op 1,
#   772 op 0). Er is dus geen aparte "niet ingevuld"-toestand die we zouden wegpoetsen.
# · En de nul is aantoonbaar géén ontbrekende invoer. Een elektrische wagen heeft geen
#   koppeling en kan niet manueel zijn; stond de nul voor "nooit ingevuld", dan zou ze
#   bij elektrisch ongeveer even vaak voorkomen als bij benzine. Op de dump van
#   31-07-2026 staat ze precies waar de techniek ze verwacht:
#
#       elektrisch       65 wagens   100,0% automatisch
#       plug-in hybride   2 wagens   100,0%
#       hybride          19 wagens    84,2%
#       diesel           95 wagens    18,9%
#       benzine         365 wagens     9,0%
#
#   Dat patroon volgt de aandrijving, niet de invulijver. De nul draagt dus betekenis.
#   (De totalen, 431 manueel tegen 137 automatisch, liggen bovendien vlak bij de
#   Belgische vloot als geheel.)
#
# Blijkt die aanname ooit niet te kloppen, dan is dit de plek om ze terug te draaien:
# haal het veld weg, niet stil een derde waarde "onbekend" erbij verzinnen.
VERSNELLINGSBAK_NL = {1: "manueel", 0: "automatisch"}

# ============================================================================
# EURONORM — vrije tekst in de bron, hier herleid tot één generatie
# ============================================================================
# `technicalcardetails.euro_norm` is een vrij tekstveld en de vloot draagt er 31
# schrijfwijzen in: '6', '6b', '6d', '6*', 'Euro 6b', 'euro 6', '6.3', '85', 'nvt',
# '*', '' ... De euronorm kent zelf maar zes generaties, en de subletters (6b, 6c, 6d,
# 6e) zijn verfijningen bínnen generatie 6. Daarom wordt alles herleid tot "Euro 1"
# t/m "Euro 6", en valt de rest op onbekend.
#
# Drie dingen die deze herleiding bewust NIET doet:
# · Ze raadt niet bij een dubbelzinnige invoer. '5 of 6' en '4 of misschien 5' staan zo
#   in de bron; daar het eerste cijfer uit pikken zou een gok als feit presenteren.
#   Alles met het woord "of" erin valt op onbekend.
# · Ze verzint geen norm waar er geen staat. Ontbreekt de waarde, of is ze '', 'nvt',
#   '*' of '0', dan komt het veld niet in het bestand — dezelfde regel als bij de
#   toebehoren: liever niets dan een onwetendheid als feit.
# · Ze knipt geen betekenis weg die ze niet kent. De asterisk ('6*', '5*', '4*') is een
#   annotatie waarvan de betekenis nergens in de dossiers te verifiëren viel; hij wordt
#   genegeerd, en bij elke run wordt geprint hoeveel waarden er een droegen.
RE_EURONORM_DUBBELZINNIG = re.compile(r"\bof\b")
RE_EURONORM_GENERATIE = re.compile(r"^([1-6])")

# GESCHRAPT op 17-08-2026 (FEEDSPEC.md, "Geschrapt"): aantal deuren (`car_doors`, zegt de
# lezer niets), de vier koffermaten (`car_trunk_volume` en `car_trunk_size_*` — die zijn in
# de bron niet in één eenheid ingevuld en dus onbruikbaar) en `car_start_sharing`. Ze worden niet
# meer opgehaald, niet meer weggeschreven, en het eigen schema in
# `gbfs/schema/degage_vehicles.json` verbiedt ze via `additionalProperties: false`.

# ============================================================================
# PRIVACY — de harde poort uit SCOPE.md
# ============================================================================
# Nooit in de output, ook niet in een tussenbestand. De scan zoekt op de kolomnaam én
# op de vorm (e-mail, telefoon, UUID).
VERBODEN_KOLOMMEN = [
    "car_owner_user_id",
    "car_email",
    "car_comments",
    "car_location",
    "car_calendar_uuid",
    "car_estimated_value",
    "car_remaining_value",
    "car_agreed_value",
    "car_deprec",
    "car_contract",
    "car_advance",
    "car_repay_advance",
    "car_initial_mileage",
    "car_start_km",
    "car_owner_annual_km",
    "car_fuel_economy",
    "car_images_id",
    "address_street",
    "address_number",
    "user_",
    # Sinds 09-09-2026 lezen we `technicalcardetails` uit voor de euronorm. In diezelfde
    # tabel staan velden die samen met een coördinaat herleidbaar zijn tot een eigenaar.
    # De query haalt ze niet op; deze regels zijn de tweede grendel, zodat een latere
    # `SELECT *` daar niet stil doorheen glipt.
    "details_car_license_plate",
    "details_car_chassis_number",
    "details_car_registration",
]
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
    """RFC3339-tijdstempel voor de dumpdatum, middernacht Brusselse tijd."""
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
        sleutel = f"{merk_map[r['car_brand']]}|{model_map[r['car_type']]}"
        r["carrosserie_sleutel"] = sleutel
        aantallen[sleutel] = aantallen.get(sleutel, 0) + 1

    ontbreekt = sorted((s for s in aantallen if s not in lijst),
                       key=lambda s: (-aantallen[s], s))

    zeg("carrosserie — handmatige lijst, want de databank kent het soort voertuig niet")
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
    carrosserie. Reden: een leeg adres is hier ongevaarlijk — de kaart toont dan gewoon
    geen contact — terwijl een ontbrekende carrosserie een filter stuk zou maken.
    """
    namen = sorted({r["district"] for r in vloot if r["district"]})
    gegevens = {"toelichting": "", "adressen": {}}
    if pad.exists():
        gegevens = json.loads(pad.read_text(encoding="utf-8"))
        gegevens.setdefault("adressen", {})

    gegevens["toelichting"] = (
        "Handmatig onderhouden: het contactadres van de lokale Dégage-groep, per district. "
        "Komt NIET uit de databank en wordt nergens uit afgeleid. "
        "Laat een adres leeg als je het niet zeker weet: dan "
        "toont de kaart er gewoon geen. Alleen adressen op @degage.be worden aanvaard; "
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
        zeg("  (nog geen enkel adres ingevuld — de kaart toont dan geen contact)")
    zeg()
    return adressen


def euronorm(ruw: str | None) -> str | None:
    """Herleid de vrije tekst uit `euro_norm` tot 'Euro 1'..'Euro 6', of None.

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

    `car_type` en `car_brand` zijn vrije tekst: `caddy maxi` naast `Caddy Maxi`, spaties
    vooraan, 'Citroen' naast 'Citroën'. De regel is: groepeer op een accent- en
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

    `address_city` is met de hand ingevuld, en dat zie je: 'GENTBRUGGE', 'gent',
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
    zeg(f"  address_city (plaats): {len(set(afbeelding.values()))} unieke waarden na "
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
    soort stille gat waar dit dossier niet op mag draaien. Daarom registreren we ze hier
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
                       toegelaten_mail: set[str] | None = None) -> list[str]:
    """Scan de gerenderde JSON op alles wat volgens SCOPE.md nooit naar buiten mag.

    `toegelaten_mail` zijn de groepsadressen uit `districten.json`. Die uitzondering is
    smal en met opzet: een adres komt er alleen in als een mens het met de hand in dat
    bestand heeft gezet én het op @degage.be staat. Een persoonlijk adres kan er dus niet
    insluipen: die staan niet in dat bestand, en de generator haalt ze nergens op.
    Elk ander adres laat deze poort nog steeds falen.
    """
    toegelaten = {FEED_CONTACT_EMAIL} | (toegelaten_mail or set())
    lekken = []
    for kolom in VERBODEN_KOLOMMEN:
        if kolom.lower() in ruwe_tekst.lower():
            lekken.append(f"{naam}: verboden kolomnaam {kolom!r} staat in de output")
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
# data ophalen
# ============================================================================
def haal_vloot(con) -> list[dict]:
    kolommen = [
        "car_id", "car_name", "car_brand", "car_type", "car_fuel", "car_car_type",
        "car_seats", "car_year", "car_manual",
    ]
    kolommen += [k for k, _ in TOEBEHOREN]
    select = ", ".join(f"c.{k}" for k in kolommen)
    # De euronorm staat in `technicalcardetails`, één rij per wagen op
    # `details_id = car_id`. Gecontroleerd op de dump van 31-07-2026: alle 2.626 wagens
    # hebben daar exact één rij, en alle 231 elektrische wagens staan er op co2 = 0
    # terwijl de verbrandingsmotoren dat niet doen — de sleutel klopt dus.
    # LEFT JOIN, geen JOIN: een wagen zonder technische fiche mag niet uit de vloot
    # vallen, hij heeft gewoon geen euronorm. Er wordt uitsluitend `euro_norm` gehaald;
    # nummerplaat en chassisnummer uit diezelfde tabel staan op de verbodslijst.
    rijen = con.execute(f"""
        SELECT {select},
               a.address_latitude::DOUBLE  AS lat,
               a.address_longitude::DOUBLE AS lon,
               a.address_city              AS plaats,
               regexp_extract(trim(a.address_zipcode), '^([0-9]{{4}})') AS postcode,
               t.euro_norm                 AS euro_norm,
               d.district_name             AS district
        FROM degage.cars c
        JOIN degage.addresses a ON a.address_id = c.car_location
        LEFT JOIN degage.technicalcardetails t ON t.details_id = c.car_id
        -- Alleen de NAAM van het district. `district_contact_id` wijst naar een persoon
        -- en blijft waar hij is.
        LEFT JOIN degage.districts d ON d.district_id = c.car_district_id
        WHERE {AUTO_COORD_OK}
        ORDER BY c.car_id
    """).fetchall()
    velden = kolommen + ["lat", "lon", "plaats", "postcode", "euro_norm", "district"]
    return [dict(zip(velden, r)) for r in rijen]


def rapporteer_poort(con, geolaag: bool = True) -> dict[str, int]:
    """Draai `AUTO_COORD_OK` opnieuw en print de vijf getallen uit SCOPE.md.

    `geolaag=False` betekent dat de postcodelaag `pc` er niet is. Dan kán de twijfelvlag
    niet gemeten worden — die vergelijkt elk coördinaat met de polygoon van zijn eigen
    postcode. Ze wordt dan luid als NIET GEMETEN gerapporteerd in plaats van stil op nul
    gezet: een ontbrekende meting die als 0 doorgaat, leest als "geen twijfelgevallen".
    De vlag is puur diagnostisch en raakt de weggeschreven bestanden niet.
    """
    in_deling = con.execute("""
        SELECT count(*) FROM degage.cars WHERE vehicle_type = 'CAR' AND car_active = 1
    """).fetchone()[0]
    door = con.execute(f"""
        SELECT count(*) FROM degage.cars c
        LEFT JOIN degage.addresses a ON a.address_id = c.car_location
        WHERE {AUTO_COORD_OK}
    """).fetchone()[0]

    # De twee vlaggen uit sectie E, gemeten op de wagens die de poort halen.
    if geolaag:
        twijfel, gedeeld = con.execute(f"""
            WITH av AS (
                SELECT c.car_id,
                       a.address_latitude::DOUBLE  AS lat,
                       a.address_longitude::DOUBLE AS lon,
                       ST_Point(a.address_longitude::DOUBLE, a.address_latitude::DOUBLE) AS pt,
                       regexp_extract(trim(a.address_zipcode), '^([0-9]{{4}})') AS zip
                FROM degage.cars c JOIN degage.addresses a ON a.address_id = c.car_location
                WHERE {AUTO_COORD_OK}
            )
            SELECT
              (SELECT count(*) FROM av a LEFT JOIN pc p ON p.postcode = a.zip
                WHERE ST_Distance(ST_Transform(a.pt,{L72}),
                                  ST_Transform(p.geom,{L72})) > {TWIJFEL_METER}),
              (SELECT count(*) FROM av a WHERE EXISTS (
                    SELECT 1 FROM av b
                     WHERE b.car_id <> a.car_id AND b.lat = a.lat AND b.lon = a.lon))
        """).fetchone()
    else:
        twijfel = None
        gedeeld = con.execute(f"""
            WITH av AS (
                SELECT c.car_id,
                       a.address_latitude::DOUBLE  AS lat,
                       a.address_longitude::DOUBLE AS lon
                FROM degage.cars c JOIN degage.addresses a ON a.address_id = c.car_location
                WHERE {AUTO_COORD_OK}
            )
            SELECT count(*) FROM av a WHERE EXISTS (
                SELECT 1 FROM av b
                 WHERE b.car_id <> a.car_id AND b.lat = a.lat AND b.lon = a.lon)
        """).fetchone()[0]

    gemeten = {
        "in deling": in_deling,
        "door de poort": door,
        "afgevallen": in_deling - door,
        "twijfelvlag": twijfel,
        "gedeeld punt": gedeeld,
    }
    zeg("poort AUTO_COORD_OK (notebook 29, sectie E) — opnieuw gedraaid op deze dump")
    labels = {
        "in deling": "wagens in deling (CAR + car_active = 1)",
        "door de poort": "halen AUTO_COORD_OK",
        "afgevallen": "vallen af",
        "twijfelvlag": f"daarvan met twijfelvlag (> {nl_getal(TWIJFEL_METER)} m van eigen polygoon)",
        "gedeeld punt": "daarvan op een gedeeld punt",
    }
    for sleutel, label in labels.items():
        ref = REFERENTIE[sleutel]
        if gemeten[sleutel] is None:
            zeg(f"  {label:<58} {'NIET GEMETEN':>6}   (referentie 31-07-2026: {ref})"
                "   <-- geolaag `pc` ontbreekt")
            continue
        vlag = "" if gemeten[sleutel] == ref else "   <-- WIJKT AF van de referentie"
        zeg(f"  {label:<58} {gemeten[sleutel]:>6}   (referentie 31-07-2026: {ref}){vlag}")

    # Elke afgevallen rij mét reden. Op de dump van 31-07-2026 zijn dit er nul; de
    # machinerie staat er voor de volgende dump.
    afgevallen = con.execute(f"""
        SELECT c.car_id,
               CASE
                 WHEN c.car_location IS NULL OR c.car_location <= 0 THEN 'geen car_location'
                 WHEN a.address_id IS NULL   THEN 'car_location wijst naar geen adresrij'
                 WHEN a.address_latitude IS NULL OR a.address_longitude IS NULL
                      THEN 'lat of lon leeg'
                 WHEN a.address_latitude NOT BETWEEN 49.4 AND 51.6
                   OR a.address_longitude NOT BETWEEN 2.5 AND 6.5
                      THEN 'buiten de Belgische bbox'
                 ELSE 'beide assen afgerond op <= 3 decimalen'
               END AS reden
        FROM degage.cars c LEFT JOIN degage.addresses a ON a.address_id = c.car_location
        WHERE c.vehicle_type = 'CAR' AND c.car_active = 1
          AND NOT coalesce(({AUTO_COORD_OK}), FALSE)
        ORDER BY c.car_id
    """).fetchall()
    if afgevallen:
        zeg(f"  afgevallen rijen ({len(afgevallen)}), elk met reden:")
        for car_id, reden in afgevallen:
            zeg(f"    car_id={car_id}: {reden}")
    else:
        zeg("  afgevallen rijen: geen")
    zeg()
    return gemeten


# ============================================================================
# opbouw van de feed
# ============================================================================
def bouw(vloot: list[dict], stempel: str, basis_url: str,
         carrosserie_pad: Path, districten_pad: Path, interactief: bool) -> dict[str, dict]:
    """Bouw de zes payloads. Print elke keuze die de data aanraakt."""
    zeg("normalisatie van de vrije tekst (niets stil gecorrigeerd)")
    merk_map = normaliseer([r["car_brand"] for r in vloot], "car_brand (merk)")
    model_map = normaliseer([r["car_type"] for r in vloot], "car_type (model)")
    zeg("    let op: trimniveaus worden NIET weggeknipt — daarvoor is een modellijst nodig "
        "die we niet hebben.")
    plaats_map = normaliseer_plaatsen([r["plaats"] for r in vloot])
    zeg()

    carrosserie = vul_carrosserie_aan(vloot, merk_map, model_map,
                                      carrosserie_pad, interactief)
    district_mail = laad_districten(vloot, districten_pad)

    # --- brandstof -> propulsion_type -------------------------------------------------
    onbekende_fuel = sorted({r["car_fuel"] for r in vloot} - set(FUEL_NAAR_PROPULSION))
    if onbekende_fuel:
        raise SystemExit(
            f"FOUT: onbekende waarde(n) in car_fuel: {onbekende_fuel}. De mapping in "
            "FEEDSPEC.md kent er zeven. Dit script raadt niet — vul de tabel aan."
        )
    onbekend_type = sorted({r["car_car_type"] for r in vloot} - set(CAR_TYPE_SLUG))
    if onbekend_type:
        raise SystemExit(
            f"FOUT: onbekende waarde(n) in car_car_type: {onbekend_type}. Bekend zijn "
            f"{sorted(CAR_TYPE_SLUG)}. Dit script raadt niet."
        )

    # --- versnellingsbak ---------------------------------------------------------------
    # Luid vallen als de kolom ooit iets anders draagt dan 0 of 1. Het hele argument om
    # hier wél een nul te publiceren staat of valt met "er zijn maar twee toestanden";
    # duikt er een NULL of een 2 op, dan klopt die aanname niet meer en mag dit script
    # niet stil doorgaan.
    onbekende_bak = sorted(
        {r["car_manual"] for r in vloot} - set(VERSNELLINGSBAK_NL),
        key=lambda v: (v is None, v),
    )
    if onbekende_bak:
        raise SystemExit(
            f"FOUT: car_manual draagt onverwachte waarde(n): {onbekende_bak}. Verwacht 0 "
            "of 1. Zie de toelichting bij VERSNELLINGSBAK_NL: het publiceren van de nul "
            "steunt erop dat er precies twee toestanden zijn. Dit script raadt niet."
        )
    soort_telling = Counter(CAR_TYPE_NL[r["car_car_type"]] for r in vloot)
    zitplaats_telling = Counter(int(r["car_seats"]) for r in vloot)
    zeg("soort en zitplaatsen — allebei filterbaar op de kaart")
    for soort, n in soort_telling.most_common():
        zeg(f"  {soort:<16} {n:>4} wagens")
    zeg("  zitplaatsen: " + ", ".join(
        f"{z}x{zitplaats_telling[z]}" for z in sorted(zitplaats_telling)))
    zeg()

    bak_telling = Counter(VERSNELLINGSBAK_NL[int(r["car_manual"])] for r in vloot)
    zeg("versnellingsbak — apart veld, geen toebehoren")
    for bak, n in bak_telling.most_common():
        zeg(f"  {bak:<13} {n:>4} wagens ({n / len(vloot) * 100:.1f}%)")
    zeg("  Dit is de enige plek waar een 0 in de bron wél gepubliceerd wordt. Reden: een")
    zeg("  wagen heeft altijd een versnellingsbak, dus 'afwezig' bestaat hier niet en de")
    zeg("  nul betekent 'niet manueel' = automatisch. Zie VERSNELLINGSBAK_NL.")
    zeg()

    fuel_telling = Counter(r["car_fuel"] for r in vloot)
    herleid = sum(fuel_telling[f] for f in HERLEID_NAAR_COMBUSTION)
    zeg("brandstof -> propulsion_type (bindende tabel uit FEEDSPEC.md)")
    for fuel in sorted(fuel_telling, key=lambda f: -fuel_telling[f]):
        vlag = "   <-- herleid, GBFS kent deze brandstof niet" if fuel in HERLEID_NAAR_COMBUSTION else ""
        zeg(f"  {fuel:<13} {fuel_telling[fuel]:>4}  ->  {FUEL_NAAR_PROPULSION[fuel]}{vlag}")
    zeg(f"  herleidingen naar combustion (CNG + LPG): {herleid} wagens")
    zeg()

    # --- vehicle_types ----------------------------------------------------------------
    for r in vloot:
        r["propulsion"] = FUEL_NAAR_PROPULSION[r["car_fuel"]]
        r["vehicle_type_id"] = (
            f"car-{r['propulsion']}-{CAR_TYPE_SLUG[r['car_car_type']]}-{r['car_seats']}"
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
                    f"{CAR_TYPE_NL[r['car_car_type']]}, {PROPULSION_NL[r['propulsion']]}, "
                    f"{r['car_seats']} zitplaatsen"
                ),
                "rider_capacity": int(r["car_seats"]),
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
    zeg("  OPEN PUNT: door Pieter te bevestigen of te vervangen vóór livegang.")
    zeg()

    # --- stations = uniek coördinaat, nooit car_location ------------------------------
    per_punt: dict[tuple[float, float], list[dict]] = defaultdict(list)
    for r in vloot:
        r["lat6"] = round(r["lat"], COORD_DECIMALEN)
        r["lon6"] = round(r["lon"], COORD_DECIMALEN)
        per_punt[(r["lat6"], r["lon6"])].append(r)

    zeg("coördinaten vervagen (privacy — zie LOCATIE_FUZZ_M in dit script)")
    zeg(f"  elke standplaats {LOCATIE_FUZZ_M} m opzij, in een richting uit een hash van het punt zelf")
    zeg("  vast bedrag, geen toeval: het echte punt ligt altijd op die afstand, nooit eronder")
    zeg("  bestendig: dezelfde plek houdt dezelfde verschuiving, ook na een nieuwe dump")
    zeg()

    stations, statussen = [], []
    for punt, wagens in per_punt.items():
        wagens.sort(key=lambda r: r["car_id"])
        # station_id uit een bestendige sleutel: het laagste car_id op dat punt.
        # Bewust niet uit een rijnummer en niet uit address_id — car_location staat op de
        # verbodslijst en mag ook niet als afgeleide de feed in.
        station_id = f"st-{wagens[0]['car_id']}"
        for r in wagens:
            r["station_id"] = station_id
        naam = " + ".join(w["car_name"].strip() for w in wagens)
        # Pas hier vervagen, niet eerder: het groeperen moet op het ECHTE punt gebeuren,
        # anders vallen twee wagens op dezelfde stoep uit elkaar.
        vaag_lat, vaag_lon = verschuif(punt[0], punt[1])
        stations.append({
            "station_id": station_id,
            "name": tekst(naam),
            "lat": vaag_lat,
            "lon": vaag_lon,
            "post_code": wagens[0]["postcode"],
            # Geen fysieke infrastructuur: de wagens staan gewoon op straat.
            "is_virtual_station": True,
        })
        per_type = Counter(w["vehicle_type_id"] for w in wagens)
        statussen.append({
            "station_id": station_id,
            "num_vehicles_available": len(wagens),
            "vehicle_types_available": [
                {"vehicle_type_id": t, "count": n} for t, n in sorted(per_type.items())
            ],
            "is_installed": True,
            "is_renting": True,
            "is_returning": True,
            "last_reported": stempel,
        })
    stations.sort(key=lambda s: s["station_id"])
    statussen.sort(key=lambda s: s["station_id"])

    meervoudig = [s for s in statussen if s["num_vehicles_available"] > 1]
    zeg("stationsmodel — één station per uniek coördinaat, nooit per car_location")
    zeg(f"  stations: {len(stations)}   (referentie 31-07-2026: {REFERENTIE['stations']})"
        + ("" if len(stations) == REFERENTIE["stations"] else "   <-- WIJKT AF"))
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
    for r in sorted(vloot, key=lambda r: (r["station_id"], r["car_id"])):
        # Alleen wat op true staat. Een false betekent hier niet "afwezig" maar
        # "afwezig of nooit ingevuld", en dat verschil mag de kaart niet wegpoetsen.
        toebehoren = {sleutel: True for kolom, sleutel in TOEBEHOREN if r[kolom]}
        for sleutel in toebehoren:
            toebehoren_geteld[sleutel] += 1
        if not toebehoren:
            zonder_toebehoren += 1

        norm = euronorm(r["euro_norm"])
        ruw = "(leeg)" if r["euro_norm"] is None else str(r["euro_norm"])
        euronorm_afbeelding[norm or "(onbekend)"][ruw] += 1
        euronorm_geteld[norm or "(onbekend)"] += 1
        if "*" in ruw:
            met_asterisk += 1

        wagen = {
            "station_id": r["station_id"],
            "vehicle_type_id": r["vehicle_type_id"],
            "naam": r["car_name"].strip(),
            "merk": merk_map[r["car_brand"]],
            "model": model_map[r["car_type"]],
            # Het soort voertuig komt uit de handmatige lijst, niet uit de databank.
            "carrosserie": carrosserie[r["carrosserie_sleutel"]],
            # De inschrijving is iets anders: de fiscale categorie. Ze blijft mee in de
            # feed omdat ze een feit is, maar de kaart filtert erop niet — zie de
            # toelichting bij CAR_TYPE_NL.
            "inschrijving": CAR_TYPE_NL[r["car_car_type"]],
            "brandstof": FUEL_NL[r["car_fuel"]],
            "zitplaatsen": int(r["car_seats"]),
            "bouwjaar": int(r["car_year"]),
            "versnellingsbak": VERSNELLINGSBAK_NL[int(r["car_manual"])],
        }
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

    zeg("toebehoren — alleen wat op true staat komt in het bestand (FEEDSPEC.md)")
    for _, sleutel in TOEBEHOREN:
        n = toebehoren_geteld[sleutel]
        zeg(f"  {sleutel:<12} aanwezig bij {n:>3} van {len(vloot)} wagens "
            f"({n / len(vloot) * 100:.1f}%)")
    zeg(f"  wagens zonder énig toebehoren: {zonder_toebehoren} van {len(vloot)} "
        f"({zonder_toebehoren / len(vloot) * 100:.1f}%) — leeg object, geen rij vol 'false'.")
    zeg("  Dat is dubbelzinnig: 'niet aanwezig' of 'nooit ingevuld' is in de data niet te")
    zeg("  scheiden. Daarom nooit een negatief label en nooit een filter op afwezigheid.")
    zeg()

    zeg("euronorm — vrije tekst uit technicalcardetails.euro_norm, herleid tot één generatie")
    bekend = sum(n for k, n in euronorm_geteld.items() if k != "(onbekend)")
    for norm in sorted(euronorm_afbeelding, key=lambda k: (k == "(onbekend)", k)):
        varianten = euronorm_afbeelding[norm]
        n = euronorm_geteld[norm]
        bron = ", ".join(f"{v!r}x{varianten[v]}" for v in sorted(varianten))
        zeg(f"  {norm:<12} {n:>4} wagens   <-  {bron}")
    zeg(f"  bekend: {bekend} van {len(vloot)} wagens ({bekend / len(vloot) * 100:.1f}%); "
        f"onbekend: {euronorm_geteld['(onbekend)']} — die krijgen géén veld in het bestand.")
    zeg(f"  waarden met een asterisk: {met_asterisk} — de betekenis van '*' viel nergens te")
    zeg("  verifiëren, dus hij wordt genegeerd en NIET als extra betekenis meegedragen.")
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

    return {
        "gbfs": gbfs,
        "system_information": envelop(system),
        "station_information": envelop({"stations": stations}),
        "station_status": envelop({"stations": statussen}),
        "vehicle_types": envelop({"vehicle_types": vehicle_types}),
        "degage_vehicles": eigen,
    }


# ============================================================================
# main
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
# ZELF UITZOEKEN WAT ER UIT TE ZOEKEN VALT
# ============================================================================
# Elke instelling die dit script zelf kan vinden, hoort het zelf te vinden. Een vlag die
# je bij elke run opnieuw moet intypen, is een vlag die je een keer verkeerd intypt — en
# de dumpdatum was daar het duidelijkste voorbeeld van: die stond in de replica én in je
# geheugen, en alleen dat laatste kon ernaast zitten.
#
# Twee regels, allebei even hard:
#
#   · Niets wordt STIL gevonden. Bij elke waarde print het script waar ze vandaan komt,
#     zodat je in het logboek ziet waarop deze feed gebouwd is.
#   · Niets wordt GERADEN. Wat niet te vinden is, wordt niet met een aanname ingevuld;
#     dan faalt het script luid en zegt het wat je mee moet geven. Een verkeerde
#     dumpdatum is erger dan geen dumpdatum: de feed zou een toestand beweren die niet
#     bestaat, en niemand zou het merken.
REPLICA_BESTAND = "degage.duckdb"

# Waar de replica pleegt te staan, in volgorde van waarschijnlijkheid. Relatief aan de
# repo (de map bóven `scripts/`), zodat een verhuisde repo zijn buurmappen meeneemt.
REPLICA_PLEKKEN = (
    Path("..") / "degage-replica" / REPLICA_BESTAND,
    Path("..") / "data-analytics-main" / "data" / REPLICA_BESTAND,
    Path("..") / "data-analytics" / "data" / REPLICA_BESTAND,
    Path("data") / REPLICA_BESTAND,
)


def zoek_replica(repo: Path, expliciet: Path | None) -> tuple[Path | None, str, list[Path]]:
    """Waar staat de replica? Geeft (pad, herkomst, bekeken plekken) terug.

    Een expliciet pad wint altijd, ook als het niet bestaat — dan hoort het script daar
    luid over te vallen in plaats van stilletjes een andere replica te pakken dan je
    bedoelde.
    """
    if expliciet is not None:
        return expliciet.resolve(), "meegegeven met --replica", []

    uit_omgeving = os.environ.get("DEGAGE_REPLICA")
    if uit_omgeving:
        return Path(uit_omgeving).resolve(), "omgevingsvariabele DEGAGE_REPLICA", []

    bekeken: list[Path] = []
    for plek in REPLICA_PLEKKEN:
        kandidaat = (repo / plek).resolve()
        bekeken.append(kandidaat)
        if kandidaat.is_file():
            return kandidaat, "gevonden naast de repo", bekeken
    return None, "niet gevonden", bekeken


def lees_meta(con) -> dict | None:
    """De `_meta`-tabel die het inlaadscript in de replica achterlaat.

    Daar staat de dumpdatum in, en dat is de enige plek waar hij niet van een geheugen
    afhangt. Oudere replica's hebben de tabel niet; dan geeft dit None terug en moet de
    datum alsnog met de hand mee.
    """
    for vraag in ("select dump_bestand, dump_datum from degage._meta limit 1",
                  "select dump_bestand, dump_datum from _meta limit 1"):
        try:
            rij = con.execute(vraag).fetchone()
        except Exception:
            continue
        if rij and rij[1]:
            return {"bestand": rij[0], "datum": rij[1]}
    return None


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

    uit_omgeving = os.environ.get("DEGAGE_BASIS_URL")
    if uit_omgeving:
        return uit_omgeving.rstrip("/"), "omgevingsvariabele DEGAGE_BASIS_URL"

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


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Genereer de GBFS v3.0-feed van Dégage uit de DuckDB-replica.",
        epilog="Zonder vlaggen zoekt dit script alles zelf uit en print het bij elke "
               "waarde waar ze vandaan komt. De vlaggen hieronder zijn er om zo'n keuze "
               "te overrulen, niet om ze bij elke run te herhalen.",
    )
    ap.add_argument(
        "--replica", "--db", type=Path, default=None, metavar="PAD", dest="replica",
        help="pad naar degage.duckdb. Standaard: de omgevingsvariabele DEGAGE_REPLICA, "
             "anders wordt er naast de repo gezocht (../degage-replica/, "
             "../data-analytics-main/data/, ...).",
    )
    ap.add_argument(
        "--dump-datum", default=None, metavar="JJJJ-MM-DD",
        help="datum van de dump; voedt last_updated. Standaard uit de tabel `_meta` in "
             "de replica. Alleen nodig bij een replica die die tabel niet draagt.",
    )
    ap.add_argument(
        "--basis-url", default=None, metavar="URL",
        help="publieke basis-URL van de feed. Standaard: de omgevingsvariabele "
             "DEGAGE_BASIS_URL, anders afgeleid uit CNAME of de git-remote.",
    )
    ap.add_argument(
        "--uit", type=Path, default=None, metavar="MAP",
        help="outputmap. Standaard de map `gbfs/` naast dit script.",
    )
    ap.add_argument(
        "--no-interactive", action="store_true",
        help="vraag niets; faal luid bij een model dat niet in carrosserie.json staat. "
             "Gebeurt vanzelf zonder terminal, zoals in een geplande run.",
    )
    args = ap.parse_args()

    hier = Path(__file__).resolve().parent
    repo = hier.parent
    uit = (args.uit or repo / "gbfs").resolve()
    # De schema's zijn INVOER, geen uitvoer: ze staan vast in de repo. Ze aan --uit
    # hangen maakte die vlag onbruikbaar — een andere outputmap betekende een lege
    # schemamap, en dan faalt de validatiepoort op iets wat niet stuk is.
    schema_map = repo / "gbfs" / "schema"

    # Zonder terminal kan er niets gevraagd worden. Toch vragen zou de run laten hangen
    # op een prompt die niemand ziet, dus is niet-interactief daar de enige eerlijke stand.
    interactief = sys.stdin.isatty() and not args.no_interactive

    zeg("=" * 100)
    zeg("Dégage — GBFS v3.0 feedgenerator")
    zeg("=" * 100)
    zeg()

    # ---- de replica -------------------------------------------------------------------
    replica, replica_bron, bekeken = zoek_replica(repo, args.replica)
    if replica is None:
        zeg("FOUT: geen replica gevonden. Gezocht op:")
        for kandidaat in bekeken:
            zeg(f"  {kandidaat}")
        zeg()
        zeg("Geef het pad mee met --replica <pad naar degage.duckdb>, of zet")
        zeg("DEGAGE_REPLICA in de omgeving.")
        return 2
    if not replica.is_file():
        zeg(f"FOUT: {replica} bestaat niet ({replica_bron}).")
        return 2

    # De geolaag komt uit de data-analytics-repo en is er niet altijd: de replica wordt
    # ook los gebruikt, zonder die repo ernaast. Ze voedt maar één getal — de
    # twijfelvlag — en dat getal is diagnostisch, het raakt de output niet. Zonder de
    # laag draait de generator dus door, maar hij zégt dat de vlag niet gemeten is.
    # Stil op nul zetten mag niet: dat leest als "geen twijfelgevallen".
    geolaag = True
    try:
        from degage.geo import connect_with_geo

        con = connect_with_geo(replica)
    except ImportError:
        geolaag = False
        import duckdb

        # De queries spreken de replica als `degage` aan. Bij een rechtstreekse
        # verbinding heet de catalogus al naar het bestand (degage.duckdb -> `degage`),
        # dus die naam klopt vanzelf; een ATTACH erbovenop zou botsen.
        con = duckdb.connect(str(replica), read_only=True)

    # ---- de dumpdatum -----------------------------------------------------------------
    # Uit de replica zelf, want daar staat hij feitelijk; met de hand meegeven kan, maar
    # dan is het een bewering die het script niet kan nakijken — behalve tegen `_meta`,
    # en dat doet het dan ook.
    meta = lees_meta(con)
    if args.dump_datum:
        try:
            dump_datum = date.fromisoformat(args.dump_datum)
        except ValueError:
            zeg(f"FOUT: --dump-datum {args.dump_datum!r} is geen datum in JJJJ-MM-DD.")
            return 2
        datum_bron = "meegegeven met --dump-datum"
        if meta and meta["datum"] != dump_datum:
            zeg(f"LET OP: --dump-datum zegt {dump_datum.isoformat()}, maar de replica zegt "
                f"{meta['datum'].isoformat()} ({meta['bestand']}).")
            zeg("  De meegegeven datum wint. Klopt dat, of staat --replica op een andere dump?")
            zeg()
    elif meta:
        dump_datum = meta["datum"]
        datum_bron = f"uit `_meta` in de replica ({meta['bestand']})"
    else:
        zeg("FOUT: deze replica draagt geen `_meta` met een dumpdatum, dus de datum moet")
        zeg("mee: --dump-datum JJJJ-MM-DD.")
        zeg()
        zeg("Hij voedt `last_updated` en mag nooit van de klok komen: dezelfde dump hoort")
        zeg("dezelfde bestanden op te leveren, vandaag en volgend kwartaal.")
        return 2

    stempel = tijdstempel(dump_datum)
    basis_url, url_bron = zoek_basis_url(repo, args.basis_url)

    # ---- wat er gevonden is ------------------------------------------------------------
    zeg("waar deze run op gebouwd is")
    herkomst("replica", str(replica), replica_bron)
    herkomst("dumpdatum", f"{dump_datum.isoformat()}   ->   last_updated {stempel}", datum_bron)
    herkomst("basis-URL", basis_url, url_bron)
    herkomst("outputmap", str(uit), "standaard" if args.uit is None else "meegegeven met --uit")
    zeg(f"  {'vragen':<14} {'ja' if interactief else 'nee'}")
    zeg(f"  {'':<14} <- " + (
        "terminal aanwezig" if interactief
        else ("--no-interactive" if args.no_interactive else "geen terminal — niets te vragen")))
    zeg()

    if not geolaag:
        zeg("LET OP: `degage.geo` niet beschikbaar — rechtstreeks op de replica verbonden.")
        zeg("  De postcodelaag `pc` ontbreekt, dus de twijfelvlag wordt NIET gemeten.")
        zeg("  Dat getal is diagnostisch; de weggeschreven bestanden veranderen er niet door.")
        zeg()

    zeg("openstaande keuzes — voorlopige waarden, door Pieter te bevestigen")
    zeg(f"  feed_contact_email  {FEED_CONTACT_EMAIL}   (FEEDSPEC.md: voorlopig, nooit persoonlijk)")
    zeg(f"  license_url         {LICENSE_URL or '(leeg)'}   (voorstel, licentiekeuze is aan Dégage)")
    zeg(f"  purchase_url        {PURCHASE_URL or '(leeg gelaten — geen verifieerbare word-lid-URL)'}")
    zeg()

    gemeten = rapporteer_poort(con, geolaag=geolaag)
    vloot = haal_vloot(con)
    if len(vloot) != gemeten["door de poort"]:
        zeg(f"FOUT: de vlootquery levert {len(vloot)} rijen, de poort telde "
            f"{gemeten['door de poort']}. Niet weggeschreven.")
        return 1

    carrosserie_pad = hier / CARROSSERIE_BESTAND
    districten_pad = hier / DISTRICTEN_BESTAND
    payloads = bouw(vloot, stempel, basis_url, carrosserie_pad,
                    districten_pad, interactief)

    # ---- poort 1: validatie tegen de officiële schema's -------------------------------
    zeg("validatie tegen de JSON Schemas (poort — er wordt niets geschreven als dit faalt)")
    fc = _formatchecker()
    fouten: list[str] = []
    for naam, payload in payloads.items():
        pad = schema_map / SCHEMA_VAN[naam]
        f = valideer(naam, payload, pad, fc)
        fouten += f
        bron = "MobilityData v3.0" if naam != "degage_vehicles" else "eigen schema"
        zeg(f"  {naam + '.json':<28} {'OK' if not f else f'{len(f)} FOUT(EN)':<12} ({bron})")
    if fouten:
        zeg()
        zeg("VALIDATIE GEFAALD — geen enkel bestand weggeschreven:")
        for f in fouten:
            zeg(f"  {f}")
        return 1
    zeg()

    # ---- poort 2: privacy -------------------------------------------------------------
    zeg("privacyscan (verbodslijst SCOPE.md + e-mail, telefoon, UUID)")
    gerenderd = {naam: render(p) for naam, p in payloads.items()}
    # Alleen de groepsadressen die daadwerkelijk in het detailbestand staan.
    toegelaten_mail = {w["contact"] for w in payloads["degage_vehicles"]["data"]["vehicles"]
                       if "contact" in w}
    lekken: list[str] = []
    for naam, ruw in gerenderd.items():
        lek = controleer_privacy(naam, ruw, toegelaten_mail)
        lekken += lek
        zeg(f"  {naam + '.json':<28} {'schoon' if not lek else f'{len(lek)} LEK(KEN)'}")
    if lekken:
        zeg()
        zeg("PRIVACYPOORT GEFAALD — geen enkel bestand weggeschreven:")
        for lek in lekken:
            zeg(f"  {lek}")
        return 1
    zeg(f"  (het enige toegelaten '@' is feed_contact_email: {FEED_CONTACT_EMAIL})")
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
    zeg(f"  {gemeten['in deling']} wagens in deling · {gemeten['door de poort']} door de poort · "
        f"{gemeten['afgevallen']} afgevallen")
    zeg(f"  {len(payloads['station_information']['data']['stations'])} stations · "
        f"{len(payloads['vehicle_types']['data']['vehicle_types'])} vehicle_types · "
        f"{len(payloads['degage_vehicles']['data']['vehicles'])} wagens in het detailbestand")
    zeg("  klaar. Publiceren gebeurt NIET door dit script — dat is een aparte, expliciete stap.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
