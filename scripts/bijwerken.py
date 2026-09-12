#!/usr/bin/env python3
"""Werk ALLES in één keer bij: de feed, de modelfoto's, het rijbereik en het openbaar vervoer.

Dit is het enige script dat je met de hand hoeft te starten. Het roept de andere vier in de
juiste volgorde aan, kijkt vooraf of alles aanwezig is, stopt bij het eerste probleem en zegt
in gewone taal wat je dan moet doen.

Draaien
-------
    py scripts/bijwerken.py

Of dubbelklik op `BIJWERKEN.bat` in de hoofdmap — dat doet precies hetzelfde en houdt het
venster open, zodat je kunt lezen wat er gebeurd is.

Waarom de volgorde vastligt
---------------------------
De drie laatste scripts LEZEN uit de feed die het eerste schrijft. `haal_ov.py` schrijft er
zelfs de datum van de feed bij, en de kaart toont die gegevens alleen als die datum klopt.
Vandaar: eerst de feed, dan de rest. Dat is de enige reden dat dit script bestaat — zo hoeft
niemand die volgorde en die voorwaarden te onthouden.

Wat het NIET doet
-----------------
De databankreplica inladen — dat gebeurt in de data-analytics-repo, vóór dit script. En
publiceren doet het niet vanzelf: dat biedt het aan het eind aan, en het gebeurt pas als je
met zoveel woorden ja zegt.
"""

from __future__ import annotations

import argparse
import hashlib
import subprocess
import sys
import textwrap
import time
from pathlib import Path

HIER = Path(__file__).resolve().parent
REPO = HIER.parent

BREED = 100


# ---------------------------------------------------------------------------------------
# De stappen
# ---------------------------------------------------------------------------------------

class Stap:
    def __init__(self, sleutel: str, titel: str, script: str, waarom: str,
                 netwerk: bool, duur: str) -> None:
        self.sleutel = sleutel      # de naam voor --alleen
        self.titel = titel          # wat er in de banner staat
        self.script = script        # bestandsnaam in scripts/
        self.waarom = waarom        # één regel in het overzicht vooraf
        self.netwerk = netwerk      # heeft dit internet nodig?
        self.duur = duur            # ruwe verwachting, zodat niemand denkt dat het hangt


STAPPEN = [
    Stap("feed", "de feed genereren", "genereer_gbfs.py",
         "uit de databankreplica       -> gbfs/", False, "een halve minuut"),
    Stap("fotos", "de modelfoto's ophalen", "haal_stockfotos.py",
         "van Wikimedia Commons        -> map/fotos/", True,
         "meteen klaar als de vloot niet veranderde"),
    Stap("bereik", "het rijbereik ophalen", "haal_bereik.py",
         "van de elektrische wagens    -> map/bereik.json", True, "een paar seconden"),
    Stap("ov", "openbaar vervoer en Mobiscore ophalen", "haal_ov.py",
         "per standplaats              -> map/ov.json", True,
         "een halve minuut; de allereerste keer een paar minuten"),
]

# Wat deze vier bij elkaar kunnen wijzigen. Dit wordt voor en na vergeleken, zodat aan het
# eind staat wat er wérkelijk veranderd is.
UITVOER = [
    "gbfs/gbfs.json",
    "gbfs/manifest.json",
    "gbfs/system_information.json",
    "gbfs/station_information.json",
    "gbfs/vehicle_types.json",
    "gbfs/vehicle_status.json",
    "gbfs/degage_vehicles.json",
    "map/fotos/fotos.json",
    "map/bereik.json",
    "map/ov.json",
    "scripts/carrosserie.json",
]

# Wat de publiceerstap aanbiedt — mappen, want er komen ook fotobestanden bij.
TE_PUBLICEREN = ["gbfs", "map/fotos", "map/bereik.json", "map/ov.json",
                 "scripts/carrosserie.json"]


def zeg(regel: str = "") -> None:
    print(regel, flush=True)


def lijn(teken: str = "-") -> None:
    zeg(teken * BREED)


