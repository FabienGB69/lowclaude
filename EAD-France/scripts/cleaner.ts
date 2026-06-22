/**
 * cleaner.ts — Nettoyage et normalisation des données brutes
 *
 * Lit  : data/raw_centers.json
 * Écrit: data/clean_centers.json
 *
 * Opérations :
 *   1. Déduplication (clé : name + postal_code, insensible à la casse/accents)
 *   2. Normalisation téléphone → format +33XXXXXXXXX
 *   3. Normalisation adresse (trim, majuscules de début)
 *   4. Validation email (regex RFC-compatible)
 *   5. Normalisation URL site web (ajout https:// si absent)
 *   6. Dérivation département depuis code postal
 *   7. Dérivation région depuis département
 *   8. Validation Zod du résultat
 */

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  CleanEadCenterSchema,
  RawEadCenterSchema,
  getDepartmentFromPostalCode,
  getRegionFromDepartment,
} from "./types.js";
import type { CleanEadCenter, RawEadCenter } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

const INPUT_PATH = join(PROJECT_ROOT, "data", "raw_centers.json");
const OUTPUT_PATH = join(PROJECT_ROOT, "data", "clean_centers.json");

// ---------------------------------------------------------------------------
// Normalisation téléphone
// ---------------------------------------------------------------------------

/**
 * Normalise un numéro de téléphone français vers le format international +33XXXXXXXXX.
 *
 * Entrées acceptées :
 *   "01 23 45 67 89", "0123456789", "01.23.45.67.89", "+33 1 23 45 67 89"
 *   "+33123456789", "0033123456789"
 *
 * Retourne undefined si le numéro ne correspond pas à un format français valide.
 */
function normalizePhone(raw: string): string | undefined {
  // Supprimer tous les caractères non numériques sauf le + initial
  const stripped = raw.replace(/[^\d+]/g, "");

  let digits: string;

  if (stripped.startsWith("+33")) {
    digits = stripped.slice(3); // Enlever +33
  } else if (stripped.startsWith("0033")) {
    digits = stripped.slice(4); // Enlever 0033
  } else if (stripped.startsWith("0")) {
    digits = stripped.slice(1); // Enlever le 0 initial
  } else {
    return undefined;
  }

  // Un numéro français a 9 chiffres après le préfixe (ex: 1 23 45 67 89)
  if (digits.length !== 9) return undefined;

  // Vérifier que le premier chiffre est valide pour un numéro français
  // (1-9 pour métropole, 6-7 pour mobile, 8 pour numéros spéciaux non inclus)
  const firstDigit = digits[0];
  if (!firstDigit || !/[1-9]/.test(firstDigit)) return undefined;

  return `+33${digits}`;
}

// ---------------------------------------------------------------------------
// Normalisation email
// ---------------------------------------------------------------------------

/**
 * Valide un email avec une regex RFC 5322 simplifiée.
 * Retourne l'email normalisé (lowercase) ou undefined si invalide.
 */
function normalizeEmail(raw: string): string | undefined {
  const trimmed = raw.trim().toLowerCase();
  // Regex : local@domaine.tld (domaine avec au moins un point, TLD 2-10 chars)
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,10}$/;
  return emailRegex.test(trimmed) ? trimmed : undefined;
}

// ---------------------------------------------------------------------------
// Normalisation URL
// ---------------------------------------------------------------------------

/**
 * Normalise une URL de site web :
 *   - Ajoute https:// si aucun protocole
 *   - Supprime les trailing slashes
 *   - Retourne undefined si l'URL est invalide
 */
