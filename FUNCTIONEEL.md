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

> **Dit is géén live beschikbaarheid.** De kaart toont enkel de locatie van de auto's,
> niet welke er op dit moment vrij zijn.

Wie ze gelezen heeft, kan ze wegklikken met het kruisje. De kaart vraagt eerst een
bevestiging, en in de instellingen zet je ze terug. Je browser onthoudt die keuze.

De gegevens worden **per kwartaal met de hand** ververst. De datum van de laatste
verversing staat naast de teller, zodat je altijd ziet hoe oud het beeld is.

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

Klik op een stip en je krijgt **alle** auto's van die standplaats te zien — ook de auto's
die door je filter zijn afgevallen. Elke auto draagt zijn eigen gegevens, dus verwarring
is niet mogelijk, en je ziet wat er werkelijk staat.

Per auto:

- de **naam** van de auto met de gemeente tussen haakjes — *"Carlascar (Gent)"* — en
  daaronder merk, model en bouwjaar: *"Ford Fiesta · 2014"*. De gemeente staat in de
  bron vaak in hoofdletters of juist helemaal klein ("GENTBRUGGE", "gent"); de feed zet
  dat al recht bij het samenstellen: "Gentbrugge", "Gent", "Heist-op-den-Berg".
- een **foto van het model** — nadrukkelijk niet van deze auto (zie hieronder)
- de feiten die we zeker weten: aantal zitplaatsen, brandstof, versnellingsbak en euronorm
- de **toebehoren en afspraken** die deze auto heeft: trekhaak, fietsdrager, kinderzitje,
  gps, bed, aanhangwagen, en of er huisdieren mee mogen of mee leren rijden mag
- bij een elektrische auto: het **rijbereik** (zie hieronder)

Waar een getal uitleg nodig heeft — het rijbereik en de Mobiscore — staat er een
**ⓘ-knopje** naast. Daarachter staat wat het getal betekent en waar het vandaan komt;
wie het niet nodig heeft, leest een rustige popup.

Onderaan staat het **district** als dat iets toevoegt aan de gemeente, en het
**contactadres van de lokale Dégage-groep** als dat bekend is.

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
is geen beleefdheid maar een voorwaarde van die licentie. Is er voor een model geen
bruikbare foto, dan verschijnt er een tekening van een auto. Een foto van de verkeerde
auto tonen is erger dan geen foto.

**Wat er níét in de popup staat:** niets over de eigenaar. Geen naam, geen e-mailadres,
geen telefoonnummer. Het enige adres dat getoond wordt, is dat van de lokale groep.

## Mobiscore en openbaar vervoer

Onder de auto's staat de **Mobiscore** van de standplaats, met eronder wat er aan openbaar
vervoer rijdt:

> **Mobiscore 8,7 / 10**  
> Bushalte op 480 meter (5/u)  
> Station Melsele op 1,5 kilometer (2/u)

De regel met het station staat er alleen als er een binnen tien kilometer ligt — en dat is
bij elke standplaats zo.

Tussen haakjes staat hoeveel er per uur vertrekt, **per richting**. Rijdt er minder dan één
per uur, dan staat er "(<1/u)"; is de halte ook een tramhalte, dan heet ze zo.

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

- **De dichtste halte met vaste lijnen**, en hoeveel bussen of trams
  er daar per uur **per richting** vertrekken — wat je ervaart als je aan de halte staat.
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

