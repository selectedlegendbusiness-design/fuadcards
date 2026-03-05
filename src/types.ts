export interface Player {
  uid: string;
  name: string;
  age?: number;
  favAnime?: string;
  totalPower: number;
  lastGenerations: string[]; // ISO strings
  photoURL?: string;
}

export interface Card {
  cardId: string;
  ownerId: string;
  ownerName: string;
  characterName: string;
  imageUrl: string;
  power: number;
  strength: number;
  status: 'pending' | 'ordered' | 'approved';
  accentColor?: string;
  prompt?: string;
  createdAt: string;
}

declare global {
  interface Window {
    google: any;
  }
}
