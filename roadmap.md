# FRECVENȚA 77 — Post-Hackathon Production Roadmap (v1.0)

> **Status:** Hackathon MVP (`v0.1-client`) is live and feature-frozen for demo/judging.  
> **Goal:** Transition from a zero-backend, trust-based MVP to a tamper-resistant, community-curated platform for Timișoara's underground music and arts scene.

---

## 1. Backend & Emergency User Curation
*Transition from pure `localStorage` to cloud-synced state with organizer override controls.*

- [ ] **Database Setup (Supabase / PostgreSQL):**
  - [ ] Create `users` table (`id`, `handle`, `device_token_hash`, `points`, `rank`, `is_banned`, `created_at`).
  - [ ] Create `unlock_logs` table (`id`, `user_id`, `landmark_id`, `gps_coords`, `match_score`, `unlocked_at`) to prevent duplicate point farming.
  - [ ] Create `redemptions` table (`id`, `user_id`, `reward_id`, `voucher_code`, `redeemed_at`, `verified_by_host`) for single-use gig/merch vouchers.
- [ ] **Frictionless Auth & Recovery:**
  - [ ] Keep instant handle creation on first visit (bind to a locally stored cryptographic `device_token`).
  - [ ] Add an optional 6-character **Samizdat Recovery Key** so users can restore their pass if they switch phones or clear browser cache.
- [ ] **Organizer Emergency Admin Panel (`/admin`):**
  - [ ] Protected route for event organizers/curators.
  - [ ] Search users by handle, manually adjust points/ranks during live events, revoke compromised vouchers, or shadowban spam accounts.

---

## 2. Anti-Spoofing: GPS Geofencing & Visual Matching
*Ensure users physically visit landmarks rather than tapping debug buttons or scanning photos off a screen.*

- [ ] **GPS Proximity Verification:**
  - [ ] Integrate `navigator.geolocation.getCurrentPosition()` with high-accuracy mode before allowing a landmark scan.
  - [ ] Implement Haversine distance validation (**40m default radius** to account for Timișoara old-town building multipath drift).
  - [ ] Add a **Venue Host Fallback PIN / Rotating QR** for subterranean basements or thick-walled museums (e.g., Miklós Museum) where GPS signal drops out.
- [ ] **Client-Side Photo Comparison (`dHash` / Perceptual Hashing):**
  - [ ] Capture actual high-contrast reference photos for all Timișoara landmarks (*Sfinții/Phoenix 1962*, *Boxele Marshall 1977*, *Progresiv TM*, *Cargo*, etc.).
  - [ ] Precompute 64-bit Difference Hashes (`dHash`) for each reference image and store them in `landmarks.ts` / DB.
  - [ ] Build an HTML5 `<canvas>` downsampler (`9x8` grayscale) in `ScannerView.tsx` to compute live frame hashes in `<15ms` and verify via Hamming distance threshold.
  - [ ] Add basic liveness/motion check (require two consecutive frames with slight accelerometer/pixel variance) to deter scanning static photos off another screen.

---

## 3. Cryptographic Discord Bridge & Role Security
*Replace easily guessable `!tune-77B-[handle]` strings with tamper-proof, single-use signed tokens.*

- [ ] **HMAC-SHA256 Signed Claim Tokens:**
  - [ ] Generate claim commands via a serverless function (Supabase Edge Function / Cloudflare Worker) using a private `HMAC_SECRET`:
    `!tune-77B-<handle>-<rank_tier>-<nonce>-<8char_sig>`
  - [ ] Include timestamp/nonce expiration (e.g., valid for 15 minutes) so leaked screenshots cannot be reused by other users.
- [ ] **Custom Verification Bot (replacing Carl-bot):**
  - [ ] Deploy a lightweight Discord bot (`discord.js` / `pycord`) listening to `#frequency-check`.
  - [ ] Verify the HMAC signature, check nonce uniqueness in the DB, delete the user's message immediately, assign the corresponding Discord role (*Listener* $\rightarrow$ *Tape Trader* $\rightarrow$ *Roadie* $\rightarrow$ *Pirate Broadcaster*), and DM confirmation.

---

## 4. Archival Content, Audio & Expanded Quizzes
*Deepen historical storytelling and replayability across the city.*

- [ ] **Archival Media Pipeline:**
  - [ ] Source and clear rights/fair-use educational clips for 10–15 second underground rock audio snippets (compressed to `96kbps` Mono `.mp3`/`.ogg` for fast mobile loading).
  - [ ] Optimize all landmark archival photos to `WebP` (`max-width: 800px`) with Samizdat halftone/xerox filtering.
- [ ] **Location-Specific Interrogation Quizzes:**
  - [ ] Expand `ArchiveAndQuiz.tsx` so every unlocked landmark unlocks its own dedicated 3-question mini-quiz (instead of a single global quiz).
  - [ ] Randomize question/answer ordering per attempt and enforce cooldown timers on failed attempts to prevent brute-forcing bonus points.

---

## 5. Developer Tooling & Operational Polish
*Speed up testing, field calibration, and live gig operations.*

- [ ] **Hidden Samizdat Dev Console (`?dev=1` or Secret Gesture):**
  - [ ] GPS Spoofer dropdown (jump virtual coordinates to *Piața Unirii*, *Miklós Museum*, *Parcul Rozelor*, etc.).
  - [ ] Visual Hash Inspector (display live Hamming distance score overlaid on the camera reticle during field calibration).
  - [ ] One-click `localStorage` state reset, point injector, and rank simulator (gated behind `import.meta.env.DEV` or admin auth in production).
- [ ] **PWA & Offline Resilience:**
  - [ ] Add `vite-plugin-pwa` + Service Worker so the app, audio snippets, and reference hashes cache offline after the first load.
  - [ ] Queue offline unlocks locally and auto-sync to Supabase once cellular signal returns.
- [ ] **Live Venue Partner Kit:**
  - [ ] Printable A4 Samizdat stencil/poster templates with weatherproof QR/visual markers for partner pubs, record shops, and tattoo studios in Timișoara.
