import { useState } from "react";
import type { Landmark } from "../types";

interface ArchiveAndQuizProps {
  landmarks: Landmark[];
  unlockedIds: string[];
  quizCompleted: boolean;
  onCompleteQuiz: (bonusPoints: number) => void;
}

interface Question {
  prompt: string;
  options: string[];
  correctIndex: number;
}

const QUESTIONS: Question[] = [
  {
    prompt: "Phoenix, the legendary Romanian rock band, was founded in 1962 in which city?",
    options: ["Cluj-Napoca", "Timișoara", "Iași", "București"],
    correctIndex: 1,
  },
  {
    prompt: "Marshall amplifiers and speaker cabinets, the sound of rock stages worldwide, come from which country?",
    options: ["United States", "Germany", "United Kingdom", "Japan"],
    correctIndex: 2,
  },
  {
    prompt: "Which Timișoara band recorded the song \"Dacă ploaia s-ar opri\"?",
    options: ["Holograf", "Compact", "Cargo", "Iris"],
    correctIndex: 2,
  },
];

const BONUS_POINTS = 100;

export default function ArchiveAndQuiz({
  landmarks,
  unlockedIds,
  quizCompleted,
  onCompleteQuiz,
}: ArchiveAndQuizProps) {
  const [answers, setAnswers] = useState<(number | null)[]>(QUESTIONS.map(() => null));
  const [submitted, setSubmitted] = useState(false);

  const locked = quizCompleted || submitted;
  const allAnswered = answers.every((a) => a !== null);
  const score = answers.reduce<number>(
    (sum, a, i) => (a === QUESTIONS[i].correctIndex ? sum + 1 : sum),
    0
  );

  function choose(questionIndex: number, optionIndex: number) {
    if (locked) return;
    setAnswers((prev) => prev.map((a, i) => (i === questionIndex ? optionIndex : a)));
  }

  function submit() {
    if (locked || !allAnswered) return;
    setSubmitted(true);
    onCompleteQuiz(BONUS_POINTS);
  }

  return (
    <div className="space-y-8 font-mono text-[#EAE6DF]">
      {/* Archive */}
      <section className="space-y-3">
        <h2 className="border-b-2 border-[#EAE6DF] pb-2 text-lg font-bold uppercase tracking-widest">
          // Archive
        </h2>
        <p className="text-xs uppercase text-[#33FF00]">
          &gt;&gt; {unlockedIds.length}/{landmarks.length} FILES DECLASSIFIED
        </p>

        {landmarks.map((l) => {
          const open = unlockedIds.includes(l.id);
          return open ? (
            <article key={l.id} className="border-2 border-[#0D0D0D] bg-[#EAE6DF] p-4 text-[#0D0D0D]">
              <p className="text-xs uppercase">{l.band}</p>
              <h3 className="text-lg font-bold uppercase">{l.title}</h3>
              <p className="mt-2 text-sm leading-relaxed">{l.historyText}</p>
              <audio controls src={l.audioUrl} className="mt-3 w-full">
                Your browser does not support audio.
              </audio>
              <a
                href={l.localCoverUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block rounded-none border-2 border-[#0D0D0D] p-2 text-center text-xs font-bold uppercase"
              >
                &gt;&gt; Local cover
              </a>
            </article>
          ) : (
            <article key={l.id} className="border-2 border-[#EAE6DF] bg-[#141414] p-4">
              <p className="inline-block rotate-2 border-2 border-[#D9381E] px-2 py-0.5 text-xs font-bold uppercase text-[#D9381E]">
                LOCKED
              </p>
              <p className="mt-2 text-xs uppercase opacity-70">{l.band}</p>
              <p className="mt-2 text-sm">
                <span className="text-[#33FF00]">CLUE &gt;&gt; </span>
                {l.riddle}
              </p>
            </article>
          );
        })}
      </section>

      {/* Quiz */}
      <section className="space-y-4">
        <h2 className="border-b-2 border-[#EAE6DF] pb-2 text-lg font-bold uppercase tracking-widest">
          // The Interrogation
        </h2>

        {QUESTIONS.map((q, qi) => (
          <fieldset key={q.prompt} className="border-2 border-[#EAE6DF] bg-[#141414] p-3">
            <legend className="px-1 text-xs font-bold uppercase text-[#33FF00]">Q{qi + 1}</legend>
            <p className="mb-2 text-sm">{q.prompt}</p>
            <div className="space-y-2">
              {q.options.map((opt, oi) => {
                const picked = answers[qi] === oi;
                const reveal = submitted;
                const isCorrect = oi === q.correctIndex;
                let style = "border-[#EAE6DF] text-[#EAE6DF]";
                if (picked && !reveal) style = "border-[#33FF00] bg-[#33FF00] text-[#0D0D0D]";
                if (reveal && isCorrect) style = "border-[#33FF00] text-[#33FF00]";
                if (reveal && picked && !isCorrect) style = "border-[#D9381E] text-[#D9381E] line-through";
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => choose(qi, oi)}
                    disabled={locked}
                    className={`block w-full rounded-none border-2 p-2 text-left text-sm uppercase disabled:cursor-not-allowed ${style}`}
                  >
                    [{picked ? "X" : " "}] {opt}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        {quizCompleted && !submitted && (
          <p className="inline-block -rotate-1 border-2 border-[#D9381E] px-3 py-1 text-sm font-bold uppercase text-[#D9381E]">
            INTERROGATION CLOSED // FILE SEALED
          </p>
        )}

        {submitted && (
          <p className="inline-block -rotate-1 border-2 border-[#33FF00] px-3 py-1 text-sm font-bold uppercase text-[#33FF00]">
            SCORE {score}/{QUESTIONS.length} // +{BONUS_POINTS} PTS
          </p>
        )}

        {!locked && (
          <button
            type="button"
            onClick={submit}
            disabled={!allAnswered}
            className="w-full rounded-none border-2 border-[#EAE6DF] bg-[#D9381E] p-3 text-sm font-bold uppercase tracking-widest text-[#EAE6DF] disabled:opacity-40"
          >
            {allAnswered ? "SUBMIT STATEMENT" : `ANSWER ALL ${QUESTIONS.length} QUESTIONS`}
          </button>
        )}
      </section>
    </div>
  );
}
