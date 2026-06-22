/**
 * types.ts — Schéma partagé EAD-France
 *
 * Source de vérité pour la structure d'un centre installateur EAD.
 * Aligné sur la table Supabase `ead_centers` définie dans ARCHITECTURE.md.
 * Utilisé par tous les scripts du pipeline (scraper, cleaner, enricher, scorer, exporter).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schéma Zod — validation à l'exécution
// ---------------------------------------------------------------------------

/**
 * Source de la donnée : "map" = carte nationale JS, "pdf:<dept>" = PDF préfectoral.
 * Exemples : "map", "pdf:12" (Aveyron), "pdf:34" (Hérault).
 */
export const SourceSchema = z
  .string()
  .regex(
    /^(map|pdf:[0-9]{2,3}|pdf:2[AB])$/,
    'Source doit être "map" ou "pdf:<code_dept>"'
  );

/**
 * Données brutes issues du scraper.
 * Tous les champs sont optionnels sauf name — la source peut être incomplète.
 */
export const RawEadCenterSchema = z.object({
  name: z.string().min(1, "Le nom est obligatoire"),
  address: z.string().optional(),
  city: z.string().optional(),
  postal_code: z.string().optional(),
  department: z.string().optional(),
  region: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  source: SourceSchema.optional(),
});

/**
 * Données nettoyées issues du cleaner.
 * postal_code, city et department sont requis après nettoyage.
 */
export const CleanEadCenterSchema = RawEadCenterSchema.extend({
  postal_code: z
    .string()
    .regex(/^\d{5}$/, "Code postal doit être 5 chiffres")
    .optional(),
  phone: z
    .string()
    .regex(/^\+33[0-9]{9}$/, "Téléphone doit être en format +33XXXXXXXXX")
    .optional(),
  email: z
    .string()
    .email("Email invalide")
    .optional(),
  website: z
    .string()
    .url("URL de site web invalide")
    .optional(),
  source: SourceSchema,
});

/**
 * Données enrichies issues de l'enricher (Google Places / Pages Jaunes).
 */
export const EnrichedEadCenterSchema = CleanEadCenterSchema.extend({
  google_rating: z.number().min(0).max(5).optional(),
  google_reviews: z.number().int().min(0).optional(),
  services: z
    .object({
      horaires: z.record(z.string()).optional(), // { "lundi": "09:00-18:00", ... }
      types_service: z.array(z.string()).optional(), // ["installation", "étalonnage", ...]
    })
    .optional(),
  google_place_id: z.string().optional(), // pour traçabilité / re-fetch ultérieur
});

/**
 * Données scorées issues du scorer.
 * Champ ead_score ajouté avec le détail des points par critère.
 */
export const ScoredEadCenterSchema = EnrichedEadCenterSchema.extend({
  ead_score: z.number().int().min(0).max(100),
  score_detail: z.object({
    website: z.number().int(),        // 0 ou 20
    email: z.number().int(),          // 0 ou 15
    phone: z.number().int(),          // 0 ou 10
    gps: z.number().int(),            // 0 ou 10
    google_rating: z.number().int(),  // 0 ou 15
    google_reviews: z.number().int(), // 0, 5, 10 ou 15
    address: z.number().int(),        // 0 à 15 (5 pts par champ : CP, ville, région)
  }),
});

// ---------------------------------------------------------------------------
// Types TypeScript inférés depuis Zod
// ---------------------------------------------------------------------------

export type RawEadCenter = z.infer<typeof RawEadCenterSchema>;
export type CleanEadCenter = z.infer<typeof CleanEadCenterSchema>;
export type EnrichedEadCenter = z.infer<typeof EnrichedEadCenterSchema>;
export type ScoredEadCenter = z.infer<typeof ScoredEadCenterSchema>;

// ---------------------------------------------------------------------------
// Constantes : département → région (France métropolitaine + DROM)
// ---------------------------------------------------------------------------

/**
 * Table de correspondance code département → nom de région.
 * Couvre les 101 départements français (y.c. 2A, 2B et 971-976).
 * Utilisée dans cleaner.ts pour dériver la région depuis le code postal.
 */
