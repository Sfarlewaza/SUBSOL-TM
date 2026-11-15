export interface Landmark {
  id: string;
  band: string;
  genre?: string;
  title: string;
  riddle: string;
  historyText: string;
  audioUrl: string;
  localCoverUrl: string;
  referenceImageUrl?: string;
  points: number;
  isCommunityBand?: boolean;
  approved?: boolean;
}

export interface UserState {
  unlocked: boolean;
  handle: string;
  points: number;
  unlockedIds: string[];
  quizCompleted: boolean;
}
