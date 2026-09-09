import { FieldLabel } from '../ui/components/ui/field.js';
import { Switch } from '../ui/components/ui/switch.js';

export function BooleanSwitch({
  id,
  label,
  checked,
  onCheckedChange,
  disabled = false,
}: {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5">
      <FieldLabel htmlFor={id} className="cursor-pointer font-normal">
        {label}
      </FieldLabel>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  );
}
