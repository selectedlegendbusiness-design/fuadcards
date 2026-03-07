export interface Player {
  uid: string;
  name: string;
  age?: number;
  favAnime?: string;
  totalPower: number;
  lastGenerations: string[]; // ISO strings
  photoURL?: string;
  role: 'user' | 'admin';
}

export interface Card {
  cardId: string;
  player_id: string;
  ownerName: string;
  characterName: string;
  animeSource: string;
  rarity: string;
  description?: string;
  imageUrl: string;
  raw_power: number;
  strength: number;
  status: 'pending' | 'ordered' | 'approved';
  is_approved: boolean;
  accentColor?: string;
  prompt_text: string;
  qr_data: string;
  createdAt: string;
}

declare global {
  interface Window {
    google: any;
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}