def duurtekst(seconden: float) -> str:
    if seconden < 60:
        return f"{seconden:.0f} seconden"
    minuten, rest = divmod(int(seconden), 60)
    return f"{minuten} min {rest:02d} s"


# ---------------------------------------------------------------------------------------
# Vooraf kijken of alles er is
# ---------------------------------------------------------------------------------------

def _vingerafdruk(pad: Path) -> str | None:
    """sha256 van één bestand, of None als het er niet is."""
    if not pad.is_file():
        return None
    return hashlib.sha256(pad.read_bytes()).hexdigest()


def momentopname() -> dict[str, str | None]:
    return {p: _vingerafdruk(REPO / p) for p in UITVOER}


def controleer_vooraf(stappen: list[Stap]) -> list[str]:
    """Kijkt na wat er nodig is en geeft de klachten terug; een lege lijst is goed nieuws.

    Dit gebeurt VÓÓR de eerste stap, niet halverwege: een ontbrekende replica na tien
    minuten foto's ophalen is dezelfde fout, maar op het slechtst denkbare moment.
    """
    klachten: list[str] = []
    zeg("eerst kijken of alles er is")
    zeg(f"  {'python':<14} {sys.version.split()[0]}")
    zeg(f"  {'':<14} <- {sys.executable}")
    if sys.version_info < (3, 9):
        klachten.append("Python is te oud. Er is 3.9 of nieuwer nodig; haal de laatste "
                        "versie op python.org.")

    heeft_feedstap = any(s.sleutel == "feed" for s in stappen)
    if heeft_feedstap:
        for module, waarvoor in (("duckdb", "de databankreplica te lezen"),
                                 ("jsonschema", "de feed te controleren")):
            try:
                __import__(module)
            except ImportError:
                zeg(f"  {module:<14} ONTBREEKT")
                klachten.append(f"De module `{module}` ontbreekt — die is nodig om {waarvoor}. "
                                f"Installeer ze met:   py -m pip install {module}")
            else:
                zeg(f"  {module:<14} aanwezig")

        # De generator weet zelf het beste waar de replica staat; we vragen het hém, zodat
        # hier nooit een tweede, afwijkende zoekregel ontstaat.
        replica, bron, bekeken = None, "niet kunnen nakijken", []
        try:
            sys.path.insert(0, str(HIER))
            import genereer_gbfs

            replica, bron, bekeken = genereer_gbfs.zoek_replica(REPO, None)
        except Exception:                                   # noqa: BLE001
            pass
        if replica is not None and replica.is_file():
            zeg(f"  {'replica':<14} {replica}")
            zeg(f"  {'':<14} <- {bron}, {replica.stat().st_size / 1_000_000:.0f} MB")
        else:
            zeg(f"  {'replica':<14} NIET GEVONDEN")
            if replica is not None:
                zeg(f"  {'':<14}    {replica} bestaat niet ({bron})")
            for kandidaat in bekeken:
                zeg(f"  {'':<14}    gezocht op {kandidaat}")
            klachten.append(
                "De databankreplica (degage.duckdb) is er niet. Die zit bewust niet in deze "
                "map — ze bevat persoonsgegevens. Pak de laatste replica-zip uit in een map "
                "`degage-replica` NAAST deze map, of geef het pad mee:\n"
                "      py scripts/bijwerken.py --replica <pad naar degage.duckdb>")
    else:
        zeg(f"  {'replica':<14} niet nodig (de feedstap wordt overgeslagen)")

    for stap in stappen:
        if not (HIER / stap.script).is_file():
            klachten.append(f"Het script `scripts/{stap.script}` ontbreekt in deze map.")
    return klachten


# ---------------------------------------------------------------------------------------
# Een stap draaien
# ---------------------------------------------------------------------------------------