export const DEPT_TO_REGION: Record<string, string> = {
  "01": "Auvergne-Rhône-Alpes",
  "02": "Hauts-de-France",
  "03": "Auvergne-Rhône-Alpes",
  "04": "Provence-Alpes-Côte d'Azur",
  "05": "Provence-Alpes-Côte d'Azur",
  "06": "Provence-Alpes-Côte d'Azur",
  "07": "Auvergne-Rhône-Alpes",
  "08": "Grand Est",
  "09": "Occitanie",
  "10": "Grand Est",
  "11": "Occitanie",
  "12": "Occitanie",
  "13": "Provence-Alpes-Côte d'Azur",
  "14": "Normandie",
  "15": "Auvergne-Rhône-Alpes",
  "16": "Nouvelle-Aquitaine",
  "17": "Nouvelle-Aquitaine",
  "18": "Centre-Val de Loire",
  "19": "Nouvelle-Aquitaine",
  "2A": "Corse",
  "2B": "Corse",
  "21": "Bourgogne-Franche-Comté",
  "22": "Bretagne",
  "23": "Nouvelle-Aquitaine",
  "24": "Nouvelle-Aquitaine",
  "25": "Bourgogne-Franche-Comté",
  "26": "Auvergne-Rhône-Alpes",
  "27": "Normandie",
  "28": "Centre-Val de Loire",
  "29": "Bretagne",
  "30": "Occitanie",
  "31": "Occitanie",
  "32": "Occitanie",
  "33": "Nouvelle-Aquitaine",
  "34": "Occitanie",
  "35": "Bretagne",
  "36": "Centre-Val de Loire",
  "37": "Centre-Val de Loire",
  "38": "Auvergne-Rhône-Alpes",
  "39": "Bourgogne-Franche-Comté",
  "40": "Nouvelle-Aquitaine",
  "41": "Centre-Val de Loire",
  "42": "Auvergne-Rhône-Alpes",
  "43": "Auvergne-Rhône-Alpes",
  "44": "Pays de la Loire",
  "45": "Centre-Val de Loire",
  "46": "Occitanie",
  "47": "Nouvelle-Aquitaine",
  "48": "Occitanie",
  "49": "Pays de la Loire",
  "50": "Normandie",
  "51": "Grand Est",
  "52": "Grand Est",
  "53": "Pays de la Loire",
  "54": "Grand Est",
  "55": "Grand Est",
  "56": "Bretagne",
  "57": "Grand Est",
  "58": "Bourgogne-Franche-Comté",
  "59": "Hauts-de-France",
  "60": "Hauts-de-France",
  "61": "Normandie",
  "62": "Hauts-de-France",
  "63": "Auvergne-Rhône-Alpes",
  "64": "Nouvelle-Aquitaine",
  "65": "Occitanie",
  "66": "Occitanie",
  "67": "Grand Est",
  "68": "Grand Est",
  "69": "Auvergne-Rhône-Alpes",
  "70": "Bourgogne-Franche-Comté",
  "71": "Bourgogne-Franche-Comté",
  "72": "Pays de la Loire",
  "73": "Auvergne-Rhône-Alpes",
  "74": "Auvergne-Rhône-Alpes",
  "75": "Île-de-France",
  "76": "Normandie",
  "77": "Île-de-France",
  "78": "Île-de-France",
  "79": "Nouvelle-Aquitaine",
  "80": "Hauts-de-France",
  "81": "Occitanie",
  "82": "Occitanie",
  "83": "Provence-Alpes-Côte d'Azur",
  "84": "Provence-Alpes-Côte d'Azur",
  "85": "Pays de la Loire",
  "86": "Nouvelle-Aquitaine",
  "87": "Nouvelle-Aquitaine",
  "88": "Grand Est",
  "89": "Bourgogne-Franche-Comté",
  "90": "Bourgogne-Franche-Comté",
  "91": "Île-de-France",
  "92": "Île-de-France",
  "93": "Île-de-France",
  "94": "Île-de-France",
  "95": "Île-de-France",
  "971": "Guadeloupe",
  "972": "Martinique",
  "973": "Guyane",
  "974": "La Réunion",
  "976": "Mayotte",
};

/**
 * Dérive le code département depuis un code postal français.
 * Gère les cas spéciaux : Corse (20xxx → 2A/2B), DOM (971-976).
 */
export function getDepartmentFromPostalCode(
  postalCode: string
): string | undefined {
  const cp = postalCode.trim();
  if (!/^\d{5}$/.test(cp)) return undefined;

  // DOM : 971xx, 972xx, 973xx, 974xx, 976xx
  const domPrefix = cp.substring(0, 3);
  if (["971", "972", "973", "974", "976"].includes(domPrefix)) {
    return domPrefix;
  }

  // Corse : 20xxx
  // 200xx-201xx → 2A (Corse-du-Sud), 202xx-206xx → 2B (Haute-Corse)
  const prefix2 = cp.substring(0, 2);
  if (prefix2 === "20") {
    const third = parseInt(cp[2] ?? "0", 10);
    return third <= 1 ? "2A" : "2B";
  }

  return prefix2;
}

/**
 * Dérive la région depuis le code département.
 */
export function getRegionFromDepartment(dept: string): string | undefined {
  return DEPT_TO_REGION[dept];
}
