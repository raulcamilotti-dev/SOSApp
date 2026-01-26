/* eslint-disable react-hooks/rules-of-hooks */
import { useAppConfig } from "./AppConfigContext";

const { branding } = useAppConfig();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const theme = {
  colors: {
    primary: branding.colors.primary,
    background: branding.colors.background,
    header: branding.colors.header, 
  }
};
