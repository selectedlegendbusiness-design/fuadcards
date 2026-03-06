/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { auth, db, rtdb, signInWithGoogle, signInWithOneTap, logout, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, handleFirestoreError, OperationType, ref, set as rtdbSet } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Player, Card } from './types';
import { useTranslation } from 'react-i18next';
import './i18n';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  User as UserIcon, 
  PlusCircle, 
  Home, 
  LogOut, 
  Globe, 
  Clock, 
  Zap, 
  Shield, 
  QrCode,
  ShoppingBag,
  RefreshCw,
  ChevronRight,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { formatDistanceToNow, isAfter, addHours, parseISO } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { uploadToR2 } from './services/storageService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Constants ---
const COOLDOWN_HOURS = 24;
const MAX_GENERATIONS = 2;
const ADMIN_EMAIL = 'fuadeditingzone@gmail.com';

// --- Mock Data for Generation ---
const POPULAR_ANIME_CHARACTERS = [
  'Goku', 'Naruto', 'Luffy', 'Zoro', 'Saitama', 'Tanjiro', 'Deku', 'Eren', 'Mikasa', 'Levi',
  'Ichigo Kurosaki', 'Edward Elric', 'Spike Spiegel', 'Light Yagami', 'Killua Zoldyck',
  'Gon Freecss', 'Roronoa Zoro', 'Kakashi Hatake', 'Itachi Uchiha', 'Satoru Gojo'
];

const CARD_ACCENT_COLORS = [
  'emerald', 'blue', 'purple', 'rose', 'amber', 'cyan', 'violet'
];

// --- Gemini Generation ---
const generateAnimeCardData = async (characterName: string): Promise<{ imageUrl: string, raw_power: number, strength: number, prompt_text: string }> => {
  try {
    const response = await fetch('/api/generate-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterName })
    });

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error("Non-JSON response received:", text);
      throw new Error(`Server returned non-JSON response (Status ${response.status}). Check server logs.`);
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to generate card.");
    }

    return data;
  } catch (error: any) {
    console.error("API Call Error:", error);
    throw error;
  }
};

// --- Components ---

const SEO = () => {
  const { i18n } = useTranslation();
  return (
    <Helmet>
      <title>FuadCards | Aesthetic Anime Card Game</title>
      <meta name="description" content="Collect, trade, and order aesthetic anime cards. Powered by Gemini AI." />
      <meta name="keywords" content="fuadcards, fuad editing zone, anime cards game, card game, gemini ai, anime art" />
      <html lang={i18n.language} />
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": "FuadCards",
          "url": window.location.origin,
          "description": "Generate, collect, and order aesthetic anime trading cards.",
          "hasPart": [
            {
              "@type": "WebPage",
              "name": "Generate Card",
              "url": `${window.location.origin}/generate`
            },
            {
              "@type": "WebPage",
              "name": "Leaderboard",
              "url": `${window.location.origin}/leaderboard`
            },
            {
              "@type": "WebPage",
              "name": "Profile",
              "url": `${window.location.origin}/profile`
            }
          ]
        })}
      </script>
    </Helmet>
  );
};

