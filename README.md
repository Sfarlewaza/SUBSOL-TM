# FRECVENȚA 77 (SUBSOL-TM)
**Timișoara Underground Rock Treasure Hunt & Community Ecosystem**  
*Hackathon Project: IA-06 (Community Hero & Immersive Arts)*

---

## Overview

FRECVENȚA 77 is a phygital underground music discovery platform and decentralized Samizdat network built for Timișoara's independent rock and counterculture scene. It bridges physical urban exploration with digital persistence, turning street-level gig posters, hidden rehearsal spaces, and historical cassette archives into an interactive treasure hunt.

Designed for the Community Hero and Immersive Arts hackathon tracks, the platform empowers independent bands and DIY venues to self-onboard, mint location nodes, recruit roadies, and manage their own community economy without corporate middlemen.

---

## Key Technical Features

1. **256-bit Dual-Axis Perceptual dHash Scanner:** Advanced computer vision engine (17x17 luma grid measuring horizontal and vertical gradients) with multi-crop reference banks and strict scene contrast/stability gating (contrastStdDev >= 12) to reliably verify physical posters under harsh lighting and handheld angles.
2. **1:1 Square Geometry Enforcement:** Standardizes live camera viewfinders and reference uploads to true square aspect ratios, eliminating distortion.
3. **Real-Time Relational Supabase Sync:** Hybrid local-first architecture with instant synchronous UI feedback and background upsert synchronization across Supabase tables (profiles, custom_landmarks, custom_duties, custom_market_items, forum_messages).
4. **Decentralized Band Studio:** Local bands and venues can log in, self-mint physical scan nodes, set riddle clues, and drop community volunteer duties on the fly.
5. **Encrypted Zine Comms:** Channel-based underground bulletin boards (GIG-PROMO, GEAR-SWAP, LOST-TAPES) with multi-photo attachments and clearance-gated VIP backstages (SUBSOL-89).

---

## The Points & Perks Economy

FRECVENȚA 77 rejects algorithmic engagement traps in favor of sweat equity and physical exploration:
* **Enlistment:** +100 pts starter bonus upon registration.
* **Poster & Landmark Scanning:** +50 pts per verified physical scan.
* **Archive Quizzes:** +75 pts for solving Timișoara counterculture history trivia (1962-2026).
* **Community Duties:** +150 to +300 pts for completing physical roadie shifts or flyering tasks.
* **Perks & Marketplace:** Spend points on limited merch vouchers, cassette bootlegs, scan utility items, and VIP backstage clearance.

---

## Architecture & Escalation Tiers

```text
[ OPERATIVE ] --(Scan & Quiz)--> [ VET / ROADIE ] --(Community Duties)--> [ BACKSTAGE VIP ]
 (Base Access)                      (Market Vouchers)                        (Encrypted Channels)
```

* **Operatives (Fans):** Explore map landmarks, scan physical posters, and unlock archives.
* **Bands & Venues:** Self-onboard, mint scan nodes, and publish volunteer shifts.
* **Admins & Curators:** Broadcast emergency gig bulletins, manage historical quiz trees, and oversee platform stability.

---

## Tech Stack

* **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4.
* **Backend & Persistence:** Supabase (PostgreSQL, Auth, RLS, Public Storage), LocalStorage fallbacks.
* **Environment:** Linux-native terminal workflow (Fedora, Sway, Node.js).

---

## Local Development & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Sfarlewaza/SUBSOL-TM.git
   cd SUBSOL-TM/web-app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file in the `web-app` directory:
   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Build for production:**
   ```bash
   npm run build
   ```