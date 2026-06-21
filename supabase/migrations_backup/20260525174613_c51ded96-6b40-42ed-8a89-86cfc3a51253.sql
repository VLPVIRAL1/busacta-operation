
-- 1. Update the void cascade so it does NOT clobber the originally-recalled event
CREATE OR REPLACE FUNCTION public.on_invoice_voided_recall_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('void','cancelled') AND OLD.status <> NEW.status THEN
    UPDATE public.task_billable_events
       SET status = 'ready',
           invoice_id = NULL,
           invoice_line_item_id = NULL,
           locked_at = NULL, locked_by = NULL,
           unlocked_at = now(), unlocked_by = auth.uid(),
           unlock_reason = COALESCE(unlock_reason,'invoice_voided')
     WHERE invoice_id = NEW.id
       AND status <> 'recalled';
  END IF;
  RETURN NEW;
END $function$;

-- 2. New trigger: when an event is recalled, void its invoice
CREATE OR REPLACE FUNCTION public.on_event_recalled_void_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'invoiced'
     AND NEW.status = 'recalled'
     AND OLD.invoice_id IS NOT NULL THEN
    UPDATE public.invoices
       SET status = 'void',
           updated_at = now()
     WHERE id = OLD.invoice_id
       AND status <> 'void';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_event_recall_voids_invoice ON public.task_billable_events;
CREATE TRIGGER trg_event_recall_voids_invoice
AFTER UPDATE OF status ON public.task_billable_events
FOR EACH ROW
EXECUTE FUNCTION public.on_event_recalled_void_invoice();
