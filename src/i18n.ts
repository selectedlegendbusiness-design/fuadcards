import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      "nav": {
        "home": "Home",
        "generate": "Generate Card",
        "leaderboard": "Leaderboard",
        "profile": "Profile",
        "login": "Log In",
        "signup": "Sign Up",
        "logout": "Log Out"
      },
      "hero": {
        "title": "Welcome to FuadCards",
        "subtitle": "Collect, Trade, and Order your favorite anime characters as aesthetic cards.",
        "cta": "Start Generating"
      },
      "generate": {
        "title": "Generate Your Card",
        "cooldown": "Next generation available in:",
        "limit_reached": "You have reached your daily limit (2 cards / 24h)",
        "generate_btn": "Generate Card",
        "reroll": "Re-generate with Custom Name",
        "custom_name_placeholder": "Enter character name...",
        "success": "Card generated successfully!"
      },
      "profile": {
        "title": "Player Profile",
        "stats": "Stats",
        "total_power": "Total Power",
        "cards_owned": "Cards Owned",
        "fav_anime": "Favorite Anime",
        "age": "Age",
        "collection": "My Collection",
        "order_btn": "Request Order",
        "ordered": "Ordered"
      },
      "leaderboard": {
        "title": "Top Players",
        "rank": "Rank",
        "player": "Player",
        "power": "Power"
      },
      "setup": {
        "title": "Complete Your Profile",
        "name": "Name",
        "age": "Age",
        "fav_anime": "Favorite Anime",
        "submit": "Save Profile"
      }
    }
  },
  bn: {
    translation: {
      "nav": {
        "home": "হোম",
        "generate": "কার্ড তৈরি করুন",
        "leaderboard": "লিডারবোর্ড",
        "profile": "প্রোফাইল",
        "login": "লগ ইন",
        "signup": "সাইন আপ",
        "logout": "লগ আউট"
      },
      "hero": {
        "title": "FuadCards-এ স্বাগতম",
        "subtitle": "আপনার প্রিয় অ্যানিমে চরিত্রগুলোকে নান্দনিক কার্ড হিসেবে সংগ্রহ করুন, ট্রেড করুন এবং অর্ডার করুন।",
        "cta": "তৈরি করা শুরু করুন"
      },
      "generate": {
        "title": "আপনার কার্ড তৈরি করুন",
        "cooldown": "পরবর্তী জেনারেশন পাওয়া যাবে:",
        "limit_reached": "আপনি আপনার দৈনিক সীমা অতিক্রম করেছেন (২৪ ঘণ্টায় ২ টি কার্ড)",
        "generate_btn": "কার্ড তৈরি করুন",
        "reroll": "কাস্টম নাম দিয়ে পুনরায় তৈরি করুন",
        "custom_name_placeholder": "চরিত্রের নাম লিখুন...",
        "success": "কার্ড সফলভাবে তৈরি হয়েছে!"
      },
      "profile": {
        "title": "প্লেয়ার প্রোফাইল",
        "stats": "পরিসংখ্যান",
        "total_power": "মোট পাওয়ার",
        "cards_owned": "সংগৃহীত কার্ড",
        "fav_anime": "প্রিয় অ্যানিমে",
        "age": "বয়স",
        "collection": "আমার সংগ্রহ",
        "order_btn": "অর্ডার রিকোয়েস্ট",
        "ordered": "অর্ডার করা হয়েছে"
      },
      "leaderboard": {
        "title": "সেরা খেলোয়াড়",
        "rank": "র‍্যাঙ্ক",
        "player": "খেলোয়াড়",
        "power": "পাওয়ার"
      },
      "setup": {
        "title": "আপনার প্রোফাইল সম্পূর্ণ করুন",
        "name": "নাম",
        "age": "বয়স",
        "fav_anime": "প্রিয় অ্যানিমে",
        "submit": "প্রোফাইল সংরক্ষণ করুন"
      }
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: 'bn', // Set default language to Bangla
    fallbackLng: 'bn',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
