import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const outputPath = new URL("../data/auto-refresh.json", import.meta.url);

const queries = [
  "new guitar effects pedal demo 2026",
  "new guitar pedal demo this week",
  "guitar effects pedal release demo",
  "guitar pedal official demo new",
  "NAMM 2026 guitar pedal demo",
  "boutique guitar pedal demo new",
];

const pedalTerms = [
  "pedal",
  "stompbox",
  "effect",
  "overdrive",
  "distortion",
  "fuzz",
  "delay",
  "reverb",
  "chorus",
  "phaser",
  "flanger",
  "tremolo",
  "boost",
  "looper",
  "wah",
  "compressor",
  "multi-fx",
  "multifx",
  "modeler",
];

const blockTerms = [
  "bass",
  "piano",
  "vocal",
  "voice",
  "voicelive",
  "song lesson",
  "how to play",
  "cover",
  "backing track",
  "top 5",
  "top five",
  "best pedals",
  "pedals of 2025",
];

function titleCase(value) {
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function inferType(title) {
  const lower = title.toLowerCase();
  if (lower.includes("reverb")) return "Reverb";
  if (lower.includes("delay")) return "Delay";
  if (lower.includes("fuzz")) return "Fuzz";
  if (lower.includes("overdrive")) return "Overdrive";
  if (lower.includes("distortion")) return "Distortion";
  if (lower.includes("chorus")) return "Chorus";
  if (lower.includes("phaser")) return "Phaser";
  if (lower.includes("flanger")) return "Flanger";
  if (lower.includes("boost")) return "Boost";
  if (lower.includes("modeler") || lower.includes("multi-fx") || lower.includes("multifx")) {
    return "Modeler / Multi-FX";
  }
  return "Demo / Review";
}

function cleanTitle(title) {
  return title
    .replace(/\s*\|\s*.+$/g, "")
    .replace(/\s+-\s+YouTube$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function runSearch(query) {
  const stdout = execFileSync(
    "yt-dlp",
    ["--flat-playlist", "--dump-json", `ytsearchdate8:${query}`],
    {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function isPedalVideo(item) {
  const title = item.title || "";
  const channel = item.channel || item.uploader || "";
  const lower = `${title} ${channel}`.toLowerCase();
  return (
    pedalTerms.some((term) => lower.includes(term)) &&
    !blockTerms.some((term) => lower.includes(term))
  );
}

function toLead(item) {
  const title = cleanTitle(item.title || "Guitar pedal demo");
  const channel = item.channel || item.uploader || "YouTube";
  const id = item.id || slugify(title);
  const url = item.webpage_url || item.url || `https://www.youtube.com/watch?v=${id}`;
  const type = inferType(title);

  return {
    id: slugify(`${id}-${title}`),
    maker: channel,
    pedal: title,
    type,
    status: "Reviewed",
    timing: "Auto-refreshed from YouTube",
    price: "Check listing",
    summary: `Fresh YouTube result for guitar effects pedals from ${channel}.`,
    videoTitle: title,
    channelHint: channel,
    youtubeUrl: url,
    sourceUrl: url,
    sourceName: "YouTube",
    priority: "Fresh lead",
  };
}

function loadPrevious() {
  try {
    const previous = JSON.parse(readFileSync(outputPath, "utf8"));
    return Array.isArray(previous.leads) ? previous.leads : [];
  } catch {
    return [];
  }
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(date);
}

const seen = new Set();
const freshLeads = [];

for (const query of queries) {
  try {
    for (const item of runSearch(query)) {
      if (!isPedalVideo(item)) continue;
      const url = item.webpage_url || item.url;
      const key = item.id || url || item.title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      freshLeads.push(toLead(item));
      if (freshLeads.length >= 9) break;
    }
  } catch (error) {
    console.warn(`Search failed for "${query}": ${error.message}`);
  }

  if (freshLeads.length >= 9) break;
}

const fallback = loadPrevious();
const leads = freshLeads.length > 0 ? freshLeads : fallback;

if (leads.length === 0) {
  throw new Error("No pedal videos found and no previous refresh data exists.");
}

const now = new Date();
const payload = {
  updatedAt: now.toISOString(),
  updatedLabel: formatDate(now),
  source: "yt-dlp YouTube search",
  generatedBy: "scripts/refresh-content.mjs",
  leads,
};

mkdirSync(new URL("../data", import.meta.url), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`Wrote ${leads.length} refreshed pedal leads to ${outputPath.pathname}`);