def draai(stap: Stap, nummer: int, totaal: int, extra: list[str]) -> int:
    """Start één script en laat het rechtstreeks naar dit scherm praten.

    Bewust NIET de uitvoer opvangen en achteraf tonen: dan zie je minutenlang niets, en kan
    de generator ook niets vragen. Hij vraagt soms of een nieuw model een personenwagen of
    een bestelwagen is, en dat moet gewoon kunnen.
    """
    zeg()
    lijn("=")
    zeg(f"STAP {nummer} VAN {totaal} — {stap.titel}")
    lijn("=")
    zeg(f"  {' '.join(['py', 'scripts/' + stap.script, *extra])}")
    zeg(f"  duurt normaal: {stap.duur}")
    zeg()
    begin = time.monotonic()
    code = subprocess.call([sys.executable, str(HIER / stap.script), *extra], cwd=str(REPO))
    zeg()
    zeg(f"[stap {nummer} {'klaar' if code == 0 else 'GEFAALD'} — "
        f"{duurtekst(time.monotonic() - begin)}]")
    return code


# ---------------------------------------------------------------------------------------
# Publiceren
# ---------------------------------------------------------------------------------------

def _git(*argumenten: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *argumenten], cwd=str(REPO), capture_output=True, text=True)


def publiceer(vraag: bool) -> int:
    """Zet de bijgewerkte gegevens online — maar alleen wat deze scripts geschreven hebben.

    Uitdrukkelijk geen `git add .`: in deze map wordt ook aan de kaart zelf gewerkt, en half
    afgewerkte code hoort niet mee te liften op een gegevensverversing.
    """
    zeg()
    lijn("=")
    zeg("PUBLICEREN")
    lijn("=")
    if _git("rev-parse", "--git-dir").returncode != 0:
        zeg("  Dit is geen git-map, dus er valt hier niets te publiceren.")
        return 0

    aanwezig = [p for p in TE_PUBLICEREN if (REPO / p).exists()]
    _git("add", "--", *aanwezig)
    klaar = _git("diff", "--cached", "--name-only", "--", *aanwezig).stdout.strip()
    if not klaar:
        zeg("  Er is niets veranderd sinds de vorige publicatie. Niets te doen.")
        _git("reset", "--quiet", "--", *aanwezig)
        return 0

    zeg("  Dit gaat online:")
    for regel in klaar.splitlines():
        zeg(f"    {regel}")
    achtergebleven = _git("diff", "--name-only").stdout.strip()
    if achtergebleven:
        zeg()
        zeg("  Dit blijft staan waar het staat (hoort niet bij deze verversing):")
        for regel in achtergebleven.splitlines():
            zeg(f"    {regel}")

    if vraag:
        zeg()
        zeg("  Eenmaal online is dit voor iedereen zichtbaar.")
        # Uitdrukkelijk vragen of de kaart al nagekeken is: de vraag komt vlak na de tip om
        # dat te doen, en anders is "ja" typen de weg van de minste weerstand.
        antwoord = input("  Heb je de kaart nagekeken en mag dit online? "
                         "Typ ja en druk op enter. Iets anders = niet doen: ")
        if antwoord.strip().lower() not in ("ja", "j", "yes", "y"):
            zeg("  Niet gepubliceerd. De bestanden staan klaar; je kunt het later alsnog doen")
            zeg("  met:  py scripts/bijwerken.py --alleen-publiceren")
            _git("reset", "--quiet", "--", *aanwezig)
            return 0

    resultaat = _git("commit", "-m", "Gegevens bijgewerkt")
    if resultaat.returncode != 0:
        zeg("  Het vastleggen is mislukt:")
        zeg(f"    {resultaat.stdout.strip()} {resultaat.stderr.strip()}")
        return 1
    zeg("  vastgelegd.")
    resultaat = _git("push")
    if resultaat.returncode != 0:
        zeg("  Het versturen naar GitHub is mislukt:")
        zeg(f"    {resultaat.stderr.strip()}")
        zeg("  De wijziging is wél vastgelegd. Probeer het later opnieuw met:  git push")
        return 1
    zeg("  online gezet. GitHub Pages heeft daarna nog een minuut of twee nodig.")
    zeg()
    zeg("  Controleer dan nog:")
    zeg("   · de feed op https://gbfs-validator.mobilitydata.org — elke fout én waarschuwing")
    zeg("   · de kaart zelf: markers, een popup, de filters, de taalwissel")
    return 0


