export type AccountType = 'OPERATIVE' | 'BAND' | 'ADMIN';

export type QuizTopic =
  | 'HISTORY & CENSORSHIP'
  | 'GEAR & SOUND'
  | 'LOCAL SCENE & BANDS';

export interface Landmark {
  id: string;
  title: string;
  era: string;
  band: string;
  locationName: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  points: number;
  difficulty: 'RECON' | 'FIELD' | 'DEEP COVER';
  trackOrder: number;
  createdByType?: 'ADMIN' | 'BAND';
  creatorHandle?: string;
  riddle: string;
  story: string;
  referenceImageUrl: string;
  referenceDHash: string;
  audioSnippetTitle?: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface QuizNode {
  id: string;
  tier: number;
  code: string;
  title: string;
  topic: QuizTopic;
  createdByType: 'ADMIN' | 'BAND';
  creatorHandle: string;
  requiredLandmarkId?: string;
  requiredDutyCount?: number;
  rewardPoints: number;
  perkLabel: string;
  briefing: string;
  questions: QuizQuestion[];
}

export interface MarketItem {
  id: string;
  title: string;
  vendor: string;
  category: 'GIG ACCESS' | 'BAND MERCH' | 'ARCHIVE MEDIA' | 'BACKSTAGE';
  createdByType: 'ADMIN' | 'BAND';
  cost: number;
  description: string;
  stock: number;
  codePrefix: string;
}

export interface CommunityDuty {
  id: string;
  title: string;
  bandOrVenue: string;
  dutyType: 'ROADIE SHIFT' | 'POSTER RUN' | 'MERCH DESK' | 'SOUNDCHECK HELP';
  points: number;
  instantReward: string;
  repeatable?: boolean;
  locationHint: string;
  verificationCode: string;
  description: string;
}

export interface UserState {
  unlocked: boolean;
  handle: string;
  accountType: AccountType;
  points: number;
  unlockedIds: string[];
  quizCompleted: boolean;
  completedQuizNodes: string[];
  completedDutyIds: string[];
}
