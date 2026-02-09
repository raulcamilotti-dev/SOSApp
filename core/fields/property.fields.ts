export type PropertyFieldType = "text" | "toggle" | "money";

export type PropertyField = {
  field: string;
  label: string;
  type: PropertyFieldType;
  options?: { label: string; value: string }[];
};

export const propertyFields: PropertyField[] = [
  {
    field: "address",
    label: "Endereço",
    type: "text",
  },
  {
    field: "number",
    label: "Número",
    type: "text",
  },
  {
    field: "complement",
    label: "Complemento",
    type: "text",
  },
  {
    field: "city",
    label: "Cidade",
    type: "text",
  },
  {
    field: "state",
    label: "Estado",
    type: "text",
  },
  {
    field: "postal_code",
    label: "CEP",
    type: "text",
  },
  {
    field: "indicacao",
    label: "Código promocional",
    type: "text",
  },
  {
    field: "city_rural",
    label: "O imóvel é urbano ou rural?",
    type: "toggle",
    options: [
      { label: "Urbano", value: "Urbano" },
      { label: "Rural", value: "Rural" },
    ],
  },
  {
    field: "has_registry",
    label: "O imóvel possui matrícula ou transcrição?",
    type: "toggle",
    options: [
      { label: "Sim", value: "Sim" },
      { label: "Não", value: "Não" },
    ],
  },
  {
    field: "has_contract",
    label:
      "Você possui contrato de compra e venda / contrato de gaveta deste imóvel?",
    type: "toggle",
    options: [
      { label: "Sim", value: "Sim" },
      { label: "Não", value: "Não" },
    ],
  },
  {
    field: "part_of_larger_area",
    label: "Este imóvel está dentro de um terreno maior?",
    type: "toggle",
    options: [
      { label: "Sim", value: "Sim" },
      { label: "Não", value: "Não" },
    ],
  },
  {
    field: "owner_relative",
    label: "O proprietário atual é seu parente?",
    type: "toggle",
    options: [
      { label: "Sim", value: "Sim" },
      { label: "Não", value: "Não" },
    ],
  },
  {
    field: "larger_area_registry",
    label: "Se estiver dentro de um terreno maior, a área maior tem registro?",
    type: "toggle",
    options: [
      { label: "Sim", value: "Sim" },
      { label: "Não", value: "Não" },
    ],
  },
  {
    field: "property_value",
    label: "Valor do imóvel",
    type: "money",
  },
];
