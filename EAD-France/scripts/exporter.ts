/**
 * exporter.ts — Génération des exports finaux
 *
 * Lit  : data/scored_centers.json
 * Écrit: exports/ead_centers.csv
 *        exports/ead_centers.xlsx
 *        exports/ead_centers.json
 *
 * Les trois formats sont générés systématiquement.
 * Le JSON export est "aplati" (sans score_detail, services au format texte)
 * pour être facilement consommable par Alex (SEO) et des outils tiers.
 */

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { stringify as csvStringify } from "csv-stringify/sync";
import type { ScoredEadCenter } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

const INPUT_PATH = join(PROJECT_ROOT, "data", "scored_centers.json");
const EXPORTS_DIR = join(PROJECT_ROOT, "exports");

// ---------------------------------------------------------------------------
// Colonnes d'export (ordre intentionnel pour lisibilité)
// ---------------------------------------------------------------------------

type FlatCenter = {
  nom: string;
  adresse: string;
  code_postal: string;
  ville: string;
  departement: string;
  region: string;
  telephone: string;
  email: string;
  site_web: string;
  latitude: string;
  longitude: string;
  note_google: string;
  nb_avis_google: string;
  horaires: string;
  services: string;
  ead_score: string;
  score_site_web: string;
  score_email: string;
  score_telephone: string;
  score_gps: string;
  score_note_google: string;
  score_avis_google: string;
  score_adresse: string;
  source: string;
};

const CSV_HEADERS: (keyof FlatCenter)[] = [
  "nom",
  "adresse",
  "code_postal",
  "ville",
  "departement",
  "region",
  "telephone",
  "email",
  "site_web",
  "latitude",
  "longitude",
  "note_google",
  "nb_avis_google",
  "horaires",
  "services",
  "ead_score",
  "score_site_web",
  "score_email",
  "score_telephone",
  "score_gps",
  "score_note_google",
  "score_avis_google",
  "score_adresse",
  "source",
];

// ---------------------------------------------------------------------------
// Aplatissement d'un centre scoré
// ---------------------------------------------------------------------------

function flattenCenter(c: ScoredEadCenter): FlatCenter {
  // Sérialiser les horaires en texte lisible : "Lundi: 09:00-18:00 | Mardi: ..."
  const horairesText = c.services?.horaires
    ? Object.entries(c.services.horaires)
        .map(([jour, h]) => `${jour}: ${h}`)
        .join(" | ")
    : "";

  const servicesText = c.services?.types_service?.join(", ") ?? "";

  return {
    nom: c.name,
    adresse: c.address ?? "",
    code_postal: c.postal_code ?? "",
    ville: c.city ?? "",
    departement: c.department ?? "",
    region: c.region ?? "",
    telephone: c.phone ?? "",
    email: c.email ?? "",
    site_web: c.website ?? "",
    latitude: c.latitude !== undefined ? String(c.latitude) : "",
    longitude: c.longitude !== undefined ? String(c.longitude) : "",
    note_google: c.google_rating !== undefined ? String(c.google_rating) : "",
    nb_avis_google: c.google_reviews !== undefined ? String(c.google_reviews) : "",
    horaires: horairesText,
    services: servicesText,
    ead_score: String(c.ead_score),
    score_site_web: String(c.score_detail.website),
    score_email: String(c.score_detail.email),
    score_telephone: String(c.score_detail.phone),
    score_gps: String(c.score_detail.gps),
    score_note_google: String(c.score_detail.google_rating),
    score_avis_google: String(c.score_detail.google_reviews),
    score_adresse: String(c.score_detail.address),
    source: c.source ?? "",
  };
}

// ---------------------------------------------------------------------------
// Export CSV
// ---------------------------------------------------------------------------

function exportCsv(flatCenters: FlatCenter[], outputPath: string): void {
  const rows = flatCenters.map((c) => CSV_HEADERS.map((h) => c[h]));

  const csv = csvStringify([CSV_HEADERS, ...rows], {
    delimiter: ",",
    quoted: true,
    quoted_empty: false,
    bom: true, // BOM UTF-8 pour Excel français
  });

  writeFileSync(outputPath, csv, "utf-8");
  console.log(`[exporter] CSV écrit : ${outputPath} (${flatCenters.length} lignes)`);
}

// ---------------------------------------------------------------------------
// Export XLSX
// ---------------------------------------------------------------------------

