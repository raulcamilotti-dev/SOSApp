import { Redirect } from "expo-router";

/**
 * Deprecated: CNPJ consultation is now integrated directly into
 * the Companies screen (Admin: companies.tsx, Client: MinhasEmpresas.tsx).
 * This route redirects to the companies admin screen.
 */
export default function CnpjConsultaScreen() {
  return <Redirect href="/(app)/Administrador/companies" />;
}
