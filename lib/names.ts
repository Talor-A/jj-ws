/** Generated workspace names: short, memorable, easy to type. */
export const NAMES: readonly string[] = [
  "pikachu",
  "eevee",
  "squirtle",
  "bulbasaur",
  "charmander",
  "jigglypuff",
  "snorlax",
  "gengar",
  "mew",
  "pidgey",
  "magikarp",
  "gyarados",
  "lapras",
  "ditto",
  "vulpix",
  "growlithe",
  "arcanine",
  "psyduck",
  "machop",
  "abra",
  "slowpoke",
  "onix",
  "cubone",
  "rhyhorn",
  "staryu",
  "scyther",
  "pinsir",
  "tauros",
  "dratini",
  "togepi",
  "mudkip",
  "torchic",
  "treecko",
  "piplup",
  "chimchar",
  "turtwig",
  "rowlet",
  "litten",
  "popplio",
  "sobble",
];

export function pickName(
  taken: ReadonlySet<string>,
  random: () => number = Math.random,
): string {
  const available = NAMES.filter((name) => !taken.has(name));
  if (available.length > 0) {
    return available[Math.floor(random() * available.length)]!;
  }
  for (let suffix = 2; ; suffix++) {
    const name = `${NAMES[Math.floor(random() * NAMES.length)]!}-${suffix}`;
    if (!taken.has(name)) return name;
  }
}
