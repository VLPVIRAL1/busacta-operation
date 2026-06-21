-- Switch WhatsApp integration key from 'twilio_whatsapp' to 'meta_whatsapp'.
-- This renames any existing saved row so credentials aren't orphaned.
UPDATE integration_credentials
  SET integration_key = 'meta_whatsapp',
      display_name    = 'Meta WhatsApp Cloud API'
WHERE integration_key = 'twilio_whatsapp';
