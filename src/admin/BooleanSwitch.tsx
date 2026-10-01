import { Switch, Typography, theme } from 'antd';

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
  const { token } = theme.useToken();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: token.margin,
        padding: `${token.paddingXXS + 2}px ${token.paddingSM}px`,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadius,
      }}
    >
      <Typography.Text id={`${id}-label`}>{label}</Typography.Text>
      <Switch
        id={id}
        checked={checked}
        onChange={onCheckedChange}
        disabled={disabled}
        aria-labelledby={`${id}-label`}
      />
    </div>
  );
}
