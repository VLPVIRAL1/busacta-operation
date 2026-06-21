-- Billing engine, step 1: enums + extension (must commit before step 2 references them)

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pricing_model_kind') THEN
    CREATE TYPE public.pricing_model_kind AS ENUM (
      'pay_per_task','effective_hours','fixed_person','tbd'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billable_event_status') THEN
    CREATE TYPE public.billable_event_status AS ENUM (
      'ready','deferred','invoiced','recalled','superseded'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billable_event_source') THEN
    CREATE TYPE public.billable_event_source AS ENUM (
      'stage_completion','time_log','fixed_person_cadence','tbd_manual'
    );
  END IF;
END $$;

ALTER TYPE public.invoice_line_source ADD VALUE IF NOT EXISTS 'billable_event';
ALTER TYPE public.invoice_line_source ADD VALUE IF NOT EXISTS 'fixed_person_retainer';
ALTER TYPE public.invoice_line_source ADD VALUE IF NOT EXISTS 'tbd_manual';