| filter | wat het doet |
|---|---|
| **Soort auto** | personenwagen of bestelwagen |
| **Zitplaatsen** | een ondergrens: "vanaf 5 plaatsen" toont ook de zeven- en negenzitters |
| **Brandstof** | benzine, diesel, elektrisch, hybride, plug-in hybride, CNG, LPG |
| **Versnellingsbak** | manueel of automatisch |
| **Toebehoren** | trekhaak, fietsdrager, kinderzitje, gps, bed, aanhangwagen |
| **Afspraken** | huisdieren toegelaten, leren autorijden |
| **Afstand tot een bushalte** | een bovengrens: "hoogstens 500 meter". Geldt voor de standplaats, niet voor de auto |
| **Afstand tot een treinstation** | een bovengrens: "hoogstens 2 kilometer". Reikt verder, want naar een station fiets of rijd je |
| **Euronorm** | een ondergrens, met elektrisch en hybride bovenaan (zie hieronder) |
| **Bouwjaar** | een ondergrens: "vanaf 2018" toont 2018 en later |

**De twee afstandsfilters** horen bij de standplaats en niet bij de auto: ze zijn er voor wie
de auto met bus of trein combineert — heen met de deelauto, terug met de trein, of een auto
zoeken die te voet vanaf de halte te bereiken is. De schuif toont alleen standen die iets
doen: ligt élke standplaats binnen twee kilometer van een halte, dan begint de halteschuif
daar en niet bij tien kilometer. De afstand is in vogelvlucht; te voet is de weg altijd wat
langer. Een standplaats waar geen halte of station van gemeten is, valt buiten élke
bovengrens — we weten dan niet of ze eraan voldoet.

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
bovenaan, met een eigen naam: *"elektrisch en hybride"*. Nadrukkelijk geen verzonnen
"Euro 7" — die norm bestaat echt en komt eraan.

Van zestig auto's kennen we de euronorm niet. Die zie je alleen bij de stand "alle auto's":
van een auto zonder gekende norm kun je niet volhouden dat hij er minstens één haalt.

## Twee schakelaars bij de filters

Bovenaan de filterlijst, net boven *"Soort auto"*, staan de twee keuzes die over het
filteren zelf gaan. Ze horen daar en niet achter het tandwiel: wie filtert, beslist er
meteen mee wat er met de weggefilterde auto's gebeurt.

- **Gefilterde auto's grijs tonen** — uit betekent dat weggefilterde standplaatsen echt
  verdwijnen in plaats van grijs te blijven staan. Aan zegt een grijze pin ook waarom:
  wie met de muis erover gaat, ziet per auto welke filters hem tegenhouden
  (*"Brandstof: benzine · Bouwjaar: 2012"*), en in de popup staat hetzelfde onder de naam
  van de auto. Een ontbrekend toebehoren heet daar "niet vermeld", nooit "nee".
- **Filters sluiten bij scrollen in de kaart** — uit betekent dat de filters open blijven
  terwijl je met het wieltje zoomt of de kaart met je vingers verschuift.

## Instellingen

Achter het tandwiel bij de zoomknoppen:

- **Lijst dichtstbijzijnde auto's volgt muis** — uit betekent dat de balk vanaf het midden
  van de kaart meet en blijft staan.
- **Lijst dichtstbijzijnde auto's tonen** — uit laat de balk helemaal weg, ook na een
  zoekopdracht of bij het inzoomen. Voor wie de kaart zelf wil lezen zonder een balk
  onderaan.
- **Melding over beschikbaarheid tonen** — zet de regel *"Dit is géén live
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

Een popup valt op een telefoon nooit meer half buiten beeld. De knop **"Probleem melden"**
gaat zolang weg — die stond er precies in de weg — en past de popup ook dan niet tussen het
paneel en de lijst, dan neemt hij de plaats van de lijst in en stapt die zolang opzij.
Allebei komen ze terug zodra je de popup sluit. Blijft er nog te weinig plaats, dan schuift
de inhoud binnen de popup zelf.

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
- **Geen live verbinding met de databank.** De kaart leest een bestand dat per kwartaal
  met de hand wordt vernieuwd.
- **Niets doen met je locatie.** Vraag je "auto's in mijn buurt", dan blijft dat punt in
  je browser: het gaat niet naar Dégage, niet naar een server, en het wordt niet bewaard.
  De kaart rekent er alleen ter plekke de afstanden mee uit.
