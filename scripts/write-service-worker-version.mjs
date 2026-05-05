import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const cardData = await readFile(new URL("../src/data/m4e_cards.json", import.meta.url));
const cardDataHash = createHash("sha256").update(cardData).digest("hex").slice(0, 12);
const version = `${packageJson.version}-cards-${cardDataHash}`;

await writeFile(
  new URL("../public/sw-version.js", import.meta.url),
  `self.M4E_CACHE_VERSION = ${JSON.stringify(version)};\n`,
  "utf8"
);

console.log(`Service worker cache version: ${version}`);
