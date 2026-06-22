/**
 * enricher.ts — Enrichissement des données via Google Places API
 *
 * Lit  : data/clean_centers.json
 * Écrit: data/enriched_centers.json
 *
 * Sources d'enrichissement :
 *   1. Google Places API (Text Search + Place Details) — source principale
 *      → google_rating, google_reviews, horaires d'ouverture, services
 *      → Nécessite GOOGLE_PLACES_API_KEY dans .env
 *   2. Pages Jaunes — stub gracieux (non implémenté, placeholder explicite)
 *
 * Comportement :
 *   - Si GOOGLE_PLACES_API_KEY non défini → enrichissement sauté, warning
 *   - Délai poli entre requêtes (POLITE_DELAY_MS) pour respecter les quotas
 *   - Idempotent : si enriched_centers.json existe déjà, on ne re-enrichit pas
 *     les centres qui ont déjà un google_place_id (sauf flag --force)
 *   - En cas d'erreur sur un centre spécifique : on log et on continue
 *
 * Usage :
 *   tsx scripts/enricher.ts           ← enrichit tout ce qui manque
 *   tsx scripts/enricher.ts --force   ← re-enrichit tout (ignore le cache)
 */

import "dotenv/config";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { CleanEadCenter, EnrichedEadCenter } from "./types.js";
import { CleanEadCenterSchema, EnrichedEadCenterSchema } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

const INPUT_PATH = join(PROJECT_ROOT, "data", "clean_centers.json");
const OUTPUT_PATH = join(PROJECT_ROOT, "data", "enriched_centers.json");

const GOOGLE_API_KEY = process.env["GOOGLE_PLACES_API_KEY"];
const FORCE = process.argv.includes("--force");

/** Délai entre appels API Google (ms) — quotas gratuits = 1 req/s environ */
const POLITE_DELAY_MS = 1200;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg: string): void {
  console.log(`[enricher] ${new Date().toISOString()} — ${msg}`);
}

// ---------------------------------------------------------------------------
// Google Places API
// ---------------------------------------------------------------------------

interface GooglePlaceResult {
  place_id: string;
  name: string;
  rating?: number;
  user_ratings_total?: number;
  opening_hours?: {
    weekday_text?: string[];
    open_now?: boolean;
  };
  types?: string[];
}

interface GoogleTextSearchResponse {
  status: string;
  results: GooglePlaceResult[];
  error_message?: string;
}

interface GooglePlaceDetailsResponse {
  status: string;
  result?: {
    place_id: string;
    name: string;
    rating?: number;
    user_ratings_total?: number;
    opening_hours?: {
      weekday_text?: string[];
    };
    types?: string[];
  };
  error_message?: string;
}

/**
 * Recherche un établissement sur Google Places via Text Search.
 * Utilise "nom + ville + France" comme requête.
 */
