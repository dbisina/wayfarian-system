// app/i18n/index.ts
// Internationalization configuration using react-i18next

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import all language files
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import hi from './locales/hi.json';
import ar from './locales/ar.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import pt from './locales/pt.json';
import it from './locales/it.json';
import ru from './locales/ru.json';
import ko from './locales/ko.json';

const LANGUAGE_STORAGE_KEY = '@wayfarian:language';

// Language metadata for language selector
export const LANGUAGES = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
    { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', rtl: true },
    { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷' },
    { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
    { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' }
];

// Function to get saved language or default
const getInitialLanguage = async (): Promise<string> => {
    try {
        const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (savedLanguage && LANGUAGES.some(lang => lang.code === savedLanguage)) {
            return savedLanguage;
        }
    } catch (error) {
        console.warn('Failed to load saved language:', error);
    }

    // Fallback to device language or English
    const locales = Localization.getLocales();
    const deviceLanguage = locales[0]?.languageCode || 'en';
    const supportedLanguage = LANGUAGES.find(lang => lang.code === deviceLanguage);
    return supportedLanguage ? supportedLanguage.code : 'en';
};

// Function to save language preference
export const saveLanguagePreference = async (languageCode: string) => {
    try {
        await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, languageCode);
    } catch (error) {
        console.error('Failed to save language preference:', error);
    }
};

// Initialize i18next with configuration
const initI18n = async () => {
    const initialLanguage = await getInitialLanguage();

    i18n
        .use(initReactI18next)
        .init({
            compatibilityJSON: 'v3', // For React Native compatibility
            resources: {
                en: { translation: en },
                es: { translation: es },
                fr: { translation: fr },
                de: { translation: de },
                hi: { translation: hi },
                ar: { translation: ar },
                zh: { translation: zh },
                ja: { translation: ja },
                pt: { translation: pt },
                it: { translation: it },
                ru: { translation: ru },
                ko: { translation: ko },
            },
            lng: initialLanguage,
            fallbackLng: 'en', // Always fallback to English
            interpolation: {
                escapeValue: false, // React already escapes values
            },
            react: {
                useSuspense: false, // Disable suspense for React Native
            },
        });
};

// Initialize on module load
initI18n();

export default i18n;
