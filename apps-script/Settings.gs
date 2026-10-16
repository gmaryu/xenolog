/** Lab settings. Paste into Apps Script as the "Settings" file and change what differs in your lab.
 *  Code.gs holds the defaults (DEFAULTS); any key you delete here falls back to them, and updating Code.gs never touches this file.
 *  If you rename a choice in options.appearance or options.quantity, give it a value in quality.appearance or quality.quantity too. */
const SETTINGS = {
  appName: 'XenoLog',            // browser tab title and the name of the spreadsheet menu
  faviconUrl: '',                // optional: public https link to a PNG shown in the browser tab
  restMonths: 3,                 // months a frog rests after a priming
  tankSize: 3,                   // frogs per housing tank
  primingBatch: 4,               // frogs usually primed together; the Priming tab suggests this many
  removalReasons: ['Died', 'Escaped', 'Euthanized', 'Other'],   // offered when a frog is removed from the colony
  recordTiming: true,            // false stops the Timing sheet: how long each step of a priming took, per person (see README)

  // Choices offered in the record form, least to most favourable.
  options: {
    water: ['MilliQ', 'RO'],
    quantity: ['None', 'Few', 'Normal', 'Many'],
    appearance: ['None', 'Bad', 'Not bad', 'Good', 'Great'],
    ca: ['Turned to white', 'Looking good']
  },

  // Egg quality score and replacement candidates. appearance and quantity give each choice above a value; 0 means no usable eggs.
  quality: {
    squeezedWeight: 0.7,     // squeezed eggs count this much, laid eggs the rest
    appearanceWeight: 0.7,   // within one egg type: appearance counts this much, quantity the rest
    cycles: 3,               // how many of the most recent cycles are averaged
    threshold: 45,           // candidate when the average of two or more cycles is below this (0-100)
    firstThreshold: 30,      // candidate when the only cycle so far scored this or less
    appearance: { 'Great': 4, 'Good': 3, 'Not bad': 2, 'Bad': 1, 'None': 0 },
    quantity: { 'Many': 3, 'Normal': 2, 'Few': 1, 'None': 0 }
  },

  // Housing systems, each a run of tanks, shown in the Vet view's "system" field: e.g. [{ name: 'A', tanks: [1, 12] }, { name: 'B', tanks: [13, 24] }].
  // Leave empty to show the tank number there instead.
  systems: [],

  // Vet view columns, left to right: [heading, field]. Rename, reorder, drop or add columns here; the sheet follows on the next rebuild.
  // Fields: frog, system, tank, arrival, source, frogNotes (from Frogs); priming, collection, name, water, laidQty, laidApp, laidCa,
  // sqQty, sqApp, sqCa, activity, score, comments (from the record). '' gives an empty column; anything typed into it is cleared on rebuild.
  vetColumns: [['Animal ID', 'frog'], ['System #', 'system'], ['Arrival Date', 'arrival'], ['Source', 'source'], ['Collection Date', 'collection'],
    ['# Collected (Laid)', 'laidQty'], ['Appearance (Laid)', 'laidApp'], ['After Ca2+ (Laid)', 'laidCa'],
    ['# Collected (Squeezed)', 'sqQty'], ['Appearance (Squeezed)', 'sqApp'], ['After Ca2+ (Squeezed)', 'sqCa'],
    ['MMR H2O source', 'water'], ['Notes', 'comments']],

  // Only for "Import legacy records": old water-source spellings in your form, lower case, and the choice each is read as.
  legacyWater: { 'milliq': 'MilliQ', 'milli-q': 'MilliQ', 'ro': 'RO', '-': '' }
};
