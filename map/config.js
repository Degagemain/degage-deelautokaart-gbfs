/* Instellingen van de kaart die je zonder de kaartcode aan te raken kunt wijzigen.

   Dit bestand wordt door `index.html` ingeladen met een gewone <script>-tag, vóór de
   kaartcode zelf, net als de taalbestanden. Geen bouwstap: het hangt zichzelf in
   `window.DEGAGE_CONFIG` en de kaart leest het daar op. Ontbreekt het bestand of een
   instelling, dan doet de kaart wat ze zonder deze instelling zou doen.
*/
window.DEGAGE_CONFIG = {
  /* Toebehoren en afspraken uit de feed die de kaart NIET toont: niet als filter en niet
     in de popup van een wagen. De feed zelf blijft ongewijzigd. De sleutels zijn die uit
     de feed (FEEDSPEC.md):

       aanhanger, bed, fietsdrager, gps, kinderzitje, trekhaak,
       huisdieren, leren_autorijden

     Leeg maken (`[]`) toont ze weer allemaal. */
  verborgenVlaggen: ["bed"],
};