export default function App() {
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [view, setView] = useState<'home' | 'generate' | 'leaderboard' | 'profile' | 'setup' | 'admin' | 'verify'>('home');
  const [publicProfileId, setPublicProfileId] = useState<string | null>(null);
  const [verifyCardId, setVerifyCardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (user?.email === ADMIN_EMAIL) {
      const q = query(collection(db, 'cards'), where('status', '==', 'pending'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setPendingCount(snapshot.size);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'cards');
      });
      return unsubscribe;
    }
  }, [user]);

  useEffect(() => {
    // Google One-Tap & Button Initialization
    const handleOneTapResponse = async (response: any) => {
      try {
        await signInWithOneTap(response.credential);
      } catch (error: any) {
        console.error("One Tap Login Failed", error);
        if (error.code === 'auth/unauthorized-domain') {
          alert("Login Error: This domain is not authorized in Firebase. Please add 'fuadcards.pages.dev' to Authorized Domains in Firebase Console.");
        }
      }
    };

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const isPlaceholder = !clientId || clientId === 'YOUR_GOOGLE_CLIENT_ID';

    const initGoogle = () => {
      if (window.google && !user && !isPlaceholder) {
        console.log("Initializing Google One Tap with Client ID:", clientId);
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleOneTapResponse,
          auto_select: false,
          use_fedcm_for_prompt: true,
          itp_support: true,
        });

        const buttonDiv = document.getElementById("google-login-button");
        if (buttonDiv) {
          window.google.accounts.id.renderButton(buttonDiv, {
            theme: "outline",
            size: "large",
            shape: "pill",
            text: "signin_with",
            logo_alignment: "left",
          });
        }

        window.google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed()) {
            console.log("One Tap not displayed:", notification.getNotDisplayedReason());
          } else if (notification.isSkippedMoment()) {
            console.log("One Tap skipped:", notification.getSkippedReason());
          } else if (notification.isDismissedMoment()) {
            console.log("One Tap dismissed:", notification.getDismissedReason());
          }
        });
      }
    };

    if (window.google) {
      initGoogle();
    } else {
      // If script not loaded yet, wait for it
      const script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (script) {
        script.addEventListener('load', initGoogle);
      }
    }
  }, [user, view]);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/profile/')) {
      const id = path.split('/')[2];
      if (id) {
        setPublicProfileId(id);
        setView('profile');
      }
    } else if (path.startsWith('/verify/')) {
      const id = path.split('/')[2];
      if (id) {
        setVerifyCardId(id);
        setView('verify');
      }
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const playerDoc = await getDoc(doc(db, 'players', u.uid));
          if (playerDoc.exists()) {
            const pData = playerDoc.data() as Player;
            setPlayer(pData);
            setView(prev => prev === 'setup' ? 'home' : prev);
          } else {
            setView('setup');
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `players/${u.uid}`);
        }
      } else {
        setPlayer(null);
        setView(prev => prev !== 'leaderboard' ? 'home' : prev);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'bn' : 'en');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <HelmetProvider>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
        <SEO />
        
        {/* Header */}
        <header className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-md border-b border-white/5">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div 
              className="flex items-center gap-2 cursor-pointer group"
              onClick={() => setView('home')}
            >
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center group-hover:rotate-12 transition-transform">
                <Zap className="w-5 h-5 text-zinc-950 fill-current" />
              </div>
              <span className="text-xl font-bold tracking-tighter">FUAD<span className="text-emerald-500">CARDS</span></span>
            </div>

            <nav className="hidden md:flex items-center gap-6">
              <button onClick={() => setView('home')} className={cn("hover:text-emerald-400 transition-colors", view === 'home' && "text-emerald-500")}>{t('nav.home')}</button>
              <button onClick={() => setView('generate')} className={cn("hover:text-emerald-400 transition-colors", view === 'generate' && "text-emerald-500")}>{t('nav.generate')}</button>
              <button onClick={() => setView('leaderboard')} className={cn("hover:text-emerald-400 transition-colors", view === 'leaderboard' && "text-emerald-500")}>{t('nav.leaderboard')}</button>
              {user && <button onClick={() => setView('profile')} className={cn("hover:text-emerald-400 transition-colors", view === 'profile' && "text-emerald-500")}>{t('nav.profile')}</button>}
              <button onClick={() => setShowHelp(true)} className="hover:text-emerald-400 transition-colors flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                Help
              </button>
              {user?.email === ADMIN_EMAIL && (
                <button 
                  onClick={() => setView('admin')} 
                  className={cn("hover:text-red-400 transition-colors font-bold flex items-center gap-2", view === 'admin' && "text-red-500")}
                >
                  ADMIN
                  {pendingCount > 0 && (
                    <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full animate-pulse">
                      {pendingCount}
                    </span>
                  )}
                </button>
              )}
            </nav>

            <div className="flex items-center gap-4">
              <button 
                onClick={toggleLanguage}
                className="p-2 hover:bg-white/5 rounded-full transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <Globe className="w-4 h-4" />
                {i18n.language.toUpperCase()}
              </button>

              {user ? (
                <div className="flex items-center gap-3">
                  <div className="hidden sm:block text-right">
                    <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">{t('profile.total_power')}</p>
                    <p className="text-sm font-bold text-emerald-500">{player?.totalPower || 0}</p>
                  </div>
                  <button 
                    onClick={() => setView('profile')}
                    className="w-10 h-10 rounded-full border-2 border-emerald-500/20 overflow-hidden hover:border-emerald-500 transition-colors"
                  >
                    <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} alt="Profile" referrerPolicy="no-referrer" />
                  </button>
                  <button 
                    onClick={logout}
                    className="p-2 hover:bg-red-500/10 text-red-500 rounded-full transition-colors"
                    title={t('nav.logout')}
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <button 
                    onClick={async () => {
                      try {
                        console.log("Initiating Google Login via Firebase...");
                        await signInWithGoogle();
                      } catch (error: any) {
                        console.error("Login error:", error);
                        if (error.code === 'auth/unauthorized-domain') {
                          alert("Login Error: This domain is not authorized in Firebase. Please add your domain to Authorized Domains in Firebase Console.");
                        } else {
                          alert("Login failed: " + error.message);
                        }
                      }
                    }}
                    className="px-6 py-2 bg-emerald-500 text-zinc-950 rounded-full font-bold text-sm hover:bg-emerald-400 transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                    >
                    <UserIcon className="w-4 h-4" />
                    {t('nav.login')}
                  </button>
                  <div id="google-login-button" className="hidden"></div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 py-8">
          <AnimatePresence mode="wait">
            {user && !player ? (
              <SetupView key="setup" user={user} setPlayer={setPlayer} setView={setView} />
            ) : view === 'home' ? (
              <HomeView key="home" setView={setView} />
            ) : view === 'generate' ? (
              <GenerateView key="generate" user={user} player={player} setPlayer={setPlayer} />
            ) : view === 'leaderboard' ? (
              <LeaderboardView key="leaderboard" />
            ) : view === 'profile' ? (
              <ProfileView key="profile" user={user} player={player} publicProfileId={publicProfileId} />
            ) : view === 'setup' ? (
              <SetupView key="setup" user={user} setPlayer={setPlayer} setView={setView} />
            ) : view === 'admin' && user?.email === ADMIN_EMAIL ? (
              <AdminView key="admin" />
            ) : view === 'verify' ? (
              <VerifyView key="verify" cardId={verifyCardId} />
            ) : null}
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="border-t border-white/5 py-12 mt-20">
          <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2">
              <Zap className="w-6 h-6 text-emerald-500" />
              <span className="text-lg font-bold tracking-tighter">FUAD<span className="text-emerald-500">CARDS</span></span>
            </div>
            <p className="text-zinc-500 text-sm">© 2026 Fuad Editing Zone. All rights reserved.</p>
            <div className="flex gap-6 text-zinc-400 text-sm">
              <a href="#" className="hover:text-emerald-500 transition-colors">Privacy</a>
              <a href="#" className="hover:text-emerald-500 transition-colors">Terms</a>
              <a href="#" className="hover:text-emerald-500 transition-colors">Contact</a>
            </div>
          </div>
        </footer>
        {/* Help Modal */}
        <AnimatePresence>
          {showHelp && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowHelp(false)}
                className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-[2rem] p-8 shadow-2xl"
              >
                <div className="flex justify-between items-start mb-6">
                  <h2 className="text-3xl font-bold tracking-tighter">Setup & API Keys</h2>
                  <button onClick={() => setShowHelp(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                    <LogOut className="w-6 h-6 rotate-180" />
                  </button>
                </div>

                <div className="space-y-8">
                  <section>
                    <h3 className="text-lg font-bold text-emerald-500 mb-3 flex items-center gap-2">
                      <Zap className="w-5 h-5" />
                      How to get an API Key
                    </h3>
                    <ol className="list-decimal list-inside space-y-3 text-zinc-400">
                      <li>Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Google AI Studio</a>.</li>
                      <li>Create a new API key (ensure it's from a project with billing enabled for high-quality models).</li>
                      <li>In this app, click the "Select API Key" button in the banner or during generation.</li>
                      <li>For more info on billing, see <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Gemini Billing Docs</a>.</li>
                    </ol>
                  </section>

                  <section>
                    <h3 className="text-lg font-bold text-emerald-500 mb-3 flex items-center gap-2">
                      <Globe className="w-5 h-5" />
                      Google Cloud Projects
                    </h3>
                    <p className="text-zinc-400">
                      If your project isn't showing in the console, ensure you are logged into the correct Google account. 
                      You can manage your projects at the <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Google Cloud Console</a>.
                    </p>
                  </section>

                  <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                    <p className="text-xs text-zinc-500">
                      Note: Image generation uses the <code>gemini-3.1-flash-image-preview</code> model, which requires a paid API key for high-quality output.
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </HelmetProvider>
  );
}

// --- View Components ---

function VerifyView({ cardId }: { cardId: string | null, key?: string }) {
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cardId) return;
    const fetchCard = async () => {
      try {
        const docRef = doc(db, 'cards', cardId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setCard(docSnap.data() as Card);
        }
        setLoading(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `cards/${cardId}`);
      }
    };
    fetchCard();
  }, [cardId]);

  if (loading) return <div className="flex justify-center py-20"><RefreshCw className="w-8 h-8 animate-spin text-emerald-500" /></div>;
  if (!card) return <div className="text-center py-20 text-zinc-500">Card not found</div>;

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div className="text-center">
        <h2 className="text-4xl font-bold tracking-tighter mb-2">Card Verification</h2>
        <p className="text-zinc-500">Official FuadCards Authentication</p>
      </div>

      {card.is_approved ? (
        <div className="space-y-8">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center gap-3 text-emerald-500">
            <CheckCircle2 className="w-5 h-5" />
            <p className="font-bold">This card is verified and approved by Admin.</p>
          </div>
          <CardUI card={card} />
        </div>
      ) : (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
          <h3 className="text-xl font-bold text-amber-500">Verification Pending</h3>
          <p className="text-zinc-400">
            This card has been generated but is currently awaiting admin approval. 
            Stats and details are hidden until verified.
          </p>
        </div>
      )}
    </div>
  );
}

