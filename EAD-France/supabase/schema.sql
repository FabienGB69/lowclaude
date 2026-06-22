-- =============================================================================
-- schema.sql — Table Supabase pour les installateurs EAD agréés
-- EAD-France / Architecture définie par Max (ARCHITECTURE.md)
-- =============================================================================
-- Déploiement : supabase db push  (ou copier-coller dans l'éditeur SQL Supabase)
-- =============================================================================

-- Extension UUID (activée par défaut sur Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Table principale
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ead_centers (
    -- Identifiant primaire
    id                uuid            PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identité de l'établissement
    name              text            NOT NULL,
    address           text,               -- voie (ex: "12 rue de la Paix")
    postal_code       text,               -- 5 chiffres conservés en text (zéros de tête)
    city              text,
    department        text,               -- code département (ex: "75", "2A", "971")
    region            text,               -- nom de région (ex: "Île-de-France")

    -- Contacts
    phone             text,               -- format +33XXXXXXXXX
    email             text,               -- email normalisé lowercase
    website           text,               -- URL normalisée https://...

    -- Géolocalisation
    latitude          double precision,   -- de la carte si dispo, sinon géocodage
    longitude         double precision,

    -- Enrichissement Google Places
    google_rating     numeric(2, 1),      -- note 0.0 à 5.0
    google_reviews    integer,            -- nombre total d'avis

    -- Services et horaires (structuré)
    services          jsonb,              -- { "horaires": {...}, "types_service": [...] }

    -- Score qualité
    ead_score         integer,            -- /100, calculé par scorer.ts

    -- Traçabilité de la source
    source            text,               -- "map" | "pdf:<code_dept>"

    -- Timestamps
    created_at        timestamptz         NOT NULL DEFAULT now(),
    updated_at        timestamptz         NOT NULL DEFAULT now()
);

-- =============================================================================
-- Contrainte d'unicité pour l'upsert idempotent
-- Clé naturelle : nom + code postal (aligné avec la dédup du cleaner)
-- =============================================================================

ALTER TABLE public.ead_centers
    ADD CONSTRAINT ead_centers_name_postal_code_unique
    UNIQUE (name, postal_code);

-- =============================================================================
-- Index utiles
-- =============================================================================

-- Recherche par département (filtres géographiques courants)
CREATE INDEX IF NOT EXISTS idx_ead_centers_department
    ON public.ead_centers (department);

-- Recherche par région
CREATE INDEX IF NOT EXISTS idx_ead_centers_region
    ON public.ead_centers (region);

-- Tri par score décroissant (affichage "meilleurs installateurs")
CREATE INDEX IF NOT EXISTS idx_ead_centers_ead_score
    ON public.ead_centers (ead_score DESC);

-- Recherche full-text sur le nom (pour la barre de recherche frontend)
CREATE INDEX IF NOT EXISTS idx_ead_centers_name_trgm
    ON public.ead_centers USING gin (name gin_trgm_ops)
    WHERE name IS NOT NULL;
-- Note : nécessite l'extension pg_trgm (activée par défaut sur Supabase)
-- Si non disponible, utiliser : CREATE INDEX ... ON ead_centers (name);

-- Géolocalisation (requêtes "centres proches de moi")
-- PostGIS n'est pas requis pour un dataset de ~226 points —
-- une recherche par boîte englobante (lat/lng BETWEEN) suffit.
CREATE INDEX IF NOT EXISTS idx_ead_centers_gps
    ON public.ead_centers (latitude, longitude)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- =============================================================================
-- Trigger : mise à jour automatique de updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ead_centers_set_updated_at ON public.ead_centers;

CREATE TRIGGER trg_ead_centers_set_updated_at
    BEFORE UPDATE ON public.ead_centers
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================

ALTER TABLE public.ead_centers ENABLE ROW LEVEL SECURITY;

-- Lecture publique : les données sont publiques (source = site gouvernemental)
CREATE POLICY "ead_centers_select_public"
    ON public.ead_centers
    FOR SELECT
    USING (true);

-- Écriture réservée au service_role (pipeline backend uniquement)
-- Les insertions / mises à jour passent par le service_key Supabase,
-- jamais exposé côté client.
CREATE POLICY "ead_centers_insert_service"
    ON public.ead_centers
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "ead_centers_update_service"
    ON public.ead_centers
    FOR UPDATE
    USING (auth.role() = 'service_role');

CREATE POLICY "ead_centers_delete_service"
    ON public.ead_centers
    FOR DELETE
    USING (auth.role() = 'service_role');

-- =============================================================================
-- Commentaires (documentation inline de la table)
-- =============================================================================

COMMENT ON TABLE  public.ead_centers IS
    'Installateurs EAD (Éthylotests Anti-Démarrage) agréés en France. ~226 établissements. Source : securite-routiere.gouv.fr + enrichissement Google Places.';

COMMENT ON COLUMN public.ead_centers.ead_score IS
    'Score qualité /100 : site_web(20) + email(15) + phone(10) + gps(10) + google_rating(15) + google_reviews(15) + adresse(15)';
COMMENT ON COLUMN public.ead_centers.source IS
    '"map" = carte nationale JS ; "pdf:<dept>" = PDF préfectoral (ex: "pdf:12" pour Aveyron)';
COMMENT ON COLUMN public.ead_centers.services IS
    'JSON : { "horaires": { "lundi": "09:00-18:00", ... }, "types_service": ["installation", ...] }';
COMMENT ON COLUMN public.ead_centers.postal_code IS
    'Conservé en text pour préserver les zéros initiaux (ex: "01000" pour Ain)';
