
-- Enterprise Form Engine: Phase 1 foundations
-- New block types for the upgraded organizer hub
ALTER TYPE public.organizer_block_type ADD VALUE IF NOT EXISTS 'rich_text';
ALTER TYPE public.organizer_block_type ADD VALUE IF NOT EXISTS 'multi_file';
ALTER TYPE public.organizer_block_type ADD VALUE IF NOT EXISTS 'calculated';

-- Display mode for templates: card (Typeform-style) or page (Google-Forms-style)
DO $$ BEGIN
  CREATE TYPE public.organizer_display_mode AS ENUM ('card', 'page');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.organizer_templates
  ADD COLUMN IF NOT EXISTS display_mode public.organizer_display_mode NOT NULL DEFAULT 'page';

ALTER TABLE public.organizer_deployments
  ADD COLUMN IF NOT EXISTS display_mode_override public.organizer_display_mode;
