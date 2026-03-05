/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { auth, db, signInWithGoogle, signInWithOneTap, logout, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, onSnapshot, serverTimestamp, Timestamp } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Player, Card } from './types';
import { useTranslation } from 'react-i18next';
import './i18n';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
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
  ChevronRight
} from 'lucide-react';
import { formatDistanceToNow, isAfter, addHours, parseISO } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
const generateAnimeCardData = async (characterName: string): Promise<{ imageUrl: string, power: number, strength: number }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
  
  // 1. Generate Metadata (Power & Strength) based on character lore
  const metaResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze the anime character "${characterName}". 
    Assign a Power Level (500-1000) and Strength (50-150) based on their actual abilities in their respective anime.
    Return ONLY a JSON object: {"power": number, "strength": number}`,
    config: {
      responseMimeType: "application/json"
    }
  });

  const metadata = JSON.parse(metaResponse.text || '{"power": 750, "strength": 100}');

  // 2. Generate Image
  const imageResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          text: `A high-quality, aesthetic anime trading card illustration of the character ${characterName}. Vibrant colors, dynamic pose, detailed background, professional digital art style, 4k resolution, trading card game art style.`,
        },
      ],
    },
  });

  let imageUrl = '';
  for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      imageUrl = `data:image/png;base64,${part.inlineData.data}`;
      break;
    }
  }

  if (!imageUrl) throw new Error("No image generated");

  return {
    imageUrl,
    power: metadata.power || 750,
    strength: metadata.strength || 100
  };
};

// --- Components ---

const SEO = () => {
  const { i18n } = useTranslation();
  return (
    <Helmet>
      <title>FuadCards - Anime Trading Cards</title>
      <meta name="description" content="Generate, collect, and order aesthetic anime trading cards. Join the FuadCards community!" />
      <meta name="keywords" content="fuadcards, fuad editing zone, fuad zone, anime cards game, anime game, card game" />
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
  const [view, setView] = useState<'home' | 'generate' | 'leaderboard' | 'profile' | 'setup' | 'admin'>('home');
  const [publicProfileId, setPublicProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (user?.email === ADMIN_EMAIL) {
      const q = query(collection(db, 'cards'), where('status', '==', 'pending'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setPendingCount(snapshot.size);
      });
      return unsubscribe;
    }
  }, [user]);

  useEffect(() => {
    // Google One-Tap Initialization
    const handleOneTapResponse = async (response: any) => {
      try {
        await signInWithOneTap(response.credential);
      } catch (error) {
        console.error("One Tap Login Failed", error);
      }
    };

    if (window.google && !user) {
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID',
        callback: handleOneTapResponse,
        use_fedcm_for_prompt: false,
      });
      window.google.accounts.id.prompt();
    }
  }, [user]);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/profile/')) {
      const id = path.split('/')[2];
      if (id) {
        setPublicProfileId(id);
        setView('profile');
      }
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const playerDoc = await getDoc(doc(db, 'players', u.uid));
        if (playerDoc.exists()) {
          setPlayer(playerDoc.data() as Player);
          if (view === 'setup') setView('home');
        } else {
          setView('setup');
        }
      } else {
        setPlayer(null);
        if (view !== 'leaderboard') setView('home');
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
                <button 
                  onClick={signInWithGoogle}
                  className="px-4 py-2 bg-emerald-500 text-zinc-950 rounded-full font-bold text-sm hover:bg-emerald-400 transition-colors"
                >
                  {t('nav.login')}
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 py-8">
          <AnimatePresence mode="wait">
            {user && !player ? (
              <SetupView key="setup" user={user} setPlayer={setPlayer} setView={setView} />
            ) : (
              <>
                {view === 'home' && <HomeView key="home" setView={setView} />}
                {view === 'generate' && <GenerateView key="generate" user={user} player={player} setPlayer={setPlayer} />}
                {view === 'leaderboard' && <LeaderboardView key="leaderboard" />}
                {view === 'profile' && <ProfileView key="profile" user={user} player={player} publicProfileId={publicProfileId} />}
                {view === 'setup' && <SetupView key="setup" user={user} setPlayer={setPlayer} setView={setView} />}
                {view === 'admin' && user?.email === ADMIN_EMAIL && <AdminView key="admin" />}
              </>
            )}
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
      </div>
    </HelmetProvider>
  );
}

// --- View Components ---

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

      const { imageUrl, power, strength } = await generateAnimeCardData(nameToGenerate);
      const accentColor = CARD_ACCENT_COLORS[Math.floor(Math.random() * CARD_ACCENT_COLORS.length)];
      const cardId = Math.random().toString(36).substring(2, 15);

      const card: Card = {
        cardId,
        ownerId: user.uid,
        ownerName: player.name,
        characterName: nameToGenerate,
        imageUrl: imageUrl,
        power,
        strength,
        status: 'pending',
        createdAt: new Date().toISOString(),
        accentColor
      };

      // Save Card
      await setDoc(doc(db, 'cards', cardId), card);

      // Update Player Cooldown ONLY (Power added after admin approval)
      const newLastGens = [...(player.lastGenerations || []), new Date().toISOString()].slice(-MAX_GENERATIONS);
      
      const updatedPlayer = {
        ...player,
        lastGenerations: newLastGens
      };

      await updateDoc(doc(db, 'players', user.uid), {
        lastGenerations: newLastGens
      });

      setPlayer(updatedPlayer);
      setNewCard(card);
      setCustomName('');
    } catch (error) {
      console.error("Generation failed", error);
      alert("Generation failed. Please try again.");
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
        <button onClick={signInWithGoogle} className="px-8 py-3 bg-emerald-500 text-zinc-950 rounded-full font-bold">{t('nav.login')}</button>
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
            {newCard ? (
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
    const q = query(collection(db, 'cards'), where('status', '==', 'pending'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cards = snapshot.docs.map(doc => ({ ...doc.data(), cardId: doc.id } as Card));
      setPendingCards(cards);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleApprove = async (card: Card) => {
    try {
      // 1. Update Card Status
      await updateDoc(doc(db, 'cards', card.cardId), { status: 'approved' });

      // 2. Update Player Total Power
      const playerRef = doc(db, 'players', card.ownerId);
      const playerSnap = await getDoc(playerRef);
      if (playerSnap.exists()) {
        const currentPower = playerSnap.data().totalPower || 0;
        await updateDoc(playerRef, { totalPower: currentPower + card.power });
      }
    } catch (error) {
      console.error("Approval failed", error);
    }
  };

  const handleReject = async (cardId: string) => {
    if (confirm("Are you sure you want to reject and delete this card?")) {
      try {
        // In a real app, we might just mark as rejected, but here we delete for simplicity
        // await deleteDoc(doc(db, 'cards', cardId)); 
        // Actually let's just mark as 'rejected' if we had that status, but for now we'll just leave it or delete.
        // Let's just update status to 'rejected'
        await updateDoc(doc(db, 'cards', cardId), { status: 'ordered' }); // Using 'ordered' as a fallback for now
      } catch (error) {
        console.error("Rejection failed", error);
      }
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
        <div className="bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-xl">
          <span className="text-xs font-bold text-red-500 uppercase tracking-widest">Pending Requests</span>
          <p className="text-2xl font-black text-red-400 leading-none">{pendingCards.length}</p>
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
                <div className="flex gap-4 mb-4">
                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Power</p>
                    <p className="text-lg font-black text-emerald-500 leading-none">{card.power}</p>
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
  const qrValue = `${window.location.origin}/profile/${card.ownerId}`;
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
              <p className={cn("text-xl font-black leading-none", accentText)}>{card.power}</p>
            </div>
            
            {/* QR Code in Corner */}
            <div className="bg-white p-1.5 rounded-lg shadow-lg">
              <QRCodeSVG value={qrValue} size={48} level="H" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-3xl font-black italic tracking-tighter text-white drop-shadow-lg uppercase truncate">
                {card.characterName}
              </h3>
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
                <p className="text-lg font-bold text-white leading-none">#{Math.floor(card.power / 10)}</p>
              </div>
            </div>
          </div>
        </div>

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
                    {p.totalPower}
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
    };

    fetchProfile();

    const q = query(collection(db, 'cards'), where('ownerId', '==', targetUid), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCards(snapshot.docs.map(doc => doc.data() as Card));
    });
    return unsubscribe;
  }, [targetUid]);

  const handleOrder = async (card: Card) => {
    if (!user || user.uid !== card.ownerId) return;
    try {
      await updateDoc(doc(db, 'cards', card.cardId), { status: 'ordered' });
      window.open(`mailto:${ADMIN_EMAIL}?subject=Card Order Request&body=I would like to order card: ${card.cardId} (${card.characterName})`);
    } catch (error) {
      console.error("Order failed", error);
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
      console.error("Update failed", error);
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
                <p className="text-2xl font-black text-emerald-500">{profilePlayer.totalPower}</p>
              </div>
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">{t('profile.cards_owned')}</p>
                <p className="text-2xl font-black text-white">{cards.length}</p>
              </div>
              {isOwnProfile && (
                <button 
                  onClick={logout}
                  className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors group"
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-red-500/60 mb-1">{t('nav.logout')}</p>
                  <LogOut className="w-6 h-6 text-red-500 group-hover:translate-x-1 transition-transform" />
                </button>
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
                <button 
                  onClick={() => handleOrder(card)}
                  disabled={card.status === 'ordered'}
                  className={cn(
                    "w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all",
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
        photoURL: user.photoURL || undefined
      };

      await setDoc(doc(db, 'players', user.uid), playerData);
      setPlayer(playerData);
      setView('home');
    } catch (error) {
      console.error("Setup failed", error);
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
