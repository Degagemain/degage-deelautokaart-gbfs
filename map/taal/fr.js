/* Frans.

   Ontbreekt hier een sleutel, dan toont de kaart de Nederlandse zin uit nl.js. Dat is
   met opzet: een half vertaald bestand levert een leesbare kaart op en geen gaten.
   --------------------------------------------------------------------------------------

   Dit bestand wordt door `index.html` ingeladen met een gewone <script>-tag, vóór de
   kaartcode zelf. Geen bouwstap, geen module: het hangt zichzelf in `window.DEGAGE_TALEN`
   en de kaart leest het daar op. De volgorde van de scripttags in `index.html` is meteen
   de volgorde van de keuzelijst in de instellingen.

   Drie tabellen, elk met een eigen taak:

   · `teksten`  alles wat vast in de kaart staat, per sleutel. {haakjes} worden door de
                kaart ingevuld — laat ze staan en vertaal er alleen omheen.
   · `waarden`  de gesloten lijstjes uit de brondata (brandstof, carrosserie, bak). De
                sleutel is de waarde zoals ze ín de feed staat, in het Nederlands; wat
                hier niet staat, toont de kaart onvertaald in plaats van te raden.
   · `vlaggen`  de toebehoren en afspraken. De sleutel komt uit de feed (FEEDSPEC.md).

   Een nieuwe taal toevoegen: kopieer `nl.js`, vertaal, en zet één scriptregel bij in
   `index.html`. Verder is er niets aan te passen — de keuzelijst en de taaldetectie
   volgen vanzelf.
*/
(window.DEGAGE_TALEN = window.DEGAGE_TALEN || {}).fr = {
  naam: "Français",
  /* Voor getallen en datums. België voor nl en fr, want dat is het publiek; en-GB omdat
     en-US er "9/3/2025" en "1,234" van maakt op een kaart die verder metrisch is. */
  locale: "fr-BE",

  teksten: {
    "app.titel": "Carte des voitures partagées Dégage",
    "app.kaartLabel": "Carte des véhicules de Dégage",

    "voorbehoud.titel": "Bon à savoir",
    "voorbehoud.sluiten": "Fermer",
    "voorbehoud.live": "<strong>Pas de disponibilité en temps réel :</strong> vous voyez " +
                       "où sont les voitures, pas si elles sont libres.",
    "voorbehoud.aanbod": "<strong>L'offre peut changer,</strong> même pendant votre abonnement.",
    "voorbehoud.fotos": "<strong>Photos d'exemple</strong> du modèle, pas de la voiture elle-même.",
    "voorbehoud.locatie": "<strong>Positions approximatives,</strong> pour des raisons de confidentialité.",

    "zoek.plaatshouder": "Nom de voiture, adresse ou commune…",
    "zoek.aria": "Rechercher un nom de voiture, une adresse ou une commune ; cliquer " +
                 "affiche aussi les filtres",
    "zoek.knop": "Rechercher",
    "zoek.locatie": "Voitures près de moi",
    "zoek.bezig": "Recherche en cours…",
    "zoek.gevonden": "Trouvé : <b>{naam}</b>",
    "zoek.meerdere": "<b>{n} voitures</b> dont le nom contient « {vraag} »",
    "zoek.eerste": " — les {n} premières",
    "zoek.geenAdres": "Aucune adresse trouvée — mais des voitures dont le nom contient " +
                      "« {vraag} ».",
    "zoek.niets": "Rien trouvé pour « {vraag} » — ni nom de voiture, ni adresse. " +
                  "Essayez une commune, ou rue + commune.",
    "zoek.mislukt": "La recherche a échoué : {fout}",
    "zoek.dienstStatus": "le service d'adresses a renvoyé le statut {status}",
    "zoek.adresMarker": "Adresse recherchée : {adres}",

    "locatie.bezig": "Recherche de votre position…",
    "locatie.geweigerd": "Pas d'autorisation pour votre position. Activez-la dans votre " +
                         "navigateur ; si la carte est intégrée dans une autre page, " +
                         "celle-ci doit aussi l'autoriser.",
    "locatie.mislukt": "Votre position n'a pas pu être déterminée. Essayez plutôt une " +
                       "commune ou une adresse.",
    "locatie.geenSteun": "Ce navigateur ne transmet pas de position. Cherchez une commune " +
                         "ou une adresse.",
    "locatie.onnauwkeurig": "Votre position est approximative : précise à environ {afstand}.",
    "locatie.ver": "La voiture la plus proche se trouve à {afstand}.",

    "paneel.minimaliseren": "Réduire le panneau",
    "paneel.tonen": "Afficher le panneau",

    "telling.laden": "chargement…",
    "telling.bijgewerkt": "mis à jour le {datum}",
    "telling.wagen": "voiture",
    "telling.wagens": "voitures",
    "telling.van": "{n} sur {totaal}",
    "telling.geen": "Aucune voiture ne correspond à ces filtres.",
    "telling.nietGeladen": "non chargé",

    "filters.wissen": "Effacer les filtres",
    "filters.grijs": "Afficher en gris les voitures filtrées",
    "filters.scrollSluit": "Fermer les filtres en faisant défiler la carte",
    "filters.sluiten": "Fermer les filtres",
    "filters.meer": "Plus de filtres",
    "kop.soort": "Type de véhicule",
    "kop.klasse": "Catégorie de prix",
    "filter.klasse": "Catégorie {klasse}",
    "filter.klasseOnbekend": "Catégorie inconnue",
    "klasse.uitleg": "Chaque voiture roule au prix kilométrique de sa catégorie de " +
                     "prix. La catégorie B coûte plus cher au kilomètre que la catégorie A.",
    "kop.zitplaatsen": "Places assises",
    "kop.brandstof": "Carburant",
    "kop.bak": "Boîte de vitesses",
    "kop.toebehoren": "Équipements",
    "kop.afspraken": "Conditions",
    "kop.euronorm": "Norme Euro",
    "kop.bouwjaar": "Année de construction",
    "kop.ov": "Transports en commun",
    "filter.ovBus": "Bus",
    "filter.ovTram": "Tram",
    "filter.ovTrein": "Train",
    "filter.ovBeide": "Satisfaire à tous les modes réglés",
    "ov.filterUitleg": "Réglez une distance ou une fréquence pour le bus, le tram ou le train ; un curseur " +
                       "sur « toute » ne filtre rien. La distance est mesurée à vol d'oiseau, de " +
                       "l'emplacement à l'arrêt ou à la gare le plus proche ; à pied, le trajet est un peu " +
                       "plus long. La fréquence est le nombre de départs par heure et par sens, un jour de " +
                       "semaine ordinaire. Si vous en réglez plusieurs, un seul suffit, sauf si « Satisfaire " +
                       "à tous les modes réglés » est activé.",
    "ov.elkeAfstand": "toute distance",
    "ov.elkeFrequentie": "toute fréquence",
    "ov.minstensFreq": "au moins {n}× par heure",
    "afstand.hoogstens": "{afstand} au maximum",
    "bus.aria": "Distance maximale d'un arrêt de bus",
    "tram.aria": "Distance maximale d'un arrêt de tram",
    "trein.aria": "Distance maximale d'une gare",
    "busfreq.aria": "Fréquence minimale à l'arrêt de bus, par sens",
    "tramfreq.aria": "Fréquence minimale à l'arrêt de tram, par sens",
    "treinfreq.aria": "Fréquence minimale à la gare, par sens",
    "jaar.alle": "toutes les années",
    "jaar.vanaf": "à partir de {jaar}",
    "jaar.enkel": "uniquement {jaar}",
    "jaar.aria": "Année de construction minimale",

    "zit.alle": "tout nombre de places",
    "zit.enkel": "uniquement {n} places",
    "zit.vanaf": "à partir de {n} places",
    "zit.aria": "Nombre minimum de places assises",

    "euronorm.uitleg": "Choisissez avec les deux curseurs de quelle norme à quelle norme. " +
                       "Les voitures électriques figurent en haut de l'échelle ; elles " +
                       "n'ont pas de norme Euro. Les hybrides comptent avec leur propre norme.",
    "norm.alle": "peu importe",
    "norm.enkel": "uniquement {norm}",
    "norm.hoger": "{norm} et supérieur",
    "norm.tussen": "de {van} à {tot}",
    "norm.ariaVan": "Norme Euro la plus basse",
    "norm.ariaTot": "Norme Euro la plus haute",
    "norm.elektrisch": "électrique",

    "dichtbij.titel": "Voitures les plus proches",
    "dichtbij.bij": "Au plus près de <b>{plek}</b>",
    "dichtbij.bijJou": "Au plus près de <b>votre position</b>",
    "dichtbij.leeg": "Aucune voiture ne correspond aux filtres — rien à afficher.",
    "dichtbij.sluiten": "Fermer",
    "dichtbij.sluitenLang": "Fermer la liste",

    "melding.geduld": "Un instant",
    "melding.laden": "Chargement de la carte des voitures partagées.",
    "taalvraag.titel": "Dans quelle langue voulez-vous la carte ?",
    "tandwielhint": "Vous pouvez toujours changer la langue ici, dans les paramètres.",

    "instellingen.volgmuis": "La liste des voitures les plus proches suit la souris",
    "instellingen.dichtbij": "Afficher la liste des voitures les plus proches",
    "instellingen.samen": "Afficher ensemble les voitures d'un même emplacement",
    "instellingen.taal": "Langue",
    "instellingen.taalOnthouden": "Langue mémorisée dans ce navigateur.",
    "instellingen.taalVergeten": "Oublier",
    "instellingen.bronLive": "Les voitures et leur emplacement sont à jour. La marque, le modèle et les équipements ont été mis à jour le {datum}.",
    "instellingen.bronDump": "Données du {datum}.",
    "instellingen.pictogram": "Icône de l'onglet :",
    "melden.knop": "Problème ou avis",
    "melden.titel": "Signaler un problème ou donner un avis — ouvre github.com dans un nouvel onglet ; votre avis sera public",
    "melden.titelFormulier": "Signaler un problème ou donner un avis — votre signalement sera public",
    /* Het issueformulier op GitHub in deze taal; zie .github/ISSUE_TEMPLATE/. */
    "melden.sjabloon": "feedback-fr.yml",
    "meldformulier.titel": "Problème ou avis",
    "meldformulier.publiek": "<strong>Votre signalement est public.</strong> Ce que vous écrivez " +
                             "dans la description, et la capture d'écran si vous la joignez, est publié comme ticket public sur GitHub, visible " +
                             "par tout le monde. N'y mettez donc aucune donnée personnelle : nom, " +
                             "adresse, numéro de téléphone, adresse e-mail, numéro de membre ou plaque " +
                             "d'immatriculation. Vous devez signaler quelque chose qui ne peut pas être " +
                             "public ? Écrivez alors à " +
                             "<a href=\"mailto:info@degage.be\">info@degage.be</a>.",
    "meldformulier.soort": "De quoi s'agit-il ?",
    "meldformulier.soortKaart": "Quelque chose est incorrect sur la carte",
    "meldformulier.soortWerking": "La carte ne fonctionne pas bien",
    "meldformulier.soortIdee": "Idée ou suggestion",
    "meldformulier.soortAnders": "Autre chose",
    "meldformulier.beschrijving": "Description",
    "meldformulier.beschrijvingPlh": "Qu'avez-vous vu, et à quoi vous attendiez-vous ? De quelle voiture ou de quel endroit s'agit-il ?",
    "meldformulier.mail": "Adresse e-mail (facultatif)",
    "meldformulier.mailUitleg": "Seulement si vous souhaitez une réponse. Elle reste privée et est effacée 30 jours après traitement.",
    "meldformulier.veldMail": "Ceci ne ressemble pas à une adresse e-mail. Vérifiez-la, ou laissez le champ vide.",
    "meldformulier.bedanktMail": "Votre adresse e-mail ne figure pas dans le signalement sur " +
                                 "GitHub. Nous l'utilisons uniquement pour vous répondre.",
    "meldformulier.mailMislukt": "Votre signalement est sur GitHub, mais votre adresse e-mail " +
                                 "n'a pas pu être enregistrée. Vous souhaitez une réponse ? " +
                                 "Écrivez alors à <a href=\"mailto:info@degage.be\">info@degage.be</a>.",
    "meldformulier.akkoord":"Je comprends que mon signalement sera public, et il ne contient aucune donnée personnelle.",
    "meldformulier.beeld": "Joindre une capture d'écran de la carte",
    "meldformulier.beeldBezig": "Capture d'écran en cours…",
    "meldformulier.beeldUitleg": "Ainsi, nous voyons ce que vous avez vu. La capture d'écran sera publique, elle aussi. Votre propre position n'y figure pas.",
    "meldformulier.beeldLocatie": "Vous avez utilisé votre position : la carte est donc centrée sur l'endroit où vous êtes. C'est pourquoi cette option est désactivée par défaut.",
    "meldformulier.beeldAlt": "Capture d'écran de la carte jointe au signalement",
    "meldformulier.beeldMislukt": "Votre signalement est sur GitHub, mais la capture d'écran n'a pas pu être enregistrée.",
    "meldformulier.annuleren": "Annuler",
    "meldformulier.versturen": "Envoyer",
    "meldformulier.bezig": "Envoi en cours…",
    "meldformulier.bedankt": "Merci ! Votre signalement est maintenant sur GitHub.",
    "meldformulier.bekijk": "Voir votre signalement",
    "meldformulier.veldSoort": "Choisissez le sujet de votre signalement.",
    "meldformulier.veldBeschrijving": "Veuillez saisir une description.",
    "meldformulier.veldTeKort": "Écrivez un peu plus : au moins {min} caractères.",
    "meldformulier.veldAkkoord": "Cochez la case pour confirmer que vous comprenez que votre signalement est public.",
    "meldformulier.foutControle": "Le contrôle anti-spam n'est pas encore prêt. Attendez que la case affiche une coche, puis réessayez.",
    "meldformulier.fout": "L'envoi a échoué. Réessayez plus tard, ou signalez-le directement " +
                          "sur {link} (un compte y est nécessaire).",

    "knop.alles": "Tout afficher — dézoomer sur la carte entière",
    "knop.allesKort": "Tout afficher",
    "knop.instellingen": "Paramètres",
    "kaart.attributie": "Données cartographiques &copy; les contributeurs {link}",
    "kaart.tegelbron": "fond de carte {link}",
    "kaart.inzoomen": "Zoom avant",
    "kaart.uitzoomen": "Zoom arrière",
    "kaart.leaflet": "Une bibliothèque JavaScript pour cartes interactives",
    "kaart.popupSluiten": "Fermer la fenêtre",

    "popup.plaatsen": "{n} places",
    "popup.geenFoto": "Aucune photo d'exemple disponible pour ce modèle",
    "popup.fotoAlt": "Photo d'exemple d'une {model}",
    "popup.nieuw": "Nouvelle voiture",
    "popup.nieuwUitleg": "La marque, le modèle et les autres détails suivront lors de la prochaine mise à jour de la carte.",
    "popup.ookHier": "Aussi à cet emplacement :",
    "popup.lidVraag": "Envie de partager vous aussi ?",
    "popup.lidOproep": "Devenez membre de Dégage ! 🚗",
    "popup.tarieven": "Nos tarifs",
    "popup.faq": "FAQ",
    "popup.uitleg": "Explication",
    "popup.bereikEen": "± {km} km",
    "popup.bereikMarge": "{van}–{tot} km",
    "popup.bereikUitleg": "Autonomie : estimation en usage mixte, pas WLTP. Une " +
                          "fourchette signifie qu'elle dépend de la batterie. Source :",
    "popup.bereikUitlegHandmatig": "Autonomie : estimation en usage mixte, pas WLTP. " +
                          "Indiquée par Dégage même, d'après la batterie équipant ces " +
                          "véhicules.",
    "ov.titel": "Mobiscore",
    "ov.geenScore": "non disponible",
    "ov.bushalte": "Arrêt de bus",
    "ov.tramhalte": "Arrêt de tram",
    "ov.geenHalte": "Aucun arrêt de bus ou de tram à moins de {straal}",
    "ov.geenBushalte": "Aucun arrêt de bus à moins de {straal}",
    "ov.geenTramhalte": "Aucun arrêt de tram à moins de {straal}",
    "ov.station": "Gare",
    "ov.meter": "{n} mètres",
    "ov.kilometer": "{n} kilomètres",
    "ov.kilometerEen": "1 kilomètre",
    "ov.kmKort": "{n} km",
    "ov.keer": "{n}×",
    "ov.minderDanEenKeer": "<1×",
    "ov.perUurLabel": "par heure",
    "ov.bron": "À côté du pictogramme : départs par heure et par sens. Le nom de " +
              "l'arrêt figure sur le pictogramme. " +
              "Mobiscore : Departement Omgeving, gouvernement flamand — commerces, écoles, " +
              "soins, loisirs et transports en commun à distance de marche et de vélo. Bus et " +
              "trams : De Lijn, par sens, du côté le plus fréquenté de l'arrêt. Trains : SNCB, " +
              "tous les trains de la gare divisés par deux sens. Un jour de semaine ordinaire " +
              "de 7 à 19 h, à vol d'oiseau ; le transport à la demande n'est pas compté.",

    "marker.standplaats": "Emplacement {naam}",
    "marker.elektrisch": "Emplacement avec voiture électrique {naam}",
    "marker.uitgefilterd": "Emplacement filtré {naam}",
    "reden.buiten": "Hors des filtres — {redenen}",
    "reden.paar": "{kop} : {waarde}",
    "reden.onbekend": "inconnu",
    "reden.nietVermeld": "{vlag} non renseigné",

    "fout.titel": "Impossible de charger les emplacements",
    "fout.uitleg": "Cette page lit ses fichiers depuis <code>{map}</code>. Ouvrez-la via " +
                   "un serveur web, pas en <code>file://</code> : le navigateur bloque " +
                   "alors la lecture des données.",
    "fout.status": "{naam}.json a renvoyé le statut {status}",

    "maanden": ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
                "août", "septembre", "octobre", "novembre", "décembre"]
  },

  waarden: {
    "benzine": "essence",
    "diesel": "diesel",
    "elektrisch": "électrique",
    "hybride": "hybride",
    "plug-in hybride": "hybride rechargeable",
    "Personenwagen": "Voiture",
    "Bestelwagen": "Camionnette",
    "manueel": "manuelle",
    "automatisch": "automatique"
  },

  vlaggen: {
    "aanhanger": "remorque", "bed": "lit", "fietsdrager": "porte-vélos",
    "gps": "GPS", "kinderzitje": "siège enfant", "trekhaak": "attelage",
    "huisdieren": "animaux admis", "leren_autorijden": "apprentissage de la conduite"
  }
};
