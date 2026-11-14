export interface Landmark {
  id: string;
  band: string;          // e.g., "Sfinții / Phoenix (1962–1977)"
  title: string;         // e.g., "Boxele Marshall"
  riddle: string;        // Clue to find the spot
  historyText: string;   // Short historical archive text
  audioUrl: string;      // Path or URL to audio snippet
  localCoverUrl: string; // Link to modern Timișoara underground band cover
  points: number;        // e.g., 150
}

export interface UserState {
  unlocked: boolean;
  handle: string;
  points: number;
  unlockedIds: string[]; // Array of unlocked Landmark.id strings
  quizCompleted: boolean;
}
