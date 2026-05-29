export interface TrackSlot {
  id: number;
  position: number;
  previewUrl: string;
}

export interface StartSessionResponse {
  sessionId: number;
  tracks: TrackSlot[];
}

export interface SubmitAnswerRequest {
  dailyChallengeTrackId: number;
  listenedDurationSeconds: number;
  wasExtended: boolean;
  artistAnswer: string | null;
  titleAnswer: string | null;
}

export interface SubmitAnswerResponse {
  artistCorrect: boolean;
  titleCorrect: boolean;
  score: number;
  correctArtist: string;
  correctTitle: string;
}
