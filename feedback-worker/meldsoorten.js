/* De soorten melding, met de kop zoals ze in het issue komt. De issues zelf staan in het
   Nederlands, de taal van de beheerders; de taal van de bezoeker staat erbij.

   Een eigen bestand, en niet in feedback.js: dat bestand importeert beheer.js, en beheer.js
   heeft deze lijst nodig. Stond ze in feedback.js, dan liepen de twee in een kring, en las
   beheer.js de lijst al vóór ze bestond. */
export const SOORTEN = {
  kaart: "Er klopt iets niet op de kaart",
  werking: "De kaart werkt niet goed",
  idee: "Idee of suggestie",
  anders: "Iets anders"
};