# ---------------------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(
        description="Werk alles in één keer bij: feed, foto's, rijbereik en openbaar vervoer.",
        epilog="Zonder vlaggen doet dit script alles wat nodig is. De vlaggen hieronder zijn "
               "er voor uitzonderingen, niet voor de gewone kwartaalronde.",
    )
    ap.add_argument("--alleen", default=None, metavar="STAP,STAP",
                    help="draai alleen deze stappen, kommagescheiden: "
                         + ", ".join(s.sleutel for s in STAPPEN))
    ap.add_argument("--replica", default=None, metavar="PAD",
                    help="pad naar degage.duckdb. Standaard wordt er naast deze map gezocht.")
    ap.add_argument("--dump-datum", default=None, metavar="JJJJ-MM-DD",
                    help="datum van de dump. Standaard uit de replica zelf.")
    ap.add_argument("--basis-url", default=None, metavar="URL",
                    help="publieke basis-URL van de feed. Standaard uit CNAME of de git-remote.")
    ap.add_argument("--opnieuw-fotos", action="store_true",
                    help="zoek élke modelfoto opnieuw, ook die er al zijn. Duurt lang.")
    ap.add_argument("--vernieuw-ov", action="store_true",
                    help="haal de dienstregelingen opnieuw op in plaats van uit de cache.")
    ap.add_argument("--publiceer", action="store_true",
                    help="publiceer na afloop zonder het te vragen. Voor geplande runs.")
    ap.add_argument("--alleen-publiceren", action="store_true",
                    help="werk niets bij; zet alleen online wat er al klaar staat.")
    ap.add_argument("--niet-publiceren", action="store_true",
                    help="vraag achteraf niets over publiceren.")
    ap.add_argument("--no-interactive", action="store_true",
                    help="vraag niets, aan niemand. Faalt luid in plaats van te vragen.")
    args = ap.parse_args()

    interactief = sys.stdin.isatty() and not args.no_interactive

    # Publiceren zonder iets bij te werken: voor wie eerder "nee" antwoordde, daarna de
    # kaart nagekeken heeft en het nu alsnog online wil zetten.
    if args.alleen_publiceren:
        return publiceer(vraag=interactief and not args.publiceer)

    stappen = STAPPEN
    if args.alleen:
        gevraagd = [s.strip().lower() for s in args.alleen.split(",") if s.strip()]
        bekend = {s.sleutel for s in STAPPEN}
        onbekend = [g for g in gevraagd if g not in bekend]
        if onbekend:
            zeg(f"FOUT: onbekende stap(pen): {', '.join(onbekend)}")
            zeg(f"Kies uit: {', '.join(s.sleutel for s in STAPPEN)}")
            return 2
        stappen = [s for s in STAPPEN if s.sleutel in gevraagd]

    lijn("=")
    zeg("Dégage — alles bijwerken")
    lijn("=")
    zeg()
    zeg("Dit gebeurt er, in deze volgorde. Je hoeft er verder niets voor te doen:")
    zeg()
    for nummer, stap in enumerate(stappen, 1):
        zeg(f"  {nummer}  {stap.titel:<38} {stap.waarom}")
    zeg()
    zeg("Alles wat je moet weten komt hieronder voorbij. Gaat er iets mis, dan stopt dit")
    zeg("script meteen en staat er wat je eraan kunt doen.")
    zeg()

    klachten = controleer_vooraf(stappen)
    if klachten:
        zeg()
        lijn("=")
        zeg("ZO KAN HET NIET BEGINNEN — er is nog niets gedraaid en niets gewijzigd.")
        lijn("=")
        for klacht in klachten:
            zeg()
            for nummer, alinea in enumerate(klacht.splitlines()):
                if nummer:
                    zeg(alinea)
                    continue
                for regelnr, regel in enumerate(textwrap.wrap(alinea, BREED - 6)):
                    zeg(f"  {'·' if regelnr == 0 else ' '} {regel}")
        zeg()
        return 2
    zeg("  alles in orde.")

    voor = momentopname()
    begin = time.monotonic()

    for nummer, stap in enumerate(stappen, 1):
        extra: list[str] = []
        if stap.sleutel == "feed":
            if args.replica:
                extra += ["--replica", args.replica]
            if args.dump_datum:
                extra += ["--dump-datum", args.dump_datum]
            if args.basis_url:
                extra += ["--basis-url", args.basis_url]
            if args.no_interactive:
                extra.append("--no-interactive")
        elif stap.sleutel == "fotos" and args.opnieuw_fotos:
            extra.append("--opnieuw")
        elif stap.sleutel == "ov" and args.vernieuw_ov:
            extra.append("--vernieuw")

        code = draai(stap, nummer, len(stappen), extra)
        if code != 0:
            resterend = ",".join(s.sleutel for s in stappen[nummer - 1:])
            zeg()
            lijn("=")
            zeg(f"GESTOPT BIJ STAP {nummer} — {stap.titel}")
            lijn("=")
            zeg()
            zeg("  De stappen hierna zijn NIET gedraaid: die bouwen hierop voort, en met een")
            zeg("  half resultaat verder gaan levert een kaart op die niet klopt.")
            zeg()
            zeg("  Wat nu:")
            zeg("  1. Lees de laatste regels hierboven. Daar staat wat er precies misging — de")
            zeg("     scripts zeggen dat in gewone taal.")
            if stap.sleutel == "feed":
                zeg("  2. Faalde de controle of de privacyscan, dan is er NIETS weggeschreven.")
                zeg("     De vorige feed staat er nog, ongeschonden. Dat is opzet, geen bug.")
            elif stap.netwerk:
                zeg("  2. Dit script heeft internet nodig. Was de verbinding even weg, dan is")
                zeg("     opnieuw draaien vaak genoeg — wat al gelukt was wordt overgeslagen.")
            zeg("  3. Los het op en start opnieuw:   py scripts/bijwerken.py")
            zeg(f"     Of alleen wat nog moet:        py scripts/bijwerken.py --alleen {resterend}")
            zeg()
            return code

    na = momentopname()

    zeg()
    lijn("=")
    zeg(f"ALLES BIJGEWERKT — {duurtekst(time.monotonic() - begin)}")
    lijn("=")
    zeg()
    gewijzigd = [p for p in UITVOER if voor[p] != na[p]]
    if gewijzigd:
        zeg("  Deze bestanden zijn veranderd:")
        for p in gewijzigd:
            zeg(f"    {p:<38} {'nieuw' if voor[p] is None else 'gewijzigd'}")
        ongemoeid = [p for p in UITVOER if voor[p] == na[p] and na[p] is not None]
        if ongemoeid:
            zeg(f"  De overige {len(ongemoeid)} zijn onveranderd gebleven.")
    else:
        zeg("  Geen enkel bestand is veranderd. Dat kan kloppen: dezelfde dump erin betekent")
        zeg("  byte-voor-byte dezelfde feed eruit.")
    zeg()
    zeg("  Kijk even of het klopt vóór je publiceert:")
    zeg("     py -m http.server 8000")
    zeg("  en open dan http://localhost:8000/map/ in je browser.")
    zeg("  Staan de auto's op de kaart en opent er een popup als je erop klikt? Dan is het goed.")

    if args.publiceer:
        return publiceer(vraag=False)
    if args.niet_publiceren or not interactief:
        zeg()
        zeg("  Er staat nog niets online. Publiceren doe je met:")
        zeg("     py scripts/bijwerken.py --alleen-publiceren")
        return 0
    return publiceer(vraag=True)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        zeg()
        zeg("Afgebroken. Wat al klaar was blijft staan; opnieuw draaien pakt het gewoon op.")
        sys.exit(130)
