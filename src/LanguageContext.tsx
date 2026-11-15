import React, { createContext, useContext, useState, useEffect } from "react";

export type LanguageCode = "en" | "ur" | "hi" | "ar" | "es" | "fr";

export type LanguageOption = {
  code: LanguageCode;
  name: string;
  nativeName: string;
  flag: string;
  dir: "ltr" | "rtl";
};

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: "en", name: "English", nativeName: "English", flag: "🇬🇧", dir: "ltr" },
  { code: "ur", name: "Urdu", nativeName: "اردو", flag: "🇵🇰", dir: "rtl" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳", dir: "ltr" },
  { code: "ar", name: "Arabic", nativeName: "العربية", flag: "🇸🇦", dir: "rtl" },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸", dir: "ltr" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷", dir: "ltr" },
];

const translations: Record<LanguageCode, Record<string, string>> = {
  en: {
    dashboard: "Dashboard",
    liveCalls: "Live Calls",
    callHistory: "Call History",
    customers: "Customers",
    team: "Team",
    knowledgeBase: "Knowledge Base",
    analytics: "Analytics",
    settings: "Settings",
    startCall: "Start AI Voice Call",
    systemSecure: "System Secure",
    allServicesOperational: "Multilingual AI Core Online",
    simulateCall: "Simulate Inbound Call",
    liveFeed: "Live Audio & Telephony Feed",
    aiResolved: "AI Resolution Rate",
    activeCalls: "Active Calls",
    totalCalls: "Total Calls",
    avgDuration: "Avg Call Duration",
  },
  ur: {
    dashboard: "ڈیش بورڈ",
    liveCalls: "لائیو کالز",
    callHistory: "کال ریکارڈ",
    customers: "صارفین",
    team: "ٹیم اور ایجنٹس",
    knowledgeBase: "معلومات کا خزانہ",
    analytics: "تجزیات",
    settings: "ترتیبات",
    startCall: "AI وائس کال شروع کریں",
    systemSecure: "سسٹم محفوظ ہے",
    allServicesOperational: "تمام ملٹی لینگول سروسز فعال ہیں",
    simulateCall: "فرضی ان باؤنڈ کال چلائیں",
    liveFeed: "براہ راست آڈیو فیڈ",
    aiResolved: "AI حل کی شرح",
    activeCalls: "موجودہ فعال کالز",
    totalCalls: "کل کالز",
    avgDuration: "اوسط وقت",
  },
  hi: {
    dashboard: "डैशबोर्ड",
    liveCalls: "लाइव कॉल",
    callHistory: "कॉल इतिहास",
    customers: "ग्राहक",
    team: "टीम",
    knowledgeBase: "ज्ञान आधार",
    analytics: "एनालिटिक्स",
    settings: "सेटिंग्स",
    startCall: "AI वॉयस कॉल शुरू करें",
    systemSecure: "सिस्टम सुरक्षित",
    allServicesOperational: "बहुभाषी AI कोर सक्रिय",
    simulateCall: "इनबाउंड कॉल सिम्युलेट करें",
    liveFeed: "लाइव ऑडियो फीड",
    aiResolved: "AI समाधान दर",
    activeCalls: "सक्रिय कॉल",
    totalCalls: "कुल कॉल",
    avgDuration: "औसत अवधि",
  },
  ar: {
    dashboard: "لوحة التحكم",
    liveCalls: "المكالمات المباشرة",
    callHistory: "سجل المكالمات",
    customers: "العملاء",
    team: "فريق العمل",
    knowledgeBase: "قاعدة المعرفة",
    analytics: "التحليلات",
    settings: "الإعدادات",
    startCall: "بدء مكالمة صوتية ذكية",
    systemSecure: "النظام آمن",
    allServicesOperational: "محرك الذكاء الاصطناعي متعدد اللغات نشط",
    simulateCall: "محاكاة مكالمة واردة",
    liveFeed: "البث الصوتي المباشر",
    aiResolved: "معدل الحل الذكي",
    activeCalls: "المكالمات الجارية",
    totalCalls: "إجمالي المكالمات",
    avgDuration: "متوسط المدة",
  },
  es: {
    dashboard: "Panel de Control",
    liveCalls: "Llamadas en Vivo",
    callHistory: "Historial de Llamadas",
    customers: "Clientes",
    team: "Equipo",
    knowledgeBase: "Base de Conocimiento",
    analytics: "Analítica",
    settings: "Configuración",
    startCall: "Iniciar Llamada de Voz AI",
    systemSecure: "Sistema Seguro",
    allServicesOperational: "Núcleo de IA Multilingüe Activo",
    simulateCall: "Simular Llamada Entrante",
    liveFeed: "Transmisión de Audio en Vivo",
    aiResolved: "Tasa de Resolución AI",
    activeCalls: "Llamadas Activas",
    totalCalls: "Llamadas Totales",
    avgDuration: "Duración Promedio",
  },
  fr: {
    dashboard: "Tableau de Bord",
    liveCalls: "Appels en Direct",
    callHistory: "Historique des Appels",
    customers: "Clients",
    team: "Équipe",
    knowledgeBase: "Base de Connaissances",
    analytics: "Analyses",
    settings: "Paramètres",
    startCall: "Démarrer Appel Vocal IA",
    systemSecure: "Système Sécurisé",
    allServicesOperational: "Moteur IA Multilingue En Ligne",
    simulateCall: "Simuler un Appel Entrant",
    liveFeed: "Flux Audio en Direct",
    aiResolved: "Taux de Résolution IA",
    activeCalls: "Appels Actifs",
    totalCalls: "Total des Appels",
    avgDuration: "Durée Moyenne",
  },
};

type LanguageContextType = {
  currentLang: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string) => string;
  isRtl: boolean;
};

const LanguageContext = createContext<LanguageContextType>({
  currentLang: "en",
  setLanguage: () => {},
  t: (key: string) => key,
  isRtl: false,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentLang, setCurrentLang] = useState<LanguageCode>(() => {
    const saved = localStorage.getItem("app_language");
    return (saved as LanguageCode) || "en";
  });

  const setLanguage = (lang: LanguageCode) => {
    setCurrentLang(lang);
    localStorage.setItem("app_language", lang);
  };

  const isRtl = currentLang === "ur" || currentLang === "ar";

  const t = (key: string): string => {
    return translations[currentLang]?.[key] || translations.en[key] || key;
  };

  useEffect(() => {
    document.documentElement.lang = currentLang;
  }, [currentLang]);

  return (
    <LanguageContext.Provider value={{ currentLang, setLanguage, t, isRtl }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
