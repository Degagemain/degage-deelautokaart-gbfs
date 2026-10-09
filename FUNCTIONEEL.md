# Wat de kaart doet

Een beschrijving van de deelautokaart zoals een bezoeker haar tegenkomt: wat er te
zien is, wat je ermee kunt, en welke keuzes daarachter zitten. Zonder code.

Wie wil weten *hoe* het gebouwd is, leest [`TECHNIEK.md`](TECHNIEK.md). Wie de feed wil
gebruiken, leest `gbfs/index.html`.

---

## Waar de kaart voor dient

De kaart laat zien **waar de auto's van Dégage staan**. Meer niet, en dat is een bewuste
grens: ze toont géén beschikbaarheid. Welke auto op dit moment vrij is, weet de kaart
niet en kan ze niet weten — die informatie zit in het reservatiesysteem en niet in de
gegevens waarop deze kaart draait.

Daarom staat er standaard een regel in beeld:

> **Geen live beschikbaarheid:** je ziet waar de auto's staan, niet of ze vrij zijn.

Wie ze gelezen heeft, kan ze wegklikken met het kruisje. De kaart vraagt eerst een
bevestiging, en in de instellingen zet je ze terug. Je browser onthoudt die keuze.

**Welke auto's er zijn en waar ze staan, is live.** Bij elk openen vraagt de kaart de
actuele vloot op bij Dégage zelf (zie [De live vloot](#de-live-vloot-welke-autos-er-zijn)).
De **details** van elke auto — merk, model, bouwjaar, toebehoren, gemeente — komen uit
een bestand dat **per kwartaal met de hand** ververst wordt.

Naast de teller staat daarom **geen datum**: wat je op de kaart ziet, klopt met vandaag.
Een datum daar zou doen denken dat het beeld oud is. Hoe oud de details zijn, is een
voetnoot en staat in de instellingen (het tandwiel): *"De auto's en hun standplaats zijn
actueel. Merk, model en toebehoren zijn bijgewerkt op 31 juli 2026."*

Lukt het live opvragen niet, dan toont de kaart gewoon dat bestand. Dan is heel het beeld
van die datum, en staat ze wél naast de teller: *"577 auto's · bijgewerkt 31 juli 2026"*.

## De live vloot: welke auto's er zijn

De lijst van Dégage op
[`degapp.be/api/v1/car/stands`](https://degapp.be/api/v1/car/stands) is **de enige
waarheid** over welke auto's er zijn en waar ze staan. Daaruit volgen drie regels:

1. **Staat een auto niet in die lijst, dan bestaat hij niet.** Ook als hij nog in het
   kwartaalbestand staat: hij verdwijnt van de kaart, uit de teller, uit de filters en uit
   de zoekresultaten.
2. **Staat een auto er wél in maar niet in het kwartaalbestand, dan is hij nieuw.** Hij
   komt op de kaart, met een groen label **"Nieuwe auto"** in de popup (en in de lijst
   met dichtstbijzijnde auto's) waar anders merk en model staan.
3. **Is een auto verhuisd, dan staat hij meteen op zijn nieuwe plek.**

**Een nieuwe auto toont alleen wat de live lijst over hem weet:** zijn naam, zijn
brandstof en zijn versnellingsbak. Al de rest — merk, model, bouwjaar, zitplaatsen,
euronorm, toebehoren, gemeente, district, contactadres, modelfoto, rijbereik, openbaar
vervoer — kent de live lijst niet, en **dat laten we gewoon weg**. Er wordt niets
bijgeraden. De popup zegt: *"Merk, model en de andere details volgen bij de volgende
bijwerking van de kaart."* Bij de volgende
kwartaalverversing staat hij in het bestand en verdwijnt het label vanzelf.

Wat dat betekent voor de filters: zet je een filter op iets wat we van een nieuwe auto
niet weten (zitplaatsen, bouwjaar, soort auto, euronorm, een toebehoren, afstand tot het
openbaar vervoer), dan valt hij af — net als een auto waarvan de euronorm onbekend is. Van
een auto waarvan we het niet weten, kunnen we niet volhouden dat hij voldoet. Op brandstof
en versnellingsbak filter je hem wel gewoon, en bij de prijsklasse staat hij onder
*"Prijsklasse onbekend"*.

**De stip van een nieuwe of verhuisde auto wordt op precies dezelfde manier vervaagd** als
alle andere: twintig meter opzij, in een vaste richting die uit het punt zelf volgt (zie
[Wat je ziet](#wat-je-ziet)). Een auto die niet verhuisd is, houdt zijn vertrouwde stip.

Hoe een auto uit de live lijst herkend wordt als een auto uit het bestand, en de andere
technische keuzes, staan in [`TECHNIEK.md`](TECHNIEK.md#de-live-vloot).

## Wat je ziet

De kaart opent op een beeld van ongeveer 25 kilometer rond Gent — daar staat het grootste
deel van de vloot. Met de knop **"Alles in beeld"** rechtsboven zoom je uit tot heel
Vlaanderen.

**De stippen** zijn standplaatsen. Eén stip is één adres; staan er twee auto's op
hetzelfde punt, dan is dat één stip die er twee draagt.

**Een stip staat met opzet niet precies goed.** Elke standplaats is twintig meter opzij
gezet, in een richting die je niet kunt terugrekenen. Bij de meeste auto's is de
standplaats namelijk het huis van de eigenaar, en een coördinaat op de meter nauwkeurig
wijst dan één voordeur aan. Je vindt de auto er nog steeds mee — je vindt er niet mee in
welk huis de eigenaar woont. Dat staat ook in elke popup.

| | |
|---|---|
| groene stip | een standplaats die past bij wat je gefilterd hebt |
| blauwe stip | idem, met een elektrische auto |
| grijze stip | een standplaats die door je filters is afgevallen |

Grijze stippen blijven staan als context — je ziet dus wat je wégfiltert, niet alleen wat
overblijft. Wie dat liever niet heeft, zet het uit met de schakelaar boven de filters.

**De bollen met een getal** zijn groepjes standplaatsen die te dicht bij elkaar liggen om
apart te tonen. Klik erop of zoom in en ze vallen uiteen. Staat er een filter aan, dan
toont de bol twee getallen — *hoeveel er passen* van *hoeveel er staan*.

**De autonamen** verschijnen naast de stippen zodra er weinig genoeg losse stippen in beeld
staan — hoogstens een veertigtal — hoe ver je ook uitgezoomd bent. Boven een dorp staan ze
er dus al op het startbeeld, boven Gent pas als je inzoomt; vanaf buurtniveau staan ze er
altijd. Stippen in een cluster en grijze stippen krijgen geen naam.

## De popup: wat er op een standplaats staat

Klik op een stip, op een auto in de balk of op een zoekresultaat, en je krijgt **die ene
auto** te zien. Wie op één auto klikt, verwacht er ook maar één. Bij een klik op de stip
is dat de eerste auto die door je filters komt.

Staan er op dezelfde plek nog andere auto's (het gaat om een handvol standplaatsen), dan
staat onderaan *"Op deze plek staat ook:"*, met hun namen als knop. Eén klik en die auto
staat in de popup. Zo zie je nog altijd wat er werkelijk staat, ook de auto's die door je
filter zijn afgevallen.

Wie ze liever samen ziet, zet in de instellingen (het tandwiel) **"Auto's op dezelfde plek
samen tonen"** aan. Dan toont de popup alle auto's van de standplaats onder elkaar. Elke
auto draagt zijn eigen gegevens, dus verwarring is niet mogelijk. Standaard staat dat uit.

Per auto:

- de **naam** van de auto met de gemeente tussen haakjes — *"Carlascar (Gent)"* — en
  daaronder merk, model en bouwjaar: *"Ford Fiesta · 2014"*. De gemeente staat in de
  bron vaak in hoofdletters of juist helemaal klein ("GENTBRUGGE", "gent"); de feed zet
  dat al recht bij het samenstellen: "Gentbrugge", "Gent", "Heist-op-den-Berg".
- een **foto van het model** — nadrukkelijk niet van deze auto (zie hieronder)
- de feiten die we zeker weten: aantal zitplaatsen, brandstof, versnellingsbak, prijsklasse en
  euronorm
- de **toebehoren en afspraken** die deze auto heeft: trekhaak, fietsdrager, kinderzitje,
  gps, bed, aanhangwagen, en of er huisdieren mee mogen of mee leren rijden mag
- bij een elektrische auto: het **rijbereik** (zie hieronder)

Waar een getal uitleg nodig heeft — het rijbereik en de Mobiscore — staat er een
**ⓘ-knopje** naast. Daarachter staat wat het getal betekent en waar het vandaan komt;
wie het niet nodig heeft, leest een rustige popup.

Het **district** staat erbij als dat iets toevoegt aan de gemeente: links in de voetregel
van het blok met het openbaar vervoer, met de Mobiscore rechts ernaast — allebei gaan ze
over de plek. Zonder gegevens over openbaar vervoer krijgt het een eigen regel.

Helemaal onderaan staat de **oproep om lid te worden**, in een groen kader zodat ze
opvalt: *"**Zin gekregen om mee te delen?** Word lid van Dégage! 🚗"*, met twee knoppen,
**Onze tarieven** en **Veelgestelde vragen**.

**Over het rijbereik.** Het rijbereik staat nergens in de gegevens van Dégage, dus het komt
van buiten: uit [Open EV Data](https://github.com/KilowattApp/open-ev-data), een open
databank van elektrische auto's. Het is een **schatting bij gemengd gebruik** — bruikbare
batterij gedeeld door gemiddeld verbruik — en géén WLTP-cijfer; dat ligt meestal hoger.

Het bereik hangt aan de batterijversie, en die staat bij de meeste auto's niet in de
gegevens. Een Renault Zoe had 22, 41 of 52 kWh, en dat scheelt de helft. Daarom:

- staat de batterij in de naam van het model ("Zoé R110 41kWh"), dan is de versie bekend
  en staat er **één getal**: *± 250 km bereik*;
- anders staat er een **marge** van de kleinste tot de grootste versie: *130–320 km
  bereik*. Dat is breed, maar het klopt — een enkel getal zou voor een deel van de auto's
  gewoon fout zijn.

Het **bouwjaar** telt mee, met drie jaar speling naar elke kant: een Zoe van 2021 kan geen
eerste versie met 22 kWh meer zijn, dus die krijgt 250–320 km in plaats van 130–320. De
speling is er omdat de jaartallen in de bron niet altijd kloppen — een e-Berlingo die er
als 2024 staat, reed al eind 2021 — en een strenger filter gaf in de proef een vals exact
getal. Van drie
modellen staat er geen bereik — die zitten niet in de bron, en dan is niets tonen beter
dan gokken.

**Over de foto's.** Het is een foto van hetzelfde model, van iemand anders, onder een vrije
licentie. Dat staat er letterlijk bij, samen met de naam van de maker en de licentie — dat
is geen beleefdheid maar een voorwaarde van die licentie. Op een breed scherm staat die
vermelding verticaal langs de rechterrand van de foto, van onder naar boven te lezen; zo
blijft de popup smal zonder dat de foto kleiner wordt. Op een telefoon staat ze eronder. Is er voor een model geen
bruikbare foto, dan verschijnt er een tekening van een auto. Een foto van de verkeerde
auto tonen is erger dan geen foto.

**De popup krijgt nooit een scrollbalk.** Past hij niet in de ruimte die er is — een
standplaats met drie auto's, of een laag venster — dan wordt de hele popup evenredig
kleiner tot hij past. Leesbaar blijft hij altijd: kleiner dan 60% gaat hij niet.

**Dat de locatie bij benadering is**, staat niet in elke popup maar in *"Goed om te
weten"* bij het openen: *"Locaties bij benadering, vanwege privacy."* Hoe ver een
stip verschoven is, zegt de kaart bewust niet. Dat venster gaat na vijftien
seconden vanzelf dicht, zonder balkje dat aftelt, zodat niemand zich opgejaagd voelt bij
het lezen; staat je muis erop, dan wacht het. Eerder dicht kan met het kruisje of Escape,
en het gaat ook dicht zodra je de filters opent: wie begint te zoeken of te
filteren, heeft het gelezen of wil verder. Bij het sluiten krimpt het naar het
ⓘ-knopje onder het tandwiel, dat één keer oplicht; met dat knopje haal je het terug.

**Wat er níét in de popup staat:** niets over de eigenaar. Geen naam, geen e-mailadres,
geen telefoonnummer. Het enige adres dat getoond wordt, is dat van de lokale groep.

## Openbaar vervoer en Mobiscore

Onder de auto's staat hoe ver het openbaar vervoer is en hoe vaak er iets vertrekt: de
dichtste **bushalte**, de dichtste **tramhalte** en het dichtste **station**, dezelfde drie
als in het filter. Per halte één regel: een groot pictogram, de frequentie groot ernaast,
en rechts de afstand. Onderaan, klein, het district en de Mobiscore:

> 🚌 **7×** per uur ……………………………… **0,2 km**  
> 🚋 **7×** per uur ……………………………… **0,3 km**  
> 🚆 **14×** per uur ……………………………… **1,9 km**  
> 📍 Gent - Watersportbaan Ekkergem ………… Mobiscore 9,4 / 10 ⓘ

Op een breed scherm staan bus, tram en trein naast elkaar, met de afstand onder de
frequentie, en komen het district en de Mobiscore daaronder te staan. Het blijft één regel
over de plek: de Mobiscore is geen score van het station.

De tram staat **van opzij** getekend, met de bovenleiding erboven; bus en trein staan van
voren. Zo zijn de drie in één oogopslag uit elkaar te houden.

Welke halte of welk station het is, staat in de alt-tekst van het pictogram — *"Bushalte:
Zevergem Zevergemdorp"*, *"Treinstation: Melsele"*. Met de muis erover zie je die als
tooltip, en een schermlezer leest ze voor. Zo blijft de popup rustig.

Trams rijden alleen in Gent, Antwerpen en aan de kust. Ligt er geen tramhalte binnen tien
kilometer, dan staat er een streepje (—) waar de frequentie zou staan; de tooltip en de
schermlezer zeggen *"Geen tramhalte binnen 10 kilometer"*. Voor een ontbrekende bushalte
geldt hetzelfde. De regel met het
station staat er alleen als er een binnen tien kilometer ligt — en dat is bij elke
standplaats zo.

De afstanden staan altijd in kilometer, op één decimaal, zodat halte en station naast
elkaar te vergelijken zijn.

De frequentie is het aantal vertrekken per uur, **per richting**. Rijdt er minder dan één
per uur, dan staat er "<1× per uur". Bij de bus tellen alleen de bussen, bij de tram alleen
de trams, ook als ze aan dezelfde halte stoppen.

**De Mobiscore** is de officiële score van de Vlaamse overheid (Departement Omgeving) — de
score die je ook bij een woning op Immoweb ziet. Ze meet hoe dicht een plek ligt bij vijf
soorten voorzieningen, te voet of met de fiets: **openbaar vervoer, onderwijs, winkels en
diensten, vrije tijd en cultuur, en zorg**, telkens met de gemiddelde afstand tot de vier
dichtstbijzijnde. Van 0 tot 10; hoger is beter. Wij rekenen niets zelf uit: we lezen de
score van de hectare waarin de standplaats ligt, uit de open kaartlaag van de overheid.

Twee kanttekeningen:

- Er is alleen een **totaalscore**. De deelscores per soort voorziening die de
  Mobiscore-site bij een adres toont, staan niet in de open gegevens.
- De score hoort bij de **stip**, en die staat met opzet twintig meter naast de
  standplaats. Op cellen van honderd meter kan dat de buurcel zijn; die verschilt zelden
  meer dan een paar tienden.

**De regels eronder** zijn onze eigen feiten, voor het deel dat over openbaar vervoer gaat —
ze zeggen *waarom* een plek scoort zoals ze scoort:

- **De dichtste bushalte en de dichtste tramhalte met vaste lijnen**, elk apart, en
  hoeveel bussen of trams er daar per uur **per richting** vertrekken — wat je ervaart als
  je aan de halte staat.
  De twee kanten van de straat zijn de twee richtingen; we tonen de drukste kant. De naam
  van de halte en het aantal haltes in de buurt staan er bewust niet bij: wie een plek
  beoordeelt, wil weten of er iets rijdt en hoe vaak.
- **Het dichtste station** — daar fiets of rijd je naartoe — en ongeveer hoeveel treinen er per uur
  **per richting** stoppen: alle treinen van het station gedeeld door twee. Per perron
  tellen gaat daar niet — een groot station heeft een tiental perrons — dus het is een
  benadering.
- Afstanden staan voluit en afgerond: op tientallen meters onder de kilometer, op een halve
  kilometer daarboven.
- Geteld op **een gewone weekdag, van 7 tot 19 uur**, in **vogelvlucht**.
- Een halte waar op die dag niets stopt, telt niet mee: die staat wel op de kaart van De
  Lijn, maar je kunt er niet opstappen.
- **Flexvervoer telt niet mee.** De bus op afroep van De Lijn staat niet in een
  dienstregeling. Waar alleen nog een flexbus rijdt, staat er dus geen halte met vaste
  lijnen — ook als je er wel een bus kunt bellen.

De Mobiscore komt van het Departement Omgeving; de haltes en treinen uit de dienstregelingen
van **De Lijn** en de **NMBS**. Alles wordt bij elke verversing van de kaart opnieuw
opgehaald.

## Zoeken

Eén veld bovenaan, voor twee soorten vragen.

**Een autonaam.** Tik "Poloke" en je komt bij die auto uit, met zijn popup open. Zijn er
meerdere auto's waarvan de naam daarop lijkt, dan komen ze allemaal in de lijst onderaan
en brengt de kaart ze samen in beeld.

Filters tellen bij een naamzoekopdracht **niet** mee. Wie een naam intikt, zoekt één
bepaalde auto; die verbergen omdat er toevallig een brandstoffilter aanstaat, zou als een
fout voelen.

**Een adres of gemeente.** Tik "Melle" of "Korenmarkt 1, Gent" en de kaart springt erheen,
zet er een rood ringetje neer en toont de dichtstbijzijnde auto's eronder.

Levert het niets op, dan zegt de kaart dat, met een suggestie: probeer een gemeente, of
straat plus gemeente. Bestaat het adres niet maar lijken er wél autonamen op wat je typte,
dan toont ze die alsnog — beter dat dan je met lege handen laten staan.

**Of je eigen locatie.** Naast de zoekknop staat een knopje met een vizier: *"Auto's in
mijn buurt"*. Daarmee vraagt de kaart je positie aan de browser, zet er een blauwe stip
neer en toont de dichtstbijzijnde auto's eronder. Je browser vraagt eerst om toestemming —
zonder toestemming gebeurt er niets en zegt de kaart dat.

Twee dingen die de kaart daarbij eerlijk benoemt:

- **Hoe nauwkeurig je positie is.** Op een telefoon met gps is dat een meter of tien; op
  een computer zonder gps komt ze uit het netwerk en kan ze kilometers naast zitten. De
  kaart zoomt dan navenant minder ver in, en zegt erbij hoe ruim de schatting is.
- **Of er wel iets in je buurt staat.** De vloot staat in Vlaanderen. Kijk je van verder,
  dan zegt de kaart hoe ver de dichtstbijzijnde auto staat, zodat een lijst met auto's op
  zestig kilometer niet leest als "hier vlakbij".

Het zoekveld is meteen de sleutel tot de filters: erin klikken opent de filterlijst
eronder. Je hoeft er zelfs niet in te klikken: begin gewoon te typen, en je letters komen
in het zoekveld terecht en de filters gaan open.

## De lijst met dichtstbijzijnde auto's

Onderaan verschijnt een balk met de **vijf dichtstbijzijnde auto's**, met per auto de
naam, het model, de gemeente, de brandstof en de afstand in vogelvlucht.

De balk begint rechts van het paneel en blijft daar, of de filters nu open staan of niet:
zo verspringt er niets onder je cursor op het moment dat je ze openklapt. Links ervan is
gewoon kaart — je kunt daar slepen en zoomen alsof er niets staat. Is het paneel
geminimaliseerd, dan komt die plaats vrij en loopt de balk door tot de linkerrand.

De balk is ook niet breder dan wat erin staat: twee auto's leveren een doosje van twee
kaartjes, geen lege strook over de hele kaart. Er komt nooit een schuifbalk — hoeveel
kaartjes er passen hangt af van de plaats die er is, en wat er niet meer bij kan valt weg,
de verste auto eerst. Op een smal scherm zie je er dus twee of drie.

Die balk komt op twee manieren tevoorschijn:

- **na een zoekopdracht of na "Auto's in mijn buurt"** — dan meet ze vanaf dat punt;
- **vanzelf, zodra er weinig genoeg auto's in beeld staan.** Niet op zoomniveau, want dat
  zegt niets over wat je ziet: boven een dorp staan er op hetzelfde zoomniveau vijftig
  auto's in beeld en boven Gent vierhonderd. De vraag die telt is of "de vijf dichtste"
  een antwoord is of een willekeurige greep.

**De lijst volgt je muis.** Beweeg over de kaart en de volgorde schuift mee met waar je
wijst: zo wijs je een buurt aan en zegt de balk meteen wat daar staat, zonder te klikken
of te pannen. Ga je snel ergens naartoe — bijvoorbeeld naar de balk zelf om een kaartje
aan te klikken — dan blijft de lijst staan. Anders zou het kaartje waar je op mikte
verdwenen zijn tegen de tijd dat je er bent.

**De lijst volgt je filters.** Zet je "bestelwagen" aan, dan staan er meteen de vijf
dichtstbijzijnde bestelwagens — ook als de balk uit een adreszoekopdracht of uit "auto's
in mijn buurt" komt. De enige uitzondering is een zoekopdracht op autonaam: die negeert
de filters met opzet, en dan blijft de lijst dus staan zoals ze staat.

Klik op een kaartje en de kaart gaat naar die auto en opent zijn popup. Nog eens klikken
sluit de popup weer. Zolang die popup openstaat, staat de lijst stil — een lijst hoort
niet te bewegen terwijl je leest wat je er net uit geopend hebt.

Wie op een aanraakscherm werkt, heeft geen muis: dan meet de balk gewoon vanaf het midden
van de kaart. Ook uit te zetten in de instellingen.

## Filteren

De filters staan onder het zoekveld en klappen open zodra je in dat veld klikt of begint
te typen. Ze gaan weer dicht met een klik op de kaart, met Escape, en zodra je in de kaart
scrollt of veegt — dat laatste is uit te zetten met de schakelaar boven de filters.

Onderaan de lijst staat **Meer filters**, een uitklapper met de filters waar de meeste
bezoekers niet naar zoeken; standaard de euronorm en het bouwjaar. Zo duwen ze de rest
niet uit beeld. Staat er in een filter onder *Meer filters* iets aan, dan zegt een
groen bolletje met een getal naast *Meer filters* hoeveel, ook als de uitklapper dicht is.

Welke filters er staan, en welke daarvan onder *Meer filters*, kiezen de beheerders op de
beheerpagina (`/beheer/kaartfilters` op de Worker, zie `feedback-worker/README.md`), en
ook welke keuzes erin staan — zo staan
*bed* en *aanhangwagen* niet bij de toebehoren. Een uitgezet filter of keuze verdwijnt uit
de lijst; de auto's blijven gewoon op de kaart. Een uitgezet toebehoren of afspraak staat
ook niet in de popup van een auto. Een wijziging is binnen een minuut zichtbaar, zonder
de kaart opnieuw te publiceren. Antwoordt de Worker niet, dan staan alle filters er, met
euronorm en bouwjaar onder *Meer filters*.

| filter | wat het doet |
|---|---|
| **Soort auto** | personenwagen of bestelwagen |
| **Prijsklasse** | de prijsklasse van Dégage, A of B, of *onbekend* voor een auto waarvan we ze niet kennen (zoals een nieuwe auto). Achter de ⓘ staat dat B meer per kilometer kost dan A; bedragen staan er niet, die veranderen per kwartaal |
| **Zitplaatsen** | een ondergrens: "vanaf 5 plaatsen" toont ook de zeven- en negenzitters |
| **Brandstof** | benzine, diesel, elektrisch, hybride, plug-in hybride, CNG, LPG |
| **Versnellingsbak** | manueel of automatisch |
| **Toebehoren** | trekhaak, fietsdrager, kinderzitje, gps, bed, aanhangwagen |
| **Afspraken** | huisdieren toegelaten, leren autorijden |
| **Openbaar vervoer** | bus, tram en trein; per modus de afstand (bovengrens) en de frequentie (ondergrens). Geldt voor de standplaats, niet voor de auto |
| **Euronorm** | een schuif met twee bolletjes: van welke tot welke norm, met elektrisch bovenaan (zie hieronder) |
| **Bouwjaar** | een ondergrens: "vanaf 2018" toont 2018 en later |

**Het filter Openbaar vervoer** hoort bij de standplaats en niet bij de auto: het is er
voor wie de auto met bus, tram of trein combineert — heen met de deelauto, terug met de
trein, of een auto zoeken die te voet vanaf de halte te bereiken is. Er zijn drie modi,
**Bus**, **Tram** en **Trein**, elk met twee schuiven:

- **de afstand** tot de dichtste halte of het dichtste station, als bovengrens:
  "hoogstens 500 meter". In vogelvlucht; te voet is de weg altijd wat langer. Helemaal
  links staat **"elke afstand"**, en daar staat hij als je niets instelt; daarna volgen de
  afstanden van klein naar groot, te beginnen bij 250 meter.
- **de frequentie** daar, als ondergrens: "minstens 4× per uur", per richting, op een
  gewone weekdag — dezelfde getallen als in de popup. Links staat "elke frequentie", naar
  rechts wordt het strenger.

Er is geen vakje om een modus aan te zetten: een modus filtert zodra je één van zijn
schuiven verzet, en wat er ingesteld is, zie je aan de schuiven zelf. Het streepje links
van een modus wordt dan groen. Staan beide schuiven op "elke", dan filtert die modus niet.

Bus en tram zijn elk hun eigen halte: bij **Tram** telt de dichtste halte waar een tram
stopt, ook als er een bushalte dichterbij ligt. Trams rijden alleen in Gent, Antwerpen en
aan de kust; daarbuiten is de dichtste tramhalte meestal tientallen kilometers ver. (De
popup toont dezelfde bushalte, tramhalte en hetzelfde station.)

Stel je er meer in, dan volstaat er één: een standplaats bij een goede bushalte komt
erdoor, ook als het station ver is. Wil je dat ze aan allemaal voldoet, zet dan **Aan alle
ingestelde voldoen** aan; die schakelaar verschijnt zodra er twee of meer modi ingesteld
zijn.

De schuiven tonen alleen standen die iets doen: ligt élke standplaats binnen twee kilometer
van een halte, dan begint de afstandsschuif daar en niet bij tien kilometer. Een standplaats
waar geen halte of station van gemeten is, voldoet nooit aan die modus — we weten dan niet
of ze eraan voldoet. "Filters wissen" zet alle schuiven terug op "elke".

**Hoe ze samenwerken.** Binnen één groep is het "of" — vink je benzine én diesel aan, dan
zie je allebei. Tussen groepen is het "en" — een bestelwagen op diesel moet aan allebei
voldoen. De toebehoren zijn de uitzondering: daar geldt ook binnen de groep "en", want
"met trekhaak én fietsdrager" is wat je bedoelt als je die twee aanvinkt.

De teller bovenaan zegt hoeveel er overblijven: *"12 van 568 auto's"*. Blijft er niets
over, dan staat dat er ook. Zodra er iets te wissen valt, verschijnt rechts naast die teller
— onder de minimaliseerknop — een trechter met een kruisje: **"Filters wissen"**. Zijn
plaats blijft ook leeg bewaard als er niets te wissen valt, zodat er niets verspringt.

**Waarom je niet op afwezigheid kunt filteren.** Er is geen "toon auto's zónder trekhaak".
In de brondata is een leeg vakje dubbelzinnig: het kan "niet aanwezig" betekenen, of
"nooit ingevuld". Die twee zijn niet uit elkaar te houden, en een filter op afwezigheid
zou dus onwetendheid als feit presenteren. Om dezelfde reden zie je nooit "trekhaak: nee"
in een popup — alleen wat er wél is.

**De euronorm, en waarom elektrisch bovenaan staat.** De euronorm is voor wie kijkt een
schaal van vuil naar schoon. Een elektrische auto hoort aan de schone kant, maar draagt
in de brongegevens vaak helemaal geen norm — die schaal is nu eenmaal voor
verbrandingsmotoren gemaakt. Zonder ingreep zouden juist de schoonste auto's uit het
filter vallen, en dat leest als een fout in de kaart. Ze krijgen daarom een eigen trede
bovenaan, met een eigen naam: *"elektrisch"*. Nadrukkelijk geen verzonnen
"Euro 7" — die norm bestaat echt en komt eraan.

Hybrides en plug-in hybrides staan **niet** bovenaan: ze hebben een verbrandingsmotor en
dus een echte euronorm, en die telt. Een hybride met Euro 4 is niet schoner dan een
diesel met Euro 6. Een hybride zonder gekende norm is onbekend, zoals elke andere auto
zonder norm. Bij een elektrische auto toont de popup geen euronorm: staat er toch een in
de brongegevens, dan is dat een fout, en die staat op de beheerpagina bij de datafouten.

De schuif heeft twee bolletjes: het linkse is de laagste norm, het rechtse de hoogste.
Zo kies je *"Euro 5 en hoger"* (rechts helemaal rechts laten), maar ook *"enkel Euro 3"*
(beide bolletjes op Euro 3) of *"Euro 3 tot en met Euro 5"*. De bolletjes kunnen elkaar
niet voorbij. Elk bolletje is apart met het toetsenbord te bedienen (Tab, pijltjes, Home
en End).

Van zestig auto's kennen we de euronorm niet. Die zie je alleen bij de stand "maakt niet uit",
met beide bolletjes aan de uiteinden: van een auto zonder gekende norm weet je niet of
hij binnen de gekozen normen valt.

## Een schakelaar bij de filters

Bovenaan de filterlijst, net boven *"Soort auto"*, staat **Filters sluiten bij scrollen in
de kaart**. Uit betekent dat de filters open blijven terwijl je met het wieltje zoomt of de
kaart met je vingers verschuift. Op een telefoon staat hij achter het tandwiel.

## Instellingen

Achter het tandwiel bij de zoomknoppen:

- **Lijst dichtstbijzijnde auto's volgt muis** — uit betekent dat de balk vanaf het midden
  van de kaart meet en blijft staan.
- **Lijst dichtstbijzijnde auto's tonen** — uit laat de balk helemaal weg, ook na een
  zoekopdracht of bij het inzoomen. Voor wie de kaart zelf wil lezen zonder een balk
  onderaan.
- **Gefilterde auto's grijs tonen** — uit betekent dat weggefilterde standplaatsen echt
  verdwijnen in plaats van grijs te blijven staan. Aan zegt een grijze pin ook waarom:
  wie met de muis erover gaat, ziet per auto welke filters hem tegenhouden
  (*"Brandstof: benzine · Bouwjaar: 2012"*), en in de popup staat hetzelfde onder de naam
  van de auto. Een ontbrekend toebehoren heet daar "niet vermeld", nooit "nee".
- **Melding over beschikbaarheid tonen** — zet de regel *"Geen live
  beschikbaarheid"* terug nadat je hem weggeklikt hebt, of haalt hem weg.
- **Taal** — Nederlands, Français of English.

Het paneel linksboven kun je **minimaliseren** met de knop naast het zoekveld; er blijft
dan alleen een hamburgerpictogram over en de kaart komt helemaal vrij. Nog eens klikken
brengt het terug, met de cursor meteen in het zoekveld en de filters open. Typen doet
hetzelfde. Op een telefoon of tablet komt alleen het paneel terug: de cursor in het
zoekveld zou daar het schermtoetsenbord openen — maar stonden de filters open toen je
minimaliseerde, dan staan ze bij het terughalen weer open. Wie het paneel wegklapt om even
de kaart te zien, is niet klaar met filteren.

## Talen

De kaart spreekt **Nederlands, Frans en Engels**, en kiest zelf:

1. staat er `?taal=fr` in het adres, dan die — zo kan de pagina waarin de kaart is
   ingebed haar eigen taal meegeven;
2. anders de taal die je eerder zelf koos (die onthoudt je browser);
3. anders de taal van je browser;
4. anders Nederlands.

Wisselen kan altijd in de instellingen, en dat gaat zonder herladen: je filters, je
zoekresultaat en je positie op de kaart blijven staan.

De kaartbediening van Leaflet vertaalt mee (de tekstballonnen bij inzoomen en uitzoomen,
het sluitkruisje van een popup), net als de bronvermelding van OpenStreetMap onderaan.

**Wat niet meevertaalt:** de namen van de auto's, de merken en modellen, eigennamen als
Dégage en OpenStreetMap, en de euronormen — "Euro 5" heet overal Euro 5.

**De plaatsnamen óp de kaart.** In het Frans toont de kaart de tegels van OpenStreetMap
France, met de Franse naam waar die bestaat: "Gand", "Anvers", "Courtrai". In het
Nederlands en het Engels blijven het de standaardtegels met de plaatselijke namen — voor
Engelse namen bestaat er geen vrij bruikbare kaart. Straatnamen blijven overal zoals ze
ter plaatse heten. Valt de server van OpenStreetMap France uit, dan valt de kaart terug op
de standaardtegels.

## Op een telefoon

Het paneel ligt bovenaan over de volle breedte, de zoomknoppen staan linksonder waar de
duim zit, en de lijst met dichtstbijzijnde auto's loopt van rand tot rand. Klap je de
filters open terwijl die lijst er staat, dan gaat ze zolang helemaal weg: paneel en lijst
liggen hier boven elkaar en laten samen nauwelijks kaart over. Ze komt ongewijzigd terug
zodra de filters dichtgaan. De lijst volgt daar geen muis — die is er niet — en meet vanaf
het midden van de kaart.

Een popup valt op een telefoon nooit meer half buiten beeld. De knop **"Probleem of feedback"**
gaat zolang weg — die stond er precies in de weg — en past de popup ook dan niet tussen het
paneel en de lijst, dan neemt hij de plaats van de lijst in en stapt die zolang opzij.
Allebei komen ze terug zodra je de popup sluit. Blijft er nog te weinig plaats, dan schuift
de inhoud binnen de popup zelf.

## Iets melden

Rechtsboven staat **"Probleem of feedback"**. Dat is er voor wie ziet dat een auto op de
verkeerde plaats staat, dat er iets niet werkt, of wie gewoon een idee heeft.

De knop opent een formulier op de kaart zelf: waarover het gaat, een beschrijving, en
versturen. **Je hebt er geen GitHub-account voor nodig** — dat was de hele reden om het zo
te bouwen. Het formulier staat in dezelfde drie talen als de rest van de kaart.

**Wat je invult, wordt publiek.** Het komt als een openbaar issue op GitHub terecht, waar
iedereen het kan lezen. Dat staat bovenaan het formulier in een gele kader, en je moet
onderaan aanvinken dat je het begrepen hebt voor je kunt versturen. Vandaar ook de vraag om
geen persoonlijke gegevens in de beschrijving te zetten: geen naam, adres, telefoonnummer, e-mailadres
of lidnummer. Wil je iets melden dat niet publiek kan, neem dan contact op met je lokale
groep — dat adres staat in de popup van de auto.

**Wil je een antwoord**, dan kun je in het formulier een e-mailadres achterlaten. Dat veld
is optioneel, en het is het enige wat níét publiek wordt: het adres komt niet op GitHub,
alleen de beheerders van de kaart zien het. In het issue staat alleen dat je een antwoord
wil. Het adres wordt vanzelf gewist 30 dagen nadat je melding afgehandeld is. (Dit veld
staat er pas als de beheerders het aanzetten.)

**Een screenshot van de kaart** gaat standaard mee, zodat de beheerders zien wat jij zag.
Het formulier toont een klein voorbeeld van precies wat er meegaat, en een vakje om het uit
te zetten. Ook de screenshot wordt publiek: hij staat in het issue. Het formulier zelf staat
er niet op, en het punt van je eigen locatie ook niet. Gebruikte je *Auto's in mijn buurt*,
dan staat de kaart rond je eigen plek; dan staat het vakje standaard uit, en zegt het
formulier waarom.

Er gaat verder niets mee: geen IP-adres, geen browsergegevens, geen locatie. Na het
versturen krijg je de link naar je eigen melding, zodat je kunt volgen wat ermee gebeurt.

Lukt het versturen niet, dan staat in de foutmelding de link naar GitHub, waar je het
rechtstreeks kwijt kunt — daar heb je wél een account voor nodig.

## Wat de kaart bewust niet doet

- **Geen beschikbaarheid.** Zie bovenaan. Dit is de belangrijkste grens.
- **Geen filter op afwezigheid**, en nooit "trekhaak: nee".
- **Geen foto van de échte auto** — alleen van het model, met bronvermelding.
- **Geen gegevens van eigenaars.** Geen namen, adressen, telefoonnummers of e-mailadressen
  van leden. Het enige contactadres is dat van de lokale groep.
- **Geen exacte standplaats.** De stippen staan twintig meter opzij, met opzet.
- **Geen officieel rijbereik.** Het bereik is een schatting bij gemengd gebruik uit een
  open databank, geen WLTP-cijfer van de fabrikant — en een marge waar de batterij niet
  bekend is.
- **Geen live details.** Welke auto's er zijn en waar ze staan, is live; al de rest komt
  uit een bestand dat per kwartaal met de hand wordt vernieuwd. Een nieuwe auto staat dus
  op de kaart zonder merk, model of toebehoren tot die verversing — zie
  [De live vloot](#de-live-vloot-welke-autos-er-zijn).
- **Niets doen met je locatie.** Vraag je "auto's in mijn buurt", dan blijft dat punt in
  je browser: het gaat niet naar Dégage, niet naar een server, en het wordt niet bewaard.
  De kaart rekent er alleen ter plekke de afstanden mee uit.
