// A little pre-trip fun on the Today dashboard — shown when there's nothing
// else to display yet (no day plan before the trip starts). One is picked
// at random every time Today is opened, not cached per day.
export const FUN_FACTS = [
  "Noto was completely rebuilt after a massive 1693 earthquake flattened the original town — that's why its honey-gold Baroque streets all feel so unified.",
  "That warm golden color of Noto's buildings comes from local limestone that mellows in the sun — locals call it 'the stone garden.'",
  "Nero d'Avola, Sicily's signature red wine, is named after Avola — the town right next to where you're staying.",
  "Vendicari's wetlands attract migratory flamingos, especially in spring and autumn — worth a glance near the old salt pans.",
  "Pachino, a short drive from Marzamemi, gave its name to the famous 'pomodoro di Pachino' — prized across Italy for its sweetness.",
  "Ortigia, Syracuse's old town, has been continuously inhabited for roughly 2,700 years, making it one of the oldest urban settlements in Europe.",
  "The Greek Theatre at Neapolis in Syracuse is one of the largest surviving Greek theatres in the world — and it still hosts live performances every summer.",
  "Sicily's 'Opera dei Pupi' puppet theatre tradition is recognized by UNESCO as Intangible Cultural Heritage of Humanity.",
  "Granita is widely believed to have originated in Sicily, evolved from ancient methods of flavoring snow packed down from Mount Etna.",
  "Modica is famous for 'cold-processed' chocolate, a technique inherited via Spanish rule from the Aztecs — it stays grainy because the sugar never fully melts.",
  "Mount Etna is Europe's tallest and most active volcano — it's still growing most years.",
  "Noto, Modica, Ragusa, and Scicli are four of eight late-Baroque Val di Noto towns collectively named a UNESCO World Heritage Site.",
  "Ragusa is actually two towns — Ragusa Superiore and Ragusa Ibla — split by a deep ravine and linked by hundreds of steps.",
  "Sicily has been ruled by an unusually long list of civilizations — Greeks, Romans, Arabs, Normans, Spanish — and you can still taste and see all of them today.",
  "The cannolo was traditionally made only during Carnival season, before it became the everyday treat it is now.",
  "Cava Grande del Cassibile is a canyon carved by the Cassibile river, with natural swimming pools that have been used since antiquity.",
];

export function randomFunFact() {
  return FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)];
}
