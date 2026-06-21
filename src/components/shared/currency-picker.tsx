/**
 * CurrencyPicker — small 3-letter ISO currency dropdown.
 * Used wherever the billing engine needs an explicit currency:
 *   • Firm Profile (root default)
 *   • Project Overview (optional override — null = inherit from firm)
 *   • Pricing Period (frozen at period level)
 *
 * The list intentionally stays short. Most B2B firms billing the US +
 * India corridors live inside this set; we can expand on request.
 */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const SUPPORTED_CURRENCIES: { code: string; label: string }[] = [
  { code: "USD", label: "USD — US Dollar" },
  { code: "INR", label: "INR — Indian Rupee" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "CAD", label: "CAD — Canadian Dollar" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "AED", label: "AED — UAE Dirham" },
  { code: "SGD", label: "SGD — Singapore Dollar" },
];

export function CurrencyPicker({
  value,
  onChange,
  allowInherit = false,
  inheritLabel = "Inherit",
  disabled,
  className,
}: {
  value: string | null | undefined;
  onChange: (next: string | null) => void;
  /** When true, adds an "Inherit" option that maps to null. */
  allowInherit?: boolean;
  inheritLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const current = value ?? (allowInherit ? "__inherit__" : "USD");
  return (
    <Select
      value={current}
      onValueChange={(v) => onChange(v === "__inherit__" ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowInherit && <SelectItem value="__inherit__">{inheritLabel}</SelectItem>}
        {SUPPORTED_CURRENCIES.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            {c.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
