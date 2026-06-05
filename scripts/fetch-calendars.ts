import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const calendarsDirectory = path.resolve(moduleDirectory, "../data/calendars");
const currentYear = new Date().getFullYear();
const yearsToFetch = [currentYear - 1, currentYear, currentYear + 1];

async function fetchYearCalendar(year: number): Promise<void> {
  const sourceUrl = `https://raw.githubusercontent.com/isdayoff/calendars/main/db/${year}/ru${year}.json`;
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    console.warn(`Skip ${year}: HTTP ${response.status}`);
    return;
  }
  const jsonText = await response.text();
  const targetPath = path.join(calendarsDirectory, `ru${year}.json`);
  await writeFile(targetPath, `${jsonText.trim()}\n`, "utf8");
  console.log(`Saved ${targetPath}`);
}

await mkdir(calendarsDirectory, { recursive: true });
for (const year of yearsToFetch) {
  await fetchYearCalendar(year);
}