async function googleTextSearch(
  name: string,
  city: string | undefined,
  postalCode: string | undefined
): Promise<GooglePlaceResult | null> {
  if (!GOOGLE_API_KEY) return null;

  const query = encodeURIComponent(
    [name, city, postalCode, "France"].filter(Boolean).join(" ")
  );
  const url =
    `https://maps.googleapis.com/maps/api/place/textsearch/json` +
    `?query=${query}&language=fr&region=fr&key=${GOOGLE_API_KEY}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`[enricher][WARN] Google Text Search HTTP ${resp.status} pour "${name}"`);
      return null;
    }
    const data = (await resp.json()) as GoogleTextSearchResponse;

    if (data.status !== "OK") {
      if (data.status !== "ZERO_RESULTS") {
        console.warn(
          `[enricher][WARN] Google Text Search status="${data.status}" pour "${name}" : ${data.error_message ?? ""}`
        );
      }
      return null;
    }

    return data.results[0] ?? null;
  } catch (err) {
    console.warn(`[enricher][WARN] Google Text Search exception pour "${name}" : ${String(err)}`);
    return null;
  }
}

/**
 * Récupère les détails complets d'un lieu via son place_id.
 * On demande les champs : rating, user_ratings_total, opening_hours, types.
 */
async function googlePlaceDetails(
  placeId: string
): Promise<GooglePlaceDetailsResponse["result"] | null> {
  if (!GOOGLE_API_KEY) return null;

  const fields = "rating,user_ratings_total,opening_hours,types,name";
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}&fields=${fields}&language=fr&key=${GOOGLE_API_KEY}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`[enricher][WARN] Google Place Details HTTP ${resp.status} pour place_id=${placeId}`);
      return null;
    }
    const data = (await resp.json()) as GooglePlaceDetailsResponse;

    if (data.status !== "OK") {
      console.warn(
        `[enricher][WARN] Google Place Details status="${data.status}" pour place_id=${placeId}`
      );
      return null;
    }

    return data.result ?? null;
  } catch (err) {
    console.warn(`[enricher][WARN] Google Place Details exception : ${String(err)}`);
    return null;
  }
}

/**
 * Convertit les weekday_text Google en objet horaires structuré.
 * Exemple d'entrée : ["Lundi: 09:00 – 18:00", "Mardi: 09:00 – 18:00", ...]
 */
function parseGoogleHoraires(weekdayText: string[]): Record<string, string> {
  const horaires: Record<string, string> = {};
  for (const entry of weekdayText) {
    const colonIdx = entry.indexOf(":");
    if (colonIdx === -1) continue;
    const day = entry.slice(0, colonIdx).toLowerCase().trim();
    const hours = entry.slice(colonIdx + 1).trim();
    horaires[day] = hours;
  }
  return horaires;
}

/**
 * Classifie les types Google Places en services EAD pertinents.
 * Les types Google (car_repair, car_dealer, etc.) sont mappés vers
 * des labels métier plus explicites.
 */
function mapGoogleTypesToServices(types: string[]): string[] {
  const mapping: Record<string, string> = {
    car_repair: "réparation automobile",
    car_dealer: "concessionnaire",
    gas_station: "station-service",
    establishment: "établissement",
    point_of_interest: "point d'intérêt",
    store: "commerce",
    premise: "local professionnel",
  };

  return types
    .map((t) => mapping[t])
    .filter((s): s is string => s !== undefined && s.length > 0);
}

// ---------------------------------------------------------------------------
// Stub Pages Jaunes
// ---------------------------------------------------------------------------

/**
 * [STUB] Enrichissement Pages Jaunes.
 *
 * Pages Jaunes ne propose pas d'API publique officielle.
 * Options envisagées mais non implémentées :
 *   1. Scraping Playwright de pagesjaunes.fr (fragile, CGU à vérifier)
 *   2. API tierce payante (ex: DataForseo, Outscraper)
 *   3. Données déjà couvertes par Google Places (note + horaires)
 *
 * Decision : laisser en stub. Si Google Places couvre bien les ~226 centres,
 * Pages Jaunes est redondant. Implémenter en phase 3 si nécessaire.
 */
async function enrichFromPagesJaunes(
  _name: string,
  _city: string | undefined
): Promise<Partial<EnrichedEadCenter>> {
  // Stub intentionnel — voir commentaire ci-dessus
  return {};
}

// ---------------------------------------------------------------------------
// Enrichissement d'un centre
// ---------------------------------------------------------------------------

async function enrichCenter(
  center: CleanEadCenter
): Promise<EnrichedEadCenter> {
  // Base : reprendre toutes les données propres
  const enriched: EnrichedEadCenter = { ...center };

  if (!GOOGLE_API_KEY) {
    return enriched; // Pas de clé → on retourne sans enrichissement
  }

  // Recherche Google Places
  const searchResult = await googleTextSearch(
    center.name,
    center.city,
    center.postal_code
  );

  if (!searchResult) {
    return enriched; // Aucun résultat → retour sans enrichissement
  }

  // Stocker le place_id pour traçabilité et re-fetch futur
  enriched.google_place_id = searchResult.place_id;

  // Données de base depuis la recherche
  if (searchResult.rating !== undefined) {
    enriched.google_rating = Math.round(searchResult.rating * 10) / 10;
  }
  if (searchResult.user_ratings_total !== undefined) {
    enriched.google_reviews = searchResult.user_ratings_total;
  }

  await sleep(POLITE_DELAY_MS / 2);

  // Détails complets (horaires notamment)
  const details = await googlePlaceDetails(searchResult.place_id);
  if (details) {
    if (details.rating !== undefined) {
      enriched.google_rating = Math.round(details.rating * 10) / 10;
    }
    if (details.user_ratings_total !== undefined) {
      enriched.google_reviews = details.user_ratings_total;
    }

    const horaires = details.opening_hours?.weekday_text
      ? parseGoogleHoraires(details.opening_hours.weekday_text)
      : undefined;

    const typesService = details.types
      ? mapGoogleTypesToServices(details.types)
      : undefined;

    if (horaires || typesService) {
      enriched.services = {
        ...(horaires && Object.keys(horaires).length > 0 ? { horaires } : {}),
        ...(typesService && typesService.length > 0 ? { types_service: typesService } : {}),
      };
    }
  }

  // Stub Pages Jaunes (no-op pour l'instant)
  await enrichFromPagesJaunes(center.name, center.city);

  return enriched;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log("Démarrage de l'enrichisseur EAD-France");

  if (!GOOGLE_API_KEY) {
    log("ATTENTION : GOOGLE_PLACES_API_KEY non défini. Les données Google Places ne seront pas enrichies.");
    log("Configurez GOOGLE_PLACES_API_KEY dans .env et relancez.");
  }

  // Lecture input
  let inputData: { centers: CleanEadCenter[]; cleaned_at?: string };
  try {
    inputData = JSON.parse(readFileSync(INPUT_PATH, "utf-8")) as typeof inputData;
  } catch (err) {
    console.error("[enricher] Impossible de lire clean_centers.json :", err);
    console.error("[enricher] Lancez d'abord : tsx scripts/cleaner.ts");
    process.exit(1);
  }

  const cleanCenters: CleanEadCenter[] = inputData.centers.map((c) => {
    const result = CleanEadCenterSchema.safeParse(c);
    return result.success ? result.data : (c as CleanEadCenter);
  });

  log(`${cleanCenters.length} centres à enrichir`);

  // Chargement du cache existant (idempotence)
  let existingEnriched: Map<string, EnrichedEadCenter> = new Map();
  if (!FORCE && existsSync(OUTPUT_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(OUTPUT_PATH, "utf-8")) as {
        centers: EnrichedEadCenter[];
      };
      for (const c of existing.centers) {
        if (c.google_place_id) {
          existingEnriched.set(`${c.name}|${c.postal_code ?? ""}`, c);
        }
      }
      log(
        `Cache chargé : ${existingEnriched.size} centres déjà enrichis (--force pour tout re-enrichir)`
      );
    } catch {
      log("Cache enriched_centers.json illisible — tout re-enrichir.");
      existingEnriched = new Map();
    }
  }

  const results: EnrichedEadCenter[] = [];
  let enrichedCount = 0;
  let cachedCount = 0;

  for (let i = 0; i < cleanCenters.length; i++) {
    const center = cleanCenters[i];
    if (!center) continue;
    const cacheKey = `${center.name}|${center.postal_code ?? ""}`;

    // Utiliser le cache si disponible
    if (!FORCE && existingEnriched.has(cacheKey)) {
      results.push(existingEnriched.get(cacheKey)!);
      cachedCount++;
      continue;
    }

    log(`[${i + 1}/${cleanCenters.length}] Enrichissement : ${center.name} (${center.city ?? "ville inconnue"})`);

    const enriched = await enrichCenter(center);
    results.push(enriched);

    if (enriched.google_rating !== undefined || enriched.google_reviews !== undefined) {
      enrichedCount++;
    }

    // Délai poli entre chaque centre
    if (i < cleanCenters.length - 1) {
      await sleep(POLITE_DELAY_MS);
    }
  }

  log(
    `Enrichissement terminé : ${enrichedCount} nouveaux enrichissements, ${cachedCount} depuis le cache`
  );

  // Validation Zod
  const validated: EnrichedEadCenter[] = [];
  for (const r of results) {
    const parsed = EnrichedEadCenterSchema.safeParse(r);
    validated.push(parsed.success ? parsed.data : (r as EnrichedEadCenter));
  }

  // Statistiques
  const stats = {
    total: validated.length,
    with_google_rating: validated.filter((c) => c.google_rating !== undefined).length,
    with_google_reviews: validated.filter((c) => c.google_reviews !== undefined).length,
    with_horaires: validated.filter((c) => c.services?.horaires).length,
    coverage_pct: Math.round(
      (validated.filter((c) => c.google_place_id).length / validated.length) * 100
    ),
  };
  log(`Statistiques : ${JSON.stringify(stats)}`);

  // Écriture
  mkdirSync(join(PROJECT_ROOT, "data"), { recursive: true });
  const payload = {
    enriched_at: new Date().toISOString(),
    source_cleaned_at: inputData.cleaned_at,
    count: validated.length,
    stats,
    centers: validated,
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf-8");
  log(`Écrit : ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("[enricher] Erreur fatale :", err);
  process.exit(1);
});
