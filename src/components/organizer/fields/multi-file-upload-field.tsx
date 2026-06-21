// Multi-file upload — extends WizardFileUpload's enforcement with
// minFiles + acceptedMime checks. Storage path / bucket inherited.
import { useMemo } from "react";
import { WizardFileUpload } from "@/components/organizer/wizard-file-upload";
import type { MultiFileConfig } from "@/lib/organizer/schemas";

interface Props {
  deploymentId: string;
  blockId: string;
  value: unknown;
  disabled?: boolean;
  onChange: (v: { files?: Array<{ path: string; name: string; size: number }> }) => void;
  config: Partial<MultiFileConfig> & Record<string, unknown>;
}

export function MultiFileUploadField(props: Props) {
  // Pass through; WizardFileUpload already reads maxFiles/maxSizeMb/acceptedMime.
  // Provide sensible defaults for the new `multi_file` block type.
  const config = useMemo(
    () => ({
      maxFiles: 10,
      maxSizeMb: 25,
      minFiles: 0,
      acceptedMime: [],
      ...props.config,
    }),
    [props.config],
  );
  return <WizardFileUpload {...props} config={config as Record<string, unknown>} />;
}
