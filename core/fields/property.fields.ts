export type PropertyFieldType = "text" | "toggle" | "money";

export const propertyFields = [
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
    field: "city_rural",
    label: "Localização",
    type: "toggle",
    options: [
      { label: "Urbano", value: "Urbano" },
      { label: "Rural", value: "Rural" },
    ],
  },
  {
    field: "has_registry",
    label: "Possui registro?",
    type: "toggle",
    options: [
      { label: "Sim", value: "Sim" },
      { label: "Não", value: "Não" },
    ],
  },
  {
    field: "has_contract",
    label: "Possui contrato?",
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