function HomeView({ setView }: { setView: (v: any) => void, key?: string }) {
  const { t } = useTranslation();
  return (
    <motion.div 
      key="home-motion"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center text-center py-20"
    >
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold uppercase tracking-widest mb-6">
        <Trophy className="w-3 h-3" />
        Season 1 Active
      </div>
      <h1 className="text-6xl md:text-8xl font-bold tracking-tighter mb-6 max-w-4xl leading-[0.9]">
        {t('hero.title')}
      </h1>
      <p className="text-zinc-400 text-lg md:text-xl max-w-2xl mb-10">
        {t('hero.subtitle')}
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        <button 
          onClick={() => setView('generate')}
          className="px-8 py-4 bg-emerald-500 text-zinc-950 rounded-full font-bold text-lg hover:bg-emerald-400 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-emerald-500/20"
        >
          {t('hero.cta')}
        </button>
        <button 
          onClick={() => setView('leaderboard')}
          className="px-8 py-4 bg-white/5 text-white rounded-full font-bold text-lg hover:bg-white/10 transition-all border border-white/10"
        >
          {t('nav.leaderboard')}
        </button>
      </div>

      {/* Feature Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-32 w-full">
        <div className="p-8 rounded-3xl bg-white/5 border border-white/10 text-left">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6">
            <PlusCircle className="w-6 h-6 text-emerald-500" />
          </div>
          <h3 className="text-xl font-bold mb-2">Daily Generation</h3>
          <p className="text-zinc-400 text-sm">Generate 2 high-quality anime cards every 24 hours for free.</p>
        </div>
        <div className="p-8 rounded-3xl bg-white/5 border border-white/10 text-left">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6">
            <Trophy className="w-6 h-6 text-emerald-500" />
          </div>
          <h3 className="text-xl font-bold mb-2">Global Leaderboard</h3>
          <p className="text-zinc-400 text-sm">Compete with players worldwide based on your collection's power.</p>
        </div>
        <div className="p-8 rounded-3xl bg-white/5 border border-white/10 text-left">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6">
            <ShoppingBag className="w-6 h-6 text-emerald-500" />
          </div>
          <h3 className="text-xl font-bold mb-2">Physical Orders</h3>
          <p className="text-zinc-400 text-sm">Order physical copies of your favorite cards delivered to you.</p>
        </div>
      </div>
    </motion.div>
  );
}

function GenerateView({ user, player, setPlayer }: { user: User | null, player: Player | null, setPlayer: (p: Player) => void, key?: string }) {
  const { t } = useTranslation();
  const [cooldown, setCooldown] = useState<string | null>(null);
  const [canGenerate, setCanGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newCard, setNewCard] = useState<Card | null>(null);
  const [customName, setCustomName] = useState('');

  useEffect(() => {
    if (!player) return;

    const checkCooldown = () => {
      const now = new Date();
      const lastGens = player.lastGenerations || [];
      
      // Filter generations older than 24h
      const recentGens = lastGens.filter(ts => {
        const genTime = parseISO(ts);
        return isAfter(addHours(genTime, COOLDOWN_HOURS), now);
      });

      if (recentGens.length < MAX_GENERATIONS) {
        setCanGenerate(true);
        setCooldown(null);
      } else {
        setCanGenerate(false);
        const oldestRecent = parseISO(recentGens[0]);
        const nextAvailable = addHours(oldestRecent, COOLDOWN_HOURS);
        setCooldown(formatDistanceToNow(nextAvailable));
      }
    };

    checkCooldown();
    const interval = setInterval(checkCooldown, 10000);
    return () => clearInterval(interval);
  }, [player]);

  const handleGenerate = async (isRandom = false) => {
    if (!user || !player || (!canGenerate)) return;

    // Check if API key is selected
    setGenerating(true);
    try {
      const nameToGenerate = isRandom 
        ? POPULAR_ANIME_CHARACTERS[Math.floor(Math.random() * POPULAR_ANIME_CHARACTERS.length)]
        : customName;

      if (!nameToGenerate) {
        alert("Please enter a character name or use random generate.");
        setGenerating(false);
        return;
      }

      const { imageUrl: base64ImageUrl, raw_power, strength, prompt_text } = await generateAnimeCardData(nameToGenerate);
      const accentColor = CARD_ACCENT_COLORS[Math.floor(Math.random() * CARD_ACCENT_COLORS.length)];
      const cardId = Math.random().toString(36).substring(2, 15);

      // Upload to R2 if configured
      const fileName = `cards/${user.uid}/${cardId}.png`;
      const finalImageUrl = await uploadToR2(base64ImageUrl, fileName);

      const card: Card = {
        cardId,
        player_id: user.uid,
        ownerName: player.name,
        characterName: nameToGenerate,
        imageUrl: finalImageUrl,
        raw_power,
        strength,
        status: 'pending',
        is_approved: false,
        createdAt: new Date().toISOString(),
        accentColor,
        prompt_text,
        qr_data: `${window.location.origin}/verify/${cardId}`
      };

      // Save Card to Firestore
      try {
        await setDoc(doc(db, 'cards', cardId), card);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `cards/${cardId}`);
      }

      // Save Card to Realtime Database (as requested by user)
      try {
        await rtdbSet(ref(rtdb, `cards/${cardId}`), card);
        console.log("Card saved to Realtime Database successfully");
      } catch (error) {
        console.error("Error saving to Realtime Database:", error);
      }

      // Update Player Cooldown ONLY (Power added after admin approval)
      const newLastGens = [...(player.lastGenerations || []), new Date().toISOString()].slice(-MAX_GENERATIONS);
      
      const updatedPlayer = {
        ...player,
        lastGenerations: newLastGens
      };

      try {
        await updateDoc(doc(db, 'players', user.uid), {
          lastGenerations: newLastGens
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `players/${user.uid}`);
      }

      setPlayer(updatedPlayer);
      setNewCard(card);
      setCustomName('');
    } catch (error: any) {
      console.error("Generation failed", error);
      
      // Handle server-side error codes
      if (error.message.includes("INVALID_API_KEY") || error.message.includes("API key not valid")) {
        alert("Your Gemini API key is invalid or has expired. Please select a valid API key from a project with billing enabled for high-quality image generation.");
        if (window.aistudio) {
          try {
            await window.aistudio.openSelectKey();
          } catch (e) {
            console.error("Failed to open key selector", e);
          }
        }
      } else if (error.message.includes("not configured")) {
        alert("Gemini API Key is not configured. Please select your API key using the 'Select API Key' button.");
        if (window.aistudio) await window.aistudio.openSelectKey();
      } else {
        alert("Generation failed: " + error.message);
      }
    } finally {
      setGenerating(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Shield className="w-16 h-16 text-zinc-700 mb-6" />
        <h2 className="text-3xl font-bold mb-4">{t('nav.login')}</h2>
        <p className="text-zinc-400 mb-8">Please log in to generate cards.</p>
        <button 
          onClick={async () => {
            try {
              await signInWithGoogle();
            } catch (error: any) {
              alert("Login failed: " + error.message);
            }
          }} 
          className="px-8 py-3 bg-emerald-500 text-zinc-950 rounded-full font-bold flex items-center gap-2 hover:bg-emerald-400 transition-all"
        >
          <UserIcon className="w-5 h-5" />
          {t('nav.login')}
        </button>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto"
    >
      <div className="flex flex-col md:flex-row gap-12 items-start">
        <div className="flex-1 w-full">
          <h2 className="text-4xl font-bold mb-2">{t('generate.title')}</h2>
          <p className="text-zinc-400 mb-8">You can generate up to 2 cards every 24 hours. Use them wisely!</p>

          {!canGenerate && (
            <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-8">
              <div className="flex items-center gap-3 text-amber-500 mb-2">
                <Clock className="w-5 h-5" />
                <span className="font-bold uppercase tracking-wider text-xs">{t('generate.cooldown')}</span>
              </div>
              <p className="text-2xl font-bold text-amber-200">{cooldown}</p>
            </div>
          )}

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">{t('generate.custom_name_placeholder')}</label>
              <input 
                type="text" 
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Super Saiyan Fuad"
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button 
                onClick={() => handleGenerate(false)}
                disabled={!canGenerate || generating}
                className={cn(
                  "py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all",
                  canGenerate && !generating ? "bg-emerald-500 text-zinc-950 hover:scale-[1.02]" : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                )}
              >
                {generating ? (
                  <RefreshCw className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    <PlusCircle className="w-6 h-6" />
                    {t('generate.generate_btn')}
                  </>
                )}
              </button>

              <button 
                onClick={() => handleGenerate(true)}
                disabled={!canGenerate || generating}
                className={cn(
                  "py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all",
                  canGenerate && !generating ? "bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:scale-[1.02]" : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                )}
              >
                {generating ? (
                  <RefreshCw className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="w-6 h-6" />
                    Random Generate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 w-full sticky top-24">
          <AnimatePresence mode="wait">
            {generating ? (
              <motion.div
                key="generating"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="aspect-[2/3] w-full rounded-[2.5rem] bg-zinc-900 border-2 border-emerald-500/20 flex flex-col items-center justify-center p-8 text-center"
              >
                <div className="relative w-20 h-20 mb-6">
                  <div className="absolute inset-0 border-4 border-emerald-500/10 rounded-full" />
                  <div className="absolute inset-0 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <Zap className="absolute inset-0 m-auto w-6 h-6 text-emerald-500 animate-pulse" />
                </div>
                <h3 className="text-xl font-bold mb-2 tracking-tight">Crafting Card...</h3>
                <p className="text-zinc-500 text-sm">Generating aesthetic art and stats.</p>
              </motion.div>
            ) : newCard ? (
              <motion.div
                key="card"
                initial={{ scale: 0.8, opacity: 0, rotateY: 90 }}
                animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                transition={{ type: 'spring', damping: 15 }}
              >
                <CardUI card={newCard} />
                <button 
                  onClick={() => setNewCard(null)}
                  className="mt-6 w-full py-3 bg-white/5 border border-white/10 rounded-xl font-bold hover:bg-white/10 transition-colors"
                >
                  Generate Another
                </button>
              </motion.div>
            ) : (
              <div className="aspect-[2/3] w-full rounded-[2rem] border-2 border-dashed border-white/10 flex flex-col items-center justify-center text-zinc-600">
                <PlusCircle className="w-12 h-12 mb-4 opacity-20" />
                <p className="font-medium opacity-40">Your new card will appear here</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

function AdminView() {
  const [pendingCards, setPendingCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'cards'), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cards = snapshot.docs.map(doc => ({ ...doc.data(), cardId: doc.id } as Card));
      // Sort client-side to avoid index requirements
      const sortedCards = cards.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPendingCards(sortedCards);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cards');
    });
    return unsubscribe;
  }, []);

  const handleApprove = async (card: Card) => {
    try {
      // 1. Update Card Status
      await updateDoc(doc(db, 'cards', card.cardId), { 
        status: 'approved',
        is_approved: true 
      });

      // 2. Update Player Total Power
      const playerRef = doc(db, 'players', card.player_id);
      const playerSnap = await getDoc(playerRef);
      if (playerSnap.exists()) {
        const currentPower = playerSnap.data().totalPower || 0;
        await updateDoc(playerRef, { totalPower: currentPower + card.raw_power });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cards/${card.cardId}`);
    }
  };

  const handleReject = async (cardId: string) => {
    if (confirm("Are you sure you want to reject and delete this card?")) {
      try {
        await updateDoc(doc(db, 'cards', cardId), { status: 'ordered' }); 
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `cards/${cardId}`);
      }
    }
  };

  const handleWipeAllPowers = async () => {
    if (!confirm("CRITICAL: This will reset EVERY player's totalPower to 0. This is irreversible. Continue?")) return;
    try {
      const playersSnap = await getDocs(collection(db, 'players'));
      const batch = playersSnap.docs.map(playerDoc => updateDoc(doc(db, 'players', playerDoc.id), { totalPower: 0 }));
      await Promise.all(batch);
      alert("All player powers have been reset to 0.");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'players');
    }
  };

  if (loading) return <div className="flex justify-center py-20"><RefreshCw className="w-8 h-8 animate-spin text-red-500" /></div>;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-black tracking-tighter uppercase italic">Admin Dashboard</h2>
          <p className="text-zinc-500">Review and approve pending card generations.</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={handleWipeAllPowers}
            className="bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-xl hover:bg-red-500/20 transition-colors"
          >
            <span className="text-xs font-bold text-red-500 uppercase tracking-widest">Wipe All Powers</span>
          </button>
          <div className="bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-xl">
            <span className="text-xs font-bold text-red-500 uppercase tracking-widest">Pending Requests</span>
            <p className="text-2xl font-black text-red-400 leading-none">{pendingCards.length}</p>
          </div>
        </div>
      </div>

      {pendingCards.length === 0 ? (
        <div className="py-20 text-center bg-white/5 rounded-[3rem] border border-dashed border-white/10">
          <Shield className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-500 font-medium">No pending requests at the moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pendingCards.map(card => (
            <div key={card.cardId} className="bg-white/5 border border-white/10 rounded-[2.5rem] p-6 flex gap-6 items-center">
              <div className="w-24 h-36 rounded-xl overflow-hidden flex-shrink-0">
                <img src={card.imageUrl} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold truncate">{card.characterName}</h3>
                <p className="text-xs text-zinc-500 mb-2">Owner: <span className="text-zinc-300">{card.ownerName}</span></p>
                
                {card.prompt_text && (
                  <div className="mb-4 p-3 bg-zinc-950 rounded-xl border border-white/5">
                    <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-1">AI Prompt</p>
                    <p className="text-[10px] text-zinc-400 line-clamp-2 italic leading-relaxed">"{card.prompt_text}"</p>
                  </div>
                )}

                <div className="flex gap-4 mb-4">
                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Power</p>
                    <p className="text-lg font-black text-emerald-500 leading-none">{card.raw_power}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Strength</p>
                    <p className="text-lg font-black text-blue-500 leading-none">{card.strength}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleApprove(card)}
                    className="flex-1 bg-emerald-500 text-zinc-950 py-2 rounded-xl font-bold text-sm hover:bg-emerald-400 transition-colors"
                  >
                    Approve
                  </button>
                  <button 
                    onClick={() => handleReject(card.cardId)}
                    className="px-4 bg-white/5 border border-white/10 text-zinc-400 py-2 rounded-xl font-bold text-sm hover:bg-red-500/10 hover:text-red-500 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CardUI({ card }: { card: Card & { accentColor?: string } }) {
  const [showPrompt, setShowPrompt] = useState(false);
  const qrValue = card.qr_data || `${window.location.origin}/verify/${card.cardId}`;
  const accent = card.accentColor || 'emerald';
  
  const accentClasses: Record<string, string> = {
    emerald: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10',
    blue: 'text-blue-400 border-blue-500/20 bg-blue-500/10',
    purple: 'text-purple-400 border-purple-500/20 bg-purple-500/10',
    rose: 'text-rose-400 border-rose-500/20 bg-rose-500/10',
    amber: 'text-amber-400 border-amber-500/20 bg-amber-500/10',
    cyan: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/10',
    violet: 'text-violet-400 border-violet-500/20 bg-violet-500/10',
  };

  const accentText = accentClasses[accent].split(' ')[0];
  const accentBorder = accentClasses[accent].split(' ')[1];
  const accentBg = accentClasses[accent].split(' ')[2];

  return (
    <div className="relative aspect-[2/3] w-full max-w-[400px] mx-auto group perspective-1000">
      {/* Aesthetic Frame / Card Body */}
      <div className={cn(
        "absolute inset-0 rounded-[2.5rem] overflow-hidden bg-zinc-900 border-[12px] shadow-2xl transition-transform duration-500 group-hover:scale-[1.02]",
        accentBorder
      )}>
        
        {/* Character Image with High Brightness Filter */}
        <div className="absolute inset-0">
          <img 
            src={card.imageUrl} 
            alt={card.characterName} 
            className="w-full h-full object-cover brightness-110 contrast-110"
            referrerPolicy="no-referrer"
          />
          {/* Aesthetic Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-white/10" />
          <div className={cn("absolute inset-0 mix-blend-overlay opacity-20", accentBg)} />
        </div>

        {/* Card Content */}
        <div className="absolute inset-0 p-8 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className={cn("backdrop-blur-md border border-white/20 rounded-xl px-3 py-1", accentBg)}>
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">Power Level</span>
              <p className={cn("text-xl font-black leading-none", accentText)}>{card.raw_power}</p>
            </div>
            
            {/* QR Code in Corner */}
            <div className="bg-white p-1.5 rounded-lg shadow-lg">
              <QRCodeSVG value={qrValue} size={48} level="H" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="text-3xl font-black italic tracking-tighter text-white drop-shadow-lg uppercase truncate flex-1">
                  {card.characterName}
                </h3>
                {card.prompt_text && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowPrompt(!showPrompt);
                    }}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    title="View AI Prompt"
                  >
                    <Globe className="w-4 h-4 text-white/50" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className={cn("h-1 w-12 rounded-full", accentBg.replace('bg-', 'bg-').replace('/10', ''))} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Legendary Edition</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3 flex flex-col items-center">
                <Zap className={cn("w-4 h-4 mb-1", accentText)} />
                <span className="text-[8px] font-bold uppercase tracking-widest text-white/50">Strength</span>
                <p className="text-lg font-bold text-white leading-none">{card.strength}</p>
              </div>
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3 flex flex-col items-center">
                <Trophy className={cn("w-4 h-4 mb-1", accentText)} />
                <span className="text-[8px] font-bold uppercase tracking-widest text-white/50">Rank</span>
                <p className="text-lg font-bold text-white leading-none">#{Math.floor(card.raw_power / 10)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* AI Prompt Overlay */}
        <AnimatePresence>
          {showPrompt && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute inset-0 z-20 bg-zinc-950/90 backdrop-blur-xl p-8 flex flex-col justify-center text-center"
              onClick={() => setShowPrompt(false)}
            >
              <Globe className={cn("w-12 h-12 mx-auto mb-6", accentText)} />
              <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">AI Generation Prompt</h4>
              <p className="text-sm text-zinc-300 italic leading-relaxed">
                "{card.prompt_text}"
              </p>
              <button className="mt-8 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors">
                Click to Close
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Shine Effect */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        </div>
      </div>
    </div>
  );
}

