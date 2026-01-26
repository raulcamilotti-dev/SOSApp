/* eslint-disable react-hooks/rules-of-hooks */
import { useAppConfig } from "./AppConfigContext";

const { branding } = useAppConfig();

const theme = {
  colors: {
    primary: branding.primaryColor,
    background: branding.backgroundColor,
  }
};
