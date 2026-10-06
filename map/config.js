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
  verborgenVlaggen: ["bed", "aanhanger"],

  /* Het meldformulier achter de knop "Probleem melden": zo kan ook wie geen
     GitHub-account heeft iets melden. Het gaat via een Cloudflare Worker naar GitHub;
     hoe je die opzet, staat in `feedback-worker/README.md`.

       url               het adres van de Worker. Leeg: de knop opent dan het formulier
                         op github.com zelf, waarvoor je wél een account nodig hebt.
       turnstileSitekey  de publieke sleutel van Turnstile, de spamcontrole. Leeg: geen
                         controle in het formulier (dan moet de Worker ook zonder). */
  melden: {
    url: "https://degage-kaart-feedback.degage.workers.dev",
    turnstileSitekey: "0x4AAAAAAFOUUs1zrXUf92iY",
  },
};
