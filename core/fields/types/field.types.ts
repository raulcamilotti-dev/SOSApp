export type BaseField = {
  label: string;
  field: string;
  editable?: boolean;
};

export type TextField = BaseField & {
  type: "text";
};

export type ToggleField = BaseField & {
  type: "toggle";
  options: { label: string; value: string }[];
};

export type FieldDefinition = TextField | ToggleField;
export type FieldValue = string | null;
export type FieldValues = Record<string, FieldValue>;
export type FieldErrors = Record<string, string>;