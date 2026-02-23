import { EditableField } from "./EditableField";
import { EditableToggle } from "./EditableToggle";

type FieldRendererProps = {
  propertyId: string;
  field: string;
  label: string;
  type: "text" | "toggle" | "money";
  options?: { label: string; value: string }[];
  value: any;
  onSave: (value: any) => Promise<void> | void;
  editable?: boolean; // added to match usage
};

export function FieldRenderer({
  propertyId,
  field,
  label,
  type,
  options,
  value,
  onSave,
  editable = false,
}: FieldRendererProps) {
  if (type === "toggle" && options) {
    return (
      <EditableToggle
        label={label}
        value={value}
        options={options}
        field={field}
        propertyId={propertyId}
      />
    );
  }

  return (
    <EditableField
      label={label}
      value={value}
      field={field}
      propertyId={propertyId}
      onSave={onSave}
      editable={editable}
    />
  );
}