async function exportXlsx(flatCenters: FlatCenter[], outputPath: string): Promise<void> {
  // Import dynamique pour compatibilité ESM
  const XLSX = await import("xlsx");

  // En-têtes lisibles en français
  const headerLabels: Record<keyof FlatCenter, string> = {
    nom: "Nom",
    adresse: "Adresse",
    code_postal: "Code postal",
    ville: "Ville",
    departement: "Département",
    region: "Région",
    telephone: "Téléphone",
    email: "Email",
    site_web: "Site web",
    latitude: "Latitude",
    longitude: "Longitude",
    note_google: "Note Google",
    nb_avis_google: "Nb avis Google",
    horaires: "Horaires",
    services: "Services",
    ead_score: "EAD Score /100",
    score_site_web: "Score site web",
    score_email: "Score email",
    score_telephone: "Score téléphone",
    score_gps: "Score GPS",
    score_note_google: "Score note Google",
    score_avis_google: "Score avis Google",
    score_adresse: "Score adresse",
    source: "Source",
  };

  // Construire les données avec en-têtes français
  const wsData = [
    CSV_HEADERS.map((h) => headerLabels[h]),
    ...flatCenters.map((c) => CSV_HEADERS.map((h) => c[h])),
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Largeurs de colonnes (approximatives)
  ws["!cols"] = [
    { wch: 40 }, // nom
    { wch: 35 }, // adresse
    { wch: 12 }, // code_postal
    { wch: 20 }, // ville
    { wch: 15 }, // departement
    { wch: 25 }, // region
    { wch: 16 }, // telephone
    { wch: 30 }, // email
    { wch: 30 }, // site_web
    { wch: 12 }, // latitude
    { wch: 12 }, // longitude
    { wch: 12 }, // note_google
    { wch: 14 }, // nb_avis_google
    { wch: 60 }, // horaires
    { wch: 30 }, // services
    { wch: 14 }, // ead_score
    { wch: 14 }, // score_site_web
    { wch: 14 }, // score_email
    { wch: 14 }, // score_telephone
    { wch: 14 }, // score_gps
    { wch: 14 }, // score_note_google
    { wch: 14 }, // score_avis_google
    { wch: 14 }, // score_adresse
    { wch: 20 }, // source
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Installateurs EAD");

  // Feuille de métadonnées
  const metaWs = XLSX.utils.aoa_to_sheet([
    ["EAD-France — Export installateurs agréés"],
    ["Généré le", new Date().toLocaleDateString("fr-FR")],
    ["Nombre de centres", flatCenters.length],
    ["Source", "securite-routiere.gouv.fr + Google Places"],
    ["Rubrique EAD Score", ""],
    ["Site web présent", "20 pts"],
    ["Email valide", "15 pts"],
    ["Téléphone présent", "10 pts"],
    ["Coordonnées GPS", "10 pts"],
    ["Note Google présente", "15 pts"],
    ["Volume avis (≥50→15, ≥10→10, ≥1→5)", "15 pts"],
    ["Complétude adresse (CP+ville+région)", "15 pts"],
  ]);
  XLSX.utils.book_append_sheet(wb, metaWs, "Infos");

  XLSX.writeFile(wb, outputPath);
  console.log(`[exporter] XLSX écrit : ${outputPath} (${flatCenters.length} lignes)`);
}

// ---------------------------------------------------------------------------
// Export JSON (enrichi, conserve la structure complète)
// ---------------------------------------------------------------------------

function exportJson(centers: ScoredEadCenter[], outputPath: string): void {
  const payload = {
    exported_at: new Date().toISOString(),
    count: centers.length,
    schema_version: "1.0",
    centers,
  };
  writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`[exporter] JSON écrit : ${outputPath} (${centers.length} centres)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("[exporter] Lecture de", INPUT_PATH);

  let inputData: { centers: ScoredEadCenter[]; scored_at?: string };
  try {
    inputData = JSON.parse(readFileSync(INPUT_PATH, "utf-8")) as typeof inputData;
  } catch (err) {
    console.error("[exporter] Impossible de lire scored_centers.json :", err);
    console.error("[exporter] Lancez d'abord : tsx scripts/scorer.ts");
    process.exit(1);
  }

  const centers = inputData.centers;
  console.log(`[exporter] ${centers.length} centres à exporter`);

  // Créer le répertoire exports/
  mkdirSync(EXPORTS_DIR, { recursive: true });

  // Aplatir
  const flatCenters = centers.map(flattenCenter);

  // Trier par score décroissant (les meilleurs centres en premier)
  flatCenters.sort((a, b) => parseInt(b.ead_score, 10) - parseInt(a.ead_score, 10));
  const sortedCenters = [...centers].sort((a, b) => b.ead_score - a.ead_score);

  // Générer les 3 formats
  exportCsv(flatCenters, join(EXPORTS_DIR, "ead_centers.csv"));
  await exportXlsx(flatCenters, join(EXPORTS_DIR, "ead_centers.xlsx"));
  exportJson(sortedCenters, join(EXPORTS_DIR, "ead_centers.json"));

  console.log(`[exporter] Terminé. Fichiers dans : ${EXPORTS_DIR}`);
}

main().catch((err) => {
  console.error("[exporter] Erreur fatale :", err);
  process.exit(1);
});
