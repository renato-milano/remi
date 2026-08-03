import React from "react";

// Lingua corrente, fornita dalla composizione (IT default, EN per le -EN).
export type Lang = "it" | "en";
export const LangContext = React.createContext<Lang>("it");
export const useLang = (): Lang => React.useContext(LangContext);
