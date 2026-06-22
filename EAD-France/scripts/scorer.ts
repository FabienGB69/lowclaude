/**
 * scorer.ts — Calcul du score qualité EAD /100
 *
 * Lit  : data/enriched_centers.json
 * Écrit: data/scored_centers.json
 *
 * Grille de scoring définie par Max (ARCHITECTURE.md) :
 * ┌──────────────────────────────────────────────┬────────┐
 * │ Critère                                      │ Points │
 * ├──────────────────────────────────────────────┼────────┤
 * │ Site web présent & URL valide                │  20    │
 * │ Email valide                                 │  15    │
 * │ Téléphone présent (format +33)               │  10    │
 * │ Coordonnées GPS présentes (lat + lng)         │  10    │
 * │ Note Google présente (≥ 1 avis)              │  15    │
 * │ Volume d'avis (≥50→15, ≥10→10, ≥1→5, 0→0)  │  15    │
 * │ Complétude adresse (CP+ville+région, 5 each) │  15    │
 * ├──────────────────────────────────────────────┼────────┤
 * │ Total                                        │ 100    │
 * └──────────────────────────────────────────────┴────────┘
 *
 * Le score_detail expose le détail par critère pour faciliter le debug
 * et permettre à Max / Alex de l'afficher côté frontend.
 */

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { EnrichedEadCenter, ScoredEadCenter } from "./types.js";
import { ScoredEadCenterSchema } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

const INPUT_PATH = join(PROJECT_ROOT, "data", "enriched_centers.json");
const OUTPUT_PATH = join(PROJECT_ROOT, "data", "scored_centers.json");

// ---------------------------------------------------------------------------
// Grille de scoring (constantes issues de l'ARCHITECTURE.md)
// ---------------------------------------------------------------------------

const SCORE = {
  WEBSITE: 20,
  EMAIL: 15,
  PHONE: 10,
  GPS: 10,
  GOOGLE_RATING: 15,
  REVIEWS_HIGH: 15,  // ≥ 50 avis
  REVIEWS_MID: 10,   // ≥ 10 avis
  REVIEWS_LOW: 5,    // ≥ 1 avis
  ADDRESS_PER_FIELD: 5, // code postal, ville, région — 5 pts chacun → max 15
} as const;

// ---------------------------------------------------------------------------
// Calcul du score pour un centre
// ---------------------------------------------------------------------------

/**
 * Calcule l'EAD Score /100 pour un centre enrichi.
 * Retourne le score total et le détail par critère.
 */