function normalizeWebsite(raw: string): string | undefined {
  let url = raw.trim();
  if (!url) return undefined;

  // Ajouter https:// si aucun protocole
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  try {
    const parsed = new URL(url);
    // Rejeter les domaines sans point (ex: "http://localhost")
    if (!parsed.hostname.includes(".")) return undefined;
    // Supprimer trailing slash sur le pathname racine
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Normalisation adresse
// ---------------------------------------------------------------------------

/**
 * Normalise une adresse postale :
 *   - Trim
 *   - Première lettre en majuscule, reste tel quel
 *   - Supprime les doublons d'espaces
 */
function normalizeAddress(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

// ---------------------------------------------------------------------------
// Clé de déduplication
// ---------------------------------------------------------------------------

/**
 * Génère une clé normalisée pour la déduplication.
 * Insensible aux accents, casse, et espaces superflus.
 */
function dedupKey(name: string, postalCode: string): string {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // supprimer accents
      .replace(/[^a-z0-9]/g, ""); // ne garder que alphanumérique

  return `${normalize(name)}|${postalCode.trim()}`;
}

// ---------------------------------------------------------------------------
// Nettoyage d'un centre
// ---------------------------------------------------------------------------

function cleanCenter(raw: RawEadCenter): Omit<CleanEadCenter, "source"> & { source?: string } {
  const phone = raw.phone ? normalizePhone(raw.phone) : undefined;
  const email = raw.email ? normalizeEmail(raw.email) : undefined;
  const website = raw.website ? normalizeWebsite(raw.website) : undefined;
  const address = raw.address ? normalizeAddress(raw.address) : undefined;
  const city = raw.city ? normalizeAddress(raw.city) : undefined;

  // Normaliser le code postal : s'assurer qu'il fait 5 chiffres
  let postal_code: string | undefined;
  if (raw.postal_code) {
    const cp = raw.postal_code.trim().replace(/[^\d]/g, "");
    postal_code = cp.length === 5 ? cp : undefined;
  }

  // Dériver département et région
  const department =
    raw.department ?? (postal_code ? getDepartmentFromPostalCode(postal_code) : undefined);
  const region =
    raw.region ?? (department ? getRegionFromDepartment(department) : undefined);

  return {
    name: raw.name.trim(),
    address,
    city,
    postal_code,
    department,
    region,
    phone,
    email,
    website,
    latitude: raw.latitude,
    longitude: raw.longitude,
    source: raw.source ?? "map",
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log("[cleaner] Lecture de", INPUT_PATH);

  let rawData: { centers: RawEadCenter[]; count: number; scraped_at?: string };
  try {
    const content = readFileSync(INPUT_PATH, "utf-8");
    rawData = JSON.parse(content) as typeof rawData;
  } catch (err) {
    console.error("[cleaner] Impossible de lire raw_centers.json :", err);
    console.error("[cleaner] Lancez d'abord : SCRAPE_DRY_RUN=false tsx scripts/scraper.ts");
    process.exit(1);
  }

  const rawCenters = rawData.centers;
  console.log(`[cleaner] ${rawCenters.length} centres bruts à traiter`);

  // Validation de l'input
  const validatedRaw: RawEadCenter[] = [];
  for (const item of rawCenters) {
    const result = RawEadCenterSchema.safeParse(item);
    if (result.success) {
      validatedRaw.push(result.data);
    } else {
      console.warn(`[cleaner][WARN] Centre ignoré (invalide) : "${(item as { name?: string }).name ?? "?"}" — ${result.error.issues[0]?.message}`);
    }
  }

  // Nettoyage
  const cleaned = validatedRaw.map(cleanCenter);

  // Déduplication (garder le premier trouvé en cas de doublon)
  const seen = new Map<string, boolean>();
  const deduped: CleanEadCenter[] = [];
  let dupCount = 0;

  for (const center of cleaned) {
    const key = dedupKey(center.name, center.postal_code ?? "");
    if (seen.has(key)) {
      dupCount++;
      console.warn(
        `[cleaner][DEDUP] Doublon ignoré : "${center.name}" (${center.postal_code ?? "CP manquant"})`
      );
      continue;
    }
    seen.set(key, true);

    // Validation Zod finale (on ignore les erreurs non-bloquantes)
    const result = CleanEadCenterSchema.safeParse(center);
    if (result.success) {
      deduped.push(result.data);
    } else {
      // On garde quand même le centre mais on alerte
      deduped.push(center as CleanEadCenter);
      const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      console.warn(`[cleaner][WARN] Centre avec données partielles : "${center.name}" — ${issues}`);
    }
  }

  console.log(
    `[cleaner] Résultat : ${deduped.length} centres propres (${dupCount} doublons supprimés)`
  );

  // Statistiques de complétude
  const stats = {
    total: deduped.length,
    with_phone: deduped.filter((c) => c.phone).length,
    with_email: deduped.filter((c) => c.email).length,
    with_website: deduped.filter((c) => c.website).length,
    with_gps: deduped.filter((c) => c.latitude && c.longitude).length,
    with_address: deduped.filter((c) => c.address && c.postal_code && c.city).length,
  };
  console.log("[cleaner] Statistiques de complétude :", stats);

  // Écriture
  mkdirSync(join(PROJECT_ROOT, "data"), { recursive: true });
  const payload = {
    cleaned_at: new Date().toISOString(),
    source_scraped_at: rawData.scraped_at,
    count: deduped.length,
    stats,
    centers: deduped,
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`[cleaner] Écrit : ${OUTPUT_PATH}`);
}

main();