function LeaderboardView({ key }: { key?: string }) {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'players'), orderBy('totalPower', 'desc'), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pData = snapshot.docs.map(doc => doc.data() as Player);
      setPlayers(pData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'players');
    });
    return unsubscribe;
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-3xl mx-auto"
    >
      <div className="text-center mb-12">
        <h2 className="text-5xl font-bold tracking-tighter mb-4">{t('leaderboard.title')}</h2>
        <p className="text-zinc-400">The most powerful collectors in the FuadCards universe.</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/5 text-zinc-500 text-xs font-bold uppercase tracking-widest">
              <th className="px-8 py-6">{t('leaderboard.rank')}</th>
              <th className="px-8 py-6">{t('leaderboard.player')}</th>
              <th className="px-8 py-6 text-right">{t('leaderboard.power')}</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={p.uid} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                <td className="px-8 py-6">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center font-bold",
                    i === 0 ? "bg-emerald-500 text-zinc-950" : "bg-white/5 text-zinc-400"
                  )}>
                    {i + 1}
                  </div>
                </td>
                <td className="px-8 py-6">
                  <div className="flex items-center gap-4">
                    <img 
                      src={p.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.uid}`} 
                      className="w-10 h-10 rounded-full border border-white/10" 
                      alt={p.name}
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <p className="font-bold group-hover:text-emerald-400 transition-colors">{p.name}</p>
                      <p className="text-xs text-zinc-500">{p.favAnime || 'Anime Fan'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-8 py-6 text-right">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 font-bold">
                    <Zap className="w-3 h-3" />
                    {p.totalPower || 0}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
function ProfileView({ user, player: loggedInPlayer, publicProfileId, key }: { user: User | null, player: Player | null, publicProfileId?: string | null, key?: string }) {
  const { t } = useTranslation();
  const [cards, setCards] = useState<Card[]>([]);
  const [profilePlayer, setProfilePlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editFavAnime, setEditFavAnime] = useState('');
  const [saving, setSaving] = useState(false);

  const targetUid = publicProfileId || user?.uid;

  useEffect(() => {
    if (!targetUid) return;

    const fetchProfile = async () => {
      try {
        const docRef = doc(db, 'players', targetUid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as Player;
          setProfilePlayer(data);
          setEditName(data.name);
          setEditAge(data.age?.toString() || '');
          setEditFavAnime(data.favAnime || '');
        }
        setLoading(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `players/${targetUid}`);
      }
    };

    fetchProfile();

    const q = query(collection(db, 'cards'), where('player_id', '==', targetUid));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const fetchedCards = snapshot.docs.map(doc => doc.data() as Card);
      // Sort client-side
      const sortedCards = fetchedCards.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setCards(sortedCards);

      // Reconciliation: If no cards exist for this player, ensure totalPower is 0
      if (fetchedCards.length === 0 && targetUid === user?.uid) {
        try {
          const playerRef = doc(db, 'players', targetUid);
          const playerSnap = await getDoc(playerRef);
          if (playerSnap.exists() && playerSnap.data().totalPower !== 0) {
            await updateDoc(playerRef, { totalPower: 0 });
            setProfilePlayer(prev => prev ? { ...prev, totalPower: 0 } : null);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `players/${targetUid}`);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cards');
    });
    return unsubscribe;
  }, [targetUid]);

  const handleOrder = async (card: Card) => {
    if (!user || user.uid !== card.player_id) return;
    try {
      await updateDoc(doc(db, 'cards', card.cardId), { status: 'ordered' });
      window.open(`mailto:${ADMIN_EMAIL}?subject=Card Order Request&body=I would like to order card: ${card.cardId} (${card.characterName})`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cards/${card.cardId}`);
    }
  };


  const handleDeleteCard = async (card: Card) => {
    if (!user || user.uid !== card.player_id) return;
    if (!confirm(`Are you sure you want to delete ${card.characterName}? If approved, its power will be removed from your total.`)) return;

    try {
      // 1. Delete Card
      await deleteDoc(doc(db, 'cards', card.cardId));

      // 2. If approved, subtract power
      if (card.is_approved && profilePlayer) {
        const newPower = Math.max(0, (profilePlayer.totalPower || 0) - card.raw_power);
        await updateDoc(doc(db, 'players', user.uid), { totalPower: newPower });
        setProfilePlayer({ ...profilePlayer, totalPower: newPower });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `cards/${card.cardId}`);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><RefreshCw className="w-8 h-8 animate-spin text-emerald-500" /></div>;
  if (!profilePlayer) return <div className="text-center py-20 text-zinc-500">Player not found</div>;

  const isOwnProfile = user?.uid === profilePlayer.uid;

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profilePlayer) return;
    setSaving(true);
    try {
      const updatedData = {
        name: editName,
        age: parseInt(editAge),
        favAnime: editFavAnime
      };
      await updateDoc(doc(db, 'players', user.uid), updatedData);
      setProfilePlayer({ ...profilePlayer, ...updatedData });
      setIsEditing(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `players/${user.uid}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-12"
    >
      {/* Profile Header */}
      <div className="relative p-12 rounded-[3rem] bg-white/5 border border-white/10 overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <QrCode className="w-40 h-40" />
        </div>
        
        <div className="flex flex-col md:flex-row gap-10 items-center md:items-start relative z-10">
          <div className="w-40 h-40 rounded-[2.5rem] border-4 border-emerald-500/20 p-1 bg-zinc-950">
            <img 
              src={profilePlayer.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profilePlayer.uid}`} 
              className="w-full h-full rounded-[2rem] object-cover" 
              alt={profilePlayer.name}
              referrerPolicy="no-referrer"
            />
          </div>
          
          <div className="flex-1 text-center md:text-left">
            {isEditing ? (
              <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-md">
                <input 
                  type="text" 
                  value={editName} 
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2 focus:border-emerald-500 outline-none"
                  placeholder="Name"
                />
                <div className="flex gap-4">
                  <input 
                    type="number" 
                    value={editAge} 
                    onChange={(e) => setEditAge(e.target.value)}
                    className="w-1/3 bg-zinc-950 border border-white/10 rounded-xl px-4 py-2 focus:border-emerald-500 outline-none"
                    placeholder="Age"
                  />
                  <input 
                    type="text" 
                    value={editFavAnime} 
                    onChange={(e) => setEditFavAnime(e.target.value)}
                    className="flex-1 bg-zinc-950 border border-white/10 rounded-xl px-4 py-2 focus:border-emerald-500 outline-none"
                    placeholder="Favorite Anime"
                  />
                </div>
                <div className="flex gap-2">
                  <button 
                    type="submit" 
                    disabled={saving}
                    className="px-6 py-2 bg-emerald-500 text-zinc-950 rounded-xl font-bold hover:bg-emerald-400 transition-colors disabled:opacity-50"
                  >
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Save"}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setIsEditing(false)}
                    className="px-6 py-2 bg-white/5 border border-white/10 rounded-xl font-bold hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <h2 className="text-5xl font-black tracking-tighter mb-2 uppercase italic">{profilePlayer.name}</h2>
                <div className="flex flex-wrap justify-center md:justify-start gap-4 mb-8">
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 text-zinc-400 text-sm">
                    <UserIcon className="w-4 h-4" />
                    {profilePlayer.age} {t('setup.age')}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 text-zinc-400 text-sm">
                    <Home className="w-4 h-4" />
                    {profilePlayer.favAnime}
                  </div>
                  {isOwnProfile && (
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-sm hover:bg-emerald-500/20 transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Edit Profile
                    </button>
                  )}
                </div>
              </>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-lg mt-4">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/60 mb-1">{t('profile.total_power')}</p>
                <p className="text-2xl font-black text-emerald-500">{profilePlayer.totalPower || 0}</p>
              </div>
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">{t('profile.cards_owned')}</p>
                <p className="text-2xl font-black text-white">{cards.length}</p>
              </div>
              {isOwnProfile && (
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={logout}
                    className="flex-1 p-3 rounded-2xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors group flex items-center justify-between"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest text-red-500/60">{t('nav.logout')}</span>
                    <LogOut className="w-4 h-4 text-red-500 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Collection */}
      <div>
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-3xl font-bold tracking-tighter">{isOwnProfile ? t('profile.collection') : `${profilePlayer.name}'s Collection`}</h3>
          <div className="h-px flex-1 mx-8 bg-white/5" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {cards.map(card => (
            <div key={card.cardId} className="space-y-4">
              <CardUI card={card} />
              {isOwnProfile && (
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleOrder(card)}
                    disabled={card.status === 'ordered'}
                    className={cn(
                      "flex-1 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all",
                      card.status === 'ordered' 
                        ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" 
                        : "bg-white/5 border border-white/10 hover:bg-emerald-500 hover:text-zinc-950 hover:border-emerald-500"
                    )}
                  >
                    {card.status === 'ordered' ? (
                      <>
                        <ShoppingBag className="w-5 h-5" />
                        {t('profile.ordered')}
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="w-5 h-5" />
                        {t('profile.order_btn')}
                      </>
                    )}
                  </button>
                  <button 
                    onClick={() => handleDeleteCard(card)}
                    className="p-4 rounded-2xl bg-white/5 border border-white/10 text-zinc-500 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 transition-all"
                    title="Delete Card"
                  >
                    <LogOut className="w-5 h-5 rotate-180" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}


function SetupView({ user, setPlayer, setView }: { user: User | null, setPlayer: (p: Player) => void, setView: (v: any) => void, key?: string }) {
  const { t } = useTranslation();
  const [name, setName] = useState(user?.displayName || '');
  const [age, setAge] = useState('');
  const [favAnime, setFavAnime] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name || !age || !favAnime) return;

    setSaving(true);
    try {
      const playerData: Player = {
        uid: user.uid,
        name,
        age: parseInt(age),
        favAnime,
        totalPower: 0,
        lastGenerations: [],
        photoURL: user.photoURL || undefined,
        role: user.email === ADMIN_EMAIL ? 'admin' : 'user'
      };

      await setDoc(doc(db, 'players', user.uid), playerData);
      setPlayer(playerData);
      setView('home');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `players/${user.uid}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-md mx-auto py-20"
    >
      <div className="p-10 rounded-[3rem] bg-white/5 border border-white/10">
        <h2 className="text-3xl font-bold mb-8 text-center">{t('setup.title')}</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('setup.name')}</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-zinc-950 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('setup.age')}</label>
            <input 
              type="number" 
              value={age}
              onChange={(e) => setAge(e.target.value)}
              required
              className="w-full bg-zinc-950 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('setup.fav_anime')}</label>
            <input 
              type="text" 
              value={favAnime}
              onChange={(e) => setFavAnime(e.target.value)}
              required
              className="w-full bg-zinc-950 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
          <button 
            type="submit" 
            disabled={saving}
            className="w-full py-5 bg-emerald-500 text-zinc-950 rounded-2xl font-bold text-lg hover:bg-emerald-400 transition-all disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-6 h-6 animate-spin mx-auto" /> : t('setup.submit')}
          </button>
        </form>
      </div>
    </motion.div>
  );
}