function scoreCenter(center: EnrichedEadCenter): ScoredEadCenter["score_detail"] & { total: number } {
  // --- Site web (20 pts) ---
  // Doit être une URL valide (le cleaner a déjà normalisé)
  let website = 0;
  if (center.website) {
    try {
      new URL(center.website);
      website = SCORE.WEBSITE;
    } catch {
      website = 0;
    }
  }

  // --- Email (15 pts) ---
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,10}$/;
  const email = center.email && emailRegex.test(center.email) ? SCORE.EMAIL : 0;

  // --- Téléphone (10 pts) ---
  // Le cleaner garantit le format +33XXXXXXXXX si présent
  const phone = center.phone ? SCORE.PHONE : 0;

  // --- GPS (10 pts) ---
  // Latitude et longitude doivent toutes deux être présentes et dans des plages valides
  const hasValidGps =
    center.latitude !== undefined &&
    center.longitude !== undefined &&
    center.latitude >= -90 && center.latitude <= 90 &&
    center.longitude >= -180 && center.longitude <= 180 &&
    // Vérification sommaire que c'est bien en France (métropole + DROM)
    (
      // Métropole
      (center.latitude >= 41 && center.latitude <= 51.5 &&
        center.longitude >= -5.5 && center.longitude <= 9.5) ||
      // DROM (Guadeloupe, Martinique, Guyane, Réunion, Mayotte)
      (center.latitude >= -25 && center.latitude <= 16 &&
        center.longitude >= -65 && center.longitude <= 56)
    );
  const gps = hasValidGps ? SCORE.GPS : 0;

  // --- Note Google (15 pts) ---
  // Présente uniquement si on a au moins 1 avis (sinon la note n'est pas significative)
  const hasGoogleRating =
    center.google_rating !== undefined &&
    center.google_reviews !== undefined &&
    center.google_reviews >= 1;
  const google_rating = hasGoogleRating ? SCORE.GOOGLE_RATING : 0;

  // --- Volume d'avis (15 pts, tiered) ---
  let google_reviews = 0;
  const reviewCount = center.google_reviews ?? 0;
  if (reviewCount >= 50) {
    google_reviews = SCORE.REVIEWS_HIGH;
  } else if (reviewCount >= 10) {
    google_reviews = SCORE.REVIEWS_MID;
  } else if (reviewCount >= 1) {
    google_reviews = SCORE.REVIEWS_LOW;
  }

  // --- Complétude adresse (15 pts = 5 pts × 3 champs : CP, ville, région) ---
  let address = 0;
  if (center.postal_code && /^\d{5}$/.test(center.postal_code)) address += SCORE.ADDRESS_PER_FIELD;
  if (center.city && center.city.trim().length > 0) address += SCORE.ADDRESS_PER_FIELD;
  if (center.region && center.region.trim().length > 0) address += SCORE.ADDRESS_PER_FIELD;

  const total = website + email + phone + gps + google_rating + google_reviews + address;

  return { website, email, phone, gps, google_rating, google_reviews, address, total };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log("[scorer] Lecture de", INPUT_PATH);

  let inputData: { centers: EnrichedEadCenter[]; enriched_at?: string };
  try {
    inputData = JSON.parse(readFileSync(INPUT_PATH, "utf-8")) as typeof inputData;
  } catch (err) {
    console.error("[scorer] Impossible de lire enriched_centers.json :", err);
    console.error("[scorer] Lancez d'abord : tsx scripts/enricher.ts");
    process.exit(1);
  }

  const centers = inputData.centers;
  console.log(`[scorer] ${centers.length} centres à scorer`);

  const scored: ScoredEadCenter[] = [];

  for (const center of centers) {
    const { total, ...detail } = scoreCenter(center as EnrichedEadCenter);
    const scoredCenter: ScoredEadCenter = {
      ...(center as EnrichedEadCenter),
      ead_score: total,
      score_detail: detail,
    };

    // Validation Zod
    const result = ScoredEadCenterSchema.safeParse(scoredCenter);
    if (result.success) {
      scored.push(result.data);
    } else {
      // Conserver quand même avec log d'alerte
      scored.push(scoredCenter);
      console.warn(
        `[scorer][WARN] Validation partielle pour "${center.name}" :`,
        result.error.issues[0]?.message
      );
    }
  }

  // Statistiques de distribution des scores
  const scores = scored.map((c) => c.ead_score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const distribution = {
    "80-100": scores.filter((s) => s >= 80).length,
    "60-79": scores.filter((s) => s >= 60 && s < 80).length,
    "40-59": scores.filter((s) => s >= 40 && s < 60).length,
    "20-39": scores.filter((s) => s >= 20 && s < 40).length,
    "0-19": scores.filter((s) => s < 20).length,
  };

  console.log(`[scorer] Score moyen : ${avg.toFixed(1)}/100`);
  console.log("[scorer] Distribution :", distribution);

  // Top 5 et flop 5 pour inspection
  const sortedByScore = [...scored].sort((a, b) => b.ead_score - a.ead_score);
  console.log("\n--- Top 5 centres (score le plus haut) ---");
  for (const c of sortedByScore.slice(0, 5)) {
    console.log(`  ${c.ead_score}/100 — ${c.name} (${c.city ?? "?"}, ${c.department ?? "?"})`);
  }
  console.log("\n--- Flop 5 centres (score le plus bas) ---");
  for (const c of sortedByScore.slice(-5).reverse()) {
    console.log(`  ${c.ead_score}/100 — ${c.name} (${c.city ?? "?"}, ${c.department ?? "?"})`);
  }
  console.log("");

  // Écriture
  mkdirSync(join(PROJECT_ROOT, "data"), { recursive: true });
  const payload = {
    scored_at: new Date().toISOString(),
    source_enriched_at: inputData.enriched_at,
    count: scored.length,
    stats: {
      avg_score: parseFloat(avg.toFixed(1)),
      distribution,
    },
    centers: scored,
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`[scorer] Écrit : ${OUTPUT_PATH}`);
}

main();
