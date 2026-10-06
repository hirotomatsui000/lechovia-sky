# Lechovia Skies — Design Spec (revision 24)

- **Date:** 2026-09-29
- **Status:** Approved.
  - Revision 2 incorporated the owner's project brief, which supersedes revision 1 where they differ.
  - Revision 3 adds the public-website roadmap approved on 2026-09-29 (§24), a new milestone M1c, the current key
    bindings (§15.3), and the photo scenery from `2026-09-29-realistic-graphics-design.md`.
  - Revision 4 applies the owner's feedback after playing M1b: the game is always third-person (§15.1), and the start
    menu becomes a minimal title screen over a live 3D background (§15.5).
  - Revision 5 (2026-09-30) applies the owner's second round of feedback: smoother handling (§9.2), enemies and missiles
    that stay visible (§15.2, §15.4), and missiles that a well-timed hard break can beat (§10.2).
  - Revision 6 (2026-09-30) adds the owner's Strike mode: Russia bombs three ground targets while the USA defends
    them, with limited aircraft per team (§13.1). It brings an abstract free-fall bomb (§10.4), ground targets (§11),
    strike AI (§14), strike HUD and title-screen mission choice (§15), and milestone M1d (§20).
  - Revision 7 (2026-10-01): the Kestrel and the Kobchik use the owner's own 3D models instead of the generated ones
    (§9.1, §15.4, §22).
  - Revision 8 (2026-10-01): milestone M1c "Website basics" is specified in detail as built: the Training mode
    (§13.2), the gamepad layout (§15.3), graphics presets with Auto (§15.4) and the settings screen (§15.5). Plan:
    `docs/superpowers/plans/2026-10-01-m1c-website-basics.md`.
  - Revision 9 (2026-10-01): milestone M2 "Multiplayer" as built (§7, §16, §17, §19, §20, §24). The dev server
    passes `/ws` and `/api` on to the game server instead of running inside it; the room travels in the hello message;
    a pilot's jet sets their team; Strike online gives each team 4 aircraft per pilot; the deploy smoke test drives two
    headless pilots over real WebSockets instead of a browser. Plan: `docs/superpowers/plans/2026-10-01-m2-multiplayer.md`.
  - Revision 10 (2026-10-01): milestone M3 "Roster & weapons" as built (§9, §10, §13.1, §15, §19, §20, §22). The
    owner's models move to the jets they depict (F-35A → Shade, Su-57 → Prizrak); the balance pass changes some
    numbers in §9.3; the tournament runs 100 seeds; Strike lasts 9 minutes now that defenders carry Lances. Plan:
    `docs/superpowers/plans/2026-10-01-m3-roster-weapons.md`.
  - Revision 11 (2026-10-01): milestone M4 "World" as built (§2, §8, §10.3, §12.3, §13, §15, §18, §19, §20). Dogfight
    and Free Flight fly over Lechovia; Strike and Training keep the Test Range. The photographed sky gives way to a
    computed sky that follows the time of day and the weather. Runway starts are the player's choice; bots start in
    the air; there is still no landing. Protocol 3 carries the room's map, weather and clock. Plan:
    `docs/superpowers/plans/2026-10-01-m4-world.md`.
  - Revision 12 (2026-10-01): milestone M5 "Modes & polish" as built (§2, §7, §10.3, §13, §14, §15, §19, §20, §24). Air
    Superiority, Team Objective (with AI-flown Sentinels and a team datalink) and Free Flight extras, offline and
    online (protocol 4); pilots per side offline; kill cam, spectating and a jet change while waiting to respawn;
    contrails, wingtip vapour, burning damage and falling wrecks; positional sound; an end-of-match summary; reduce
    flashing and colour-blind team colours. Plan: `docs/superpowers/plans/2026-10-01-m5-modes-polish.md`.
  - Revision 13 (2026-10-02): the public site deploys itself: Netlify builds the multi-file site (`dist/`) from the
    repository on every push (`netlify.toml`), replacing hand-dropped single-file builds (§24).
  - Revision 14 (2026-10-02): at the owner's request **online play is removed**: the game is single player against AI
    pilots and has no server. The server, the wire protocol, NetworkSession, the ONLINE sheet, quick chat, the version
    check, error reports and cannon lag compensation are deleted; §7, §16 and the online rows of §17 describe that code
    as it was (last in commit `a9139d5`). The site moves from Netlify to GitHub Pages: a GitHub Actions workflow tests,
    builds and publishes it after every push to `main` or a `claude/…` branch (§24).
  - Revision 15 (2026-10-02): the owner found mouse aim too quick: 100% sensitivity is now 0.0011 rad per pixel (was
    0.0022), and free look turns twice as fast per pixel as the aim, as quick as before (§15.3).
  - Revision 16 (2026-10-02): at the owner's request, fuel, wind and spins (§8, §9, §12.3, §15, §19, §23). Plan:
    `docs/superpowers/plans/2026-10-02-fuel-wind-spins.md`.
  - Revision 17 (2026-10-02): at the owner's request, career records kept in the browser (§15.5, §23): totals,
    personal bests, matches by mission and jet, the last ten matches; no account.
  - Revision 18 (2026-10-03): at the owner's request, a single-player campaign of nine missions flown in order
    (§13.6, §15.5). The wind now blows from any direction (§12.3): the front runs north–south, so the westerlies of
    revision 16 handed the western team a tailwind every match.
  - Revision 19 (2026-10-03): at the owner's request the game is renamed **Lechovia Skies** (first published as
    Contested Skies; browser storage keeps the old `contested-skies:` prefix so saved data survives), and the site
    moves to https://lechovia-skies.github.io/._./ (the owner moved the repository to a free organization
    `lechovia-skies` and named it `._.`, §24). A soundtrack chosen by the owner plays on the title screen and in
    flight (§15.5), the synthesized engine sound is gone, dusk and night are lit brighter (§12.3), the title screen
    no longer offers the weather or "Clock runs" (§15.5), and the afterburner is a glowing gas instead of an orange
    cone (§15.4). Team Objective is
    evened out between the sides (§13.4, §14): Sentinels run in a level, bank-limited turn (they used to spiral into the
    ground), start alike, lean inward at the edge; every third fighter of a team escorts, counted within the team; bots
    break off near a Sentinel; every fighter carries 4 Lances; the USA's Sentinels get 50 HP per Russian fighter.
  - Revision 20 (2026-10-03): the owner found hitting far too hard, missiles above all. The player's weapons now hit
    more easily than the AI pilots' (§10.5); the AI pilots, wingmen included, keep the plain weapons.
  - Revision 21 (2026-10-06): at the owner's request G has consequences: "G builds → the view goes red and darker →
    at its darkest the pilot blacks out → the stick stops answering and the jet crashes". Pulling harder than 7 G
    strains the pilot (§8); the view turns red and closes in (§15.2); at full strain the pilot blacks out (G-LOC) and
    the jet spirals into the ground, a death of its own (§11). AI pilots ease off before it (§14), and the balance
    tournament still passes (§9.4). The bare address lechovia-skies.github.io, and links cut short, now lead to the
    game (§24).
  - Revision 22 (2026-10-06): at the owner's request, landing and rearming (§10.6): a low, slow pass over a friendly
    runway, or the roll-out after a landing, reloads missiles, gun rounds and flares and refuels; stopped on the
    runway the jet is repaired too. The gear comes down by itself on approach (§8), the HUD points the way home and
    reads out the approach (§15.2), and the map gives the distance to every airfield you can use. The owner also
    reported the map screen "out of place"; nothing was off in a match, but Free Flight pulled a click near the edge
    of the map back into the combat area, so you flew from somewhere else: Free Flight now opens the whole map
    (§13.5).
  - Revision 23 (2026-10-06): the owner saw the scenery come out in front of the jet now and then. The chase camera
    never looked at the ground: 30 m behind a jet flying low over hills it could sit inside a slope, or behind a ridge
    the jet had just cleared, so the ground covered the jet. It now keeps clear of the ground (§15.1).
  - Revision 24 (2026-10-06): at the owner's request ("about five seconds of a really cool loading screen before the
    title screen"), the page opens on five seconds of gun-camera footage while the scenery and jets load (§15.5).
- **Owner:** Hiroto Matsui
- **Title:** Lechovia Skies (`lechovia-skies`); the working title until revision 19 was Contested Skies.

## 1. Summary

A browser-based flight-combat simulator prototype. (Revision 14: single player only; the multiplayer described below
was built in M2 and removed again.)
- **Teams:** USA and Russia, each flying four **fictional** fighters inspired by real aircraft.
- **Map:** a large **fictional Eastern European country, "Lechovia"**, whose geography is inspired by Poland:
  - a northern sea coast and a lake district;
  - central plains crossed by a great river;
  - southern mountains;
  - fictional cities, villages, roads and airfields.
- **Flight model:** an arcade/simulation hybrid. Real lift/drag/thrust physics with fly-by-wire style controls, so
  energy, stalls and G-limits matter while staying flyable with a mouse and keyboard.
- **Weapons:** abstracted gameplay versions of a cannon, a short-range infrared missile, a medium-range radar missile,
  and flares/chaff; in the Strike mode the attackers also carry an abstract free-fall bomb.
- **Multiplayer:** an authoritative Node.js server validates everything that matters. Browsers predict their own jet
  and interpolate the rest. AI bots fill empty seats.
- **Development order:** a small single-player prototype first, then multiplayer, then expansion.

## 2. Decisions log

| Topic | Decision | Source |
|---|---|---|
| Platform | Browser: Three.js client + Node.js server, TypeScript everywhere | Q&A, 2026-09-29 |
| Realism | Arcade/sim hybrid: physics-based translation, fly-by-wire rotation | Q&A + brief |
| Hosting | LAN first; Dockerfile for public deployment later | Q&A |
| Netcode | Authoritative server + client prediction/reconciliation + snapshot interpolation + lag-compensated bullets | Q&A |
| Aircraft | 8 fictional aircraft with fictional names and specifications, 4 per team, data-driven | Brief (supersedes real F-15C/F-16C/Su-27/MiG-29) |
| Weapons | Cannon, short-range IR missile, medium-range radar missile, flares + chaff; behavior abstracted | Brief (supersedes guns + IR only) |
| Map | Fictional, procedurally generated Poland-inspired landscape with fictional locations; no real-world data download | Brief (supersedes real elevation data) |
| Modes | Team Deathmatch, Air Superiority, Team Objective, Free Flight | Brief |
| Environment | Clouds, weather presets, day/night cycle | Brief |
| Development order | Playable single-player prototype first (one aircraft, test map, one AI opponent, combat, HUD), then multiplayer, then roster/map expansion, then modes/polish | Brief |
| Scenery | Photographed sky with image-based lighting, and Sentinel-2 satellite photos blended by land class, replace the sky shader and vertex-colored terrain | Owner request; `2026-09-29-realistic-graphics-design.md` |
| Public website | Single-player builds publish as one self-contained HTML file on static hosting (Netlify). Online play (M2) needs a Node host with WebSockets; the owner chooses and pays for it | Owner request + roadmap review, 2026-09-29 |
| Roadmap additions | Public-website features (§24) and milestone M1c "Website basics"; gamepad and flight-stick support move from M5 to M1c | Roadmap review, 2026-09-29 |
| Camera | Third-person chase camera only; the first-person HUD view, the cockpit view and the free camera are dropped | Owner feedback on M1b, 2026-09-29 |
| Start screen | A minimal title screen over a live 3D showcase of the selected jet. The scenery photos preload there and the game reuses them | Owner feedback on M1b, 2026-09-29 |
| Handling | Slower, smoother rotation: max roll rates ×0.64, roll response lag 0.35 s, pitch response lag 0.15 s | Owner feedback, 2026-09-30 |
| Missile evasion | Short-range missiles guide with N = 3, a 20 g limit and a 0.5 s response lag, so a hard break timed shortly before impact beats them. Missile warnings start at launch | Owner feedback, 2026-09-30 |
| Visibility | Distant aircraft and missiles keep a minimum apparent size; missiles get HUD markers, a motor flame and a thicker smoke trail | Owner feedback, 2026-09-30 |
| Strike mode | A fifth mode: Russia must destroy two of three fictional ground targets; the USA must hold them for 9 minutes (8 until revision 10). Each team has 4 aircraft; losing the 4th loses the match. No draws | Owner request, 2026-09-30 |
| Air-to-ground | Allowed only as the Strike mode's abstract free-fall bomb, which damages ground targets and never aircraft. The out-of-scope rule (§23) is narrowed accordingly | Owner request, 2026-09-30 |
| Training | A sixth mode, Training: four lessons (rings, gun, missile, defend) against drones that never fire back except one scripted missile; the player cannot lose, a shot-down lesson restarts | M1c, 2026-10-01 |
| Graphics presets | Low/Medium/High set the pixel ratio, antialiasing, particle share and ground-photo anisotropy. Auto starts on High (Medium above 6 M device pixels), steps down one level after 3 s under 45 fps in a match, never steps up within a session, and remembers the level | M1c, 2026-10-01 |
| Key remapping | Every keyboard action except Esc is rebindable; taking another action's primary key swaps the two, so no action is left unbound | M1c, 2026-10-01 |
| Aircraft models | The owner's 3D models (generated with Tripo, inspired by the F-35A and the Su-57) replace the generated models of the Kestrel and the Kobchik. Names and specifications stay fictional; an aircraft without a model file keeps the generated model | Owner request, 2026-10-01 |
| Maps per mode | Dogfight and Free Flight fly over Lechovia by default (the Test Range stays selectable); Strike and Training keep the Test Range they were laid out and balanced on | M4, 2026-10-01 |
| Sky | A computed (Preetham) sky, sun, moon and stars replace the sky photo, which could show only one hour in one weather; the satellite-photo ground stays | M4, 2026-10-01 |
| Runway starts | A per-pilot choice (title screen: Air or Runway start); bots always start in the air; the gear retracts by itself and touching the ground with it up is a crash (no landing, §23; landing arrived in revision 22, §10.6) | M4, 2026-10-01 |
| Zone capture | A zone's progress runs −1 (Russia) … +1 (USA) and moves toward the side with more aircraft inside at advantage / 10 s; a side owns it at its end of the scale and loses it when pushed back past 0. Only zones score in Air Superiority | M5, 2026-10-01 |
| Team Objective scoring | Every death of a fighter gives the other team +1 (as in Team Deathmatch); a Sentinel +20 | M5, 2026-10-01 |
| Datalink | Built in M5: each pilot sees the enemies on teammates' radar, drawn hollow, never lockable. Sentinels carry a 150 km all-round radar, so they feed it | M5, 2026-10-01 |
| Offline team size | "Pilots per side" 1, 2 or 4 on the title screen: AI wingmen against as many AI pilots; Strike scales to 4 aircraft per pilot per team | M5, 2026-10-01 |
| Free Flight online | No bots, no weapons, no drones; anyone in the room changes its weather and clock; "fly from here" on the map. Target drones are offline only | M5, 2026-10-01 |
| Online play removed | The owner chose a static website with no server to run or pay for: online play and everything that served it are deleted; the site is published with GitHub Pages from every push | Owner request, 2026-10-02 |

## 3. Goals and non-goals

**Goals**
1. The project stays runnable after every milestone and every major stage within one.
2. A single-player prototype (one aircraft vs one AI, test map, combat, HUD) exists before networking.
3. 8–16 human players per room with server-authoritative gameplay decisions.
4. 8 data-driven aircraft. A new aircraft needs only a data file (no flight-system changes). No aircraft is
   automatically superior: automated bot tournaments must show every pairing's win rate between 35% and 65%.
5. The Lechovia map: cities, villages, roads, rivers, forests, fields, hills/mountains, fictional airfields,
   clouds/weather, day/night.
6. Five game modes (revision 6 adds Strike); a modern, readable fighter HUD; a smooth third-person camera.
7. 60 fps on a 2020+ laptop at 1080p in a current desktop browser.
8. A first-time visitor is flying within one minute, learns the basics from a guided training flight, and gets
   graphics settings that suit their hardware automatically (§24).

**Non-goals:** see §23.

## 4. Engine choice and rationale

**Chosen: Three.js (WebGL) client + Node.js server, all TypeScript, built with Vite, tested with Vitest.**

Why:
- **Zero install:** players join a room by opening a URL, which matters for getting 8–16 people into a test quickly.
- **One language on both sides:** the *same* TypeScript flight physics, weapons and targeting code runs on the
  authoritative server and in the browser for prediction. The two can't drift apart, and there's no duplicated logic.
- **Full rendering control:** Three.js gives direct access to terrain LOD, custom sky/cloud/haze shaders and
  effects, with no engine licensing and a large ecosystem.
- **Fast iteration and TDD:** Vite hot reload plus Vitest. Node 26 is installed here and runs TypeScript natively, so
  every stage can be built, tested and played in a browser on this machine.

Alternatives considered:
- **Unity or Unreal:** higher graphics ceiling, but a heavy download for players, separate netcode stacks, and neither
  is installed here to verify builds.
- **Godot 4:** lighter, but its web export and multiplayer are less proven at this scale, and it isn't installed here.
- **Babylon.js:** comparable to Three.js with more built-in engine features. Three.js was chosen for its simpler core
  and ecosystem.

Accepted trade-off: the visual ceiling is below Unreal/Unity. Mitigations are LOD, budgets and targeted shaders (§15).

## 5. Technical architecture

### 5.1 Layers

```
┌──────────────────────── client (browser) ────────────────────────┐   ┌──────── server (Node) ────────┐
│ ui · hud · camera · render · audio · input                       │   │ http static / vite middleware  │
│              │ reads snapshots of world state                    │   │ rooms · connections · tick loop│
│         GameSession interface ───────────────────────────────────┼──▶│ (M2+)                          │
│   LocalSession (M1: World runs in the browser)                   │   │   World runs here              │
│   NetworkSession (M2+: prediction + interpolation over WebSocket)│   │                                │
└──────────────────────────────────────────────────────────────────┘   └────────────────────────────────┘
                 both import  src/shared  (pure TypeScript, no DOM or Node APIs)
   data (aircraft, weapons, maps) · physics · weapons · targeting · damage · ai · map · modes · world · net
```

The renderer, HUD and input depend only on the `GameSession` interface. M1 uses `LocalSession`; M2 adds
`NetworkSession` without changing gameplay code.

### 5.2 Systems

| System (from the brief) | Location | Responsibility |
|---|---|---|
| Flight physics | `src/shared/physics/` | Atmosphere, aerodynamic coefficients, forces, fly-by-wire control laws, integration |
| Aircraft configuration | `src/shared/data/aircraft/` | One data file per aircraft, types, registry, validation |
| Weapons | `src/shared/weapons/` + `src/shared/data/weapons.ts` | Cannon projectiles, missiles and guidance, countermeasures, lead solution |
| Targeting | `src/shared/targeting/` | Visual detection, radar and stealth, IR seeker, target designation, locks, warnings |
| Damage | `src/shared/damage/` | Hit points, damage states and their effects, destruction |
| AI | `src/shared/ai/` | Steering primitive, bot pilot behaviors, difficulty profiles |
| Multiplayer/networking | `src/shared/net/`, `src/server/`, `src/client/session/` | Protocol and codecs, authoritative rooms, prediction and interpolation |
| UI | `src/client/ui/`, `src/client/hud/` | Menus, overlays, settings, fighter HUD, radar display |
| Audio | `src/client/audio/` | WebAudio-synthesized wind, weapons, tones and warnings; the soundtrack player (revision 19) |
| Maps | `src/shared/map/`, `src/shared/data/maps/`, `src/client/render/terrain/` | Terrain generation and sampling, features (settlements, roads, airfields), map definitions, terrain rendering |
| Game modes | `src/shared/modes/` | A `GameMode` interface plus TDM, Air Superiority, Team Objective, Free Flight |
| World | `src/shared/world/` | Entities, the fixed-step simulation, events, spawning |

### 5.3 Conventions

- **Units:** SI internally (m, s, kg, N, rad). The HUD converts for display (knots/feet for USA aircraft, km/h/meters
  for Russia aircraft; switchable in settings).
- **World frame:** right-handed, y-up. `+x` = east, `+y` = up, `-z` = north. Map origin at the map center, sea level.
- **Body frame:** forward = `-z_b`, up = `+y_b`, right = `+x_b`. Angular velocity is expressed in the body frame.
- **Control input:**
  - `pitch +1` = nose up, `roll +1` = roll right, `yaw +1` = nose right.
  - `throttle` ∈ [0, 1] (> 0.9 = afterburner).
  - Buttons: cannon, missile, countermeasures, airbrake, target cycle, weapon select, helmet sight.
- **TypeScript:** `strict`; **erasable syntax only** (no `enum`, `namespace`, parameter properties) so Node 26
  runs `.ts` directly; relative imports use explicit `.ts` extensions; `import type` for type-only imports.
- **Determinism:** shared simulation functions are pure given (state, input, dt, seeded RNG). All randomness comes from
  the World's seeded RNG.

## 6. Folder structure

```
contested-skies/
├── index.html · package.json · tsconfig.json · vite.config.ts · README.md · .gitignore · Dockerfile (M2)
├── docs/superpowers/{specs,plans}/
└── src/
    ├── shared/
    │   ├── math/            units, rng, noise, vector helpers
    │   ├── data/
    │   │   ├── aircraft/    types.ts, registry.ts, validate.ts, one file per aircraft (kestrel.ts, kobchik.ts, …)
    │   │   ├── weapons.ts   cannons, missiles, countermeasures (abstract parameters)
    │   │   └── maps/        test-range.ts (M1), lechovia.ts (M4)
    │   ├── physics/         atmosphere.ts, aero.ts, flight-model.ts, controls.ts
    │   ├── weapons/         cannon.ts, missile.ts, countermeasures.ts, lead.ts
    │   ├── targeting/       sensors.ts, radar.ts, ir-seeker.ts, designation.ts
    │   ├── damage/          damage.ts
    │   ├── ai/              steering.ts, bot-pilot.ts, difficulty.ts
    │   ├── map/             terrain.ts (GridTerrain), generators, features
    │   ├── modes/           mode.ts, team-deathmatch.ts, free-flight.ts, air-superiority.ts, team-objective.ts
    │   ├── world/           world.ts, entities.ts, events.ts, spawns.ts
    │   └── net/             protocol.ts, codecs (M2)
    ├── server/              main.ts, config.ts, rooms, connections, static http (M2)
    └── client/
        ├── main.ts
        ├── session/         game-session.ts, local-session.ts, network-session.ts (M2)
        ├── input/           keyboard, mouse-aim, gamepad (M5) → ControlInput
        ├── render/          renderer, sky, terrain/, models/, effects/, title-screen showcase, clouds (M4)
        ├── camera/          camera-rig.ts (third-person chase, look-around, shake)
        ├── hud/             hud.ts, layers (flight, weapons, radar display, warnings), units
        ├── ui/              menus, overlays, settings
        └── audio/           synthesized sounds
```

Tests are colocated as `*.test.ts`.

## 7. Multiplayer architecture (M2)

Removed in revision 14; kept as a record of what was built (code last in commit `a9139d5`).

- **Topology:** one Node process serves the built site (`dist/`) and a WebSocket at `/ws` on one port (default 8080);
  the room name travels in the `hello` message. LAN players open `http://<host-ip>:8080`; the server prints its LAN
  URLs. (Revision 9: in development the Vite dev server passes `/ws`, `/api` and `/healthz` on to `npm run server`
  instead of the server hosting Vite.)
- **Authority:** the server runs the `World` at a fixed 60 Hz. It is the only authority for:
  - hits and damage;
  - locks and missile guidance;
  - ammunition and cooldowns;
  - scoring, objectives and respawns.
  Clients send only control inputs.
- **Client → server:** a compact binary input every client tick (60 Hz): `seq`, stick/throttle, buttons, selected weapon,
  head direction for the helmet sight, and `viewDelay` (ticks between the predicted tick and the tick others were
  rendered at).
- **Server → client:**
  - Binary snapshots at 30 Hz. Per jet: id, flags, hp, throttle, position (f32), orientation (quantized quaternion),
    velocity (quantized). Also missiles, and a per-client section with the full-precision own state for
    reconciliation, ammo/stores, lock and warning state, and `ackSeq` and input-queue depth.
  - JSON events for kills, hits, launches, detonations, countermeasures, mode status, roster and scores.
- **Prediction and reconciliation:**
  - The client simulates its own jet with the shared flight model.
  - Once per frame, with the newest snapshot, it resets to the authoritative state and replays unacknowledged inputs.
  - A slow frame still sends every input the server clock asks for (up to 15 per frame, so down to 4 fps).
  - Visual corrections decay smoothly (τ = 0.1 s); a respawn is a hard reset.
- **Interpolation:** other entities render 100 ms in the past, Hermite for position and slerp for orientation;
  extrapolation is capped at 200 ms.
- **Clocks and queues:** ping/pong every 2 s; minimum-RTT sample in a sliding window.
  - One input queue per player; one input consumed per tick (the last is repeated if empty).
  - The client nudges its tick rate ±2% to keep the queue about 2 deep.
- **Lag compensation:** a 1 s position history per jet. Cannon hit tests rewind targets by the shooter's `viewDelay`
  (capped at 250 ms, only within the same life). Missiles, collisions and objectives are not rewound.
- **Rooms and capacity:**
  - The first join creates a room and fixes its mode, map and bot settings.
  - 16 humans per room and 20 rooms per process (configurable).
  - Bots fill each team to a configurable size (default 4). Callsigns are sanitized and bots are prefixed `[BOT]`.
  - A pilot's jet sets their team (Kestrel: USA, Kobchik: Russia). A new room plays the mode its first pilot picks on
    the ONLINE sheet (M5: Dogfight, Air Superiority, Team Objective, Free Flight, or Strike with 4 aircraft per pilot
    per team); a finished match restarts by itself after a short results screen.
  - Protocol 4 (M5): the client may send `jet` (the next aircraft), and in Free Flight `world` (weather, the hour now,
    clock) and `flyFrom` (a map point), together at most 8 a second; the server answers a sky change with
    `environment` to the whole room. The own snapshot section lists the datalink contacts. Sentinels are not
    seat-filling bots; Free Flight rooms have no bots.
- **Validation:** clamp all input values; cap message sizes (binary 64 B, JSON 2 KB) and rates (120 inputs/s).
  Three protocol violations within 10 s → disconnect. A disconnect affects only that player.
- **Bandwidth:** ≤ 50 KB/s down and ≤ 1 KB/s up per client with 32 jets.
- **Exact byte layouts** are defined in the M2 plan and include the M3 fields (radar missile, chaff, weapon select)
  from the start.
- **Debugging:** `?lag=<ms>&jitter=<ms>` simulates latency; `?debug=1` shows FPS, RTT, queue depth, prediction error,
  α, n, Mach.

## 8. Flight-model approach

`stepFlight(state, input, config, dt)`, semi-implicit Euler at `dt = 1/60 s`.
State: `{pos, vel, quat, angVel, throttle, airbrake}`, plus derived `alpha, beta, gLoad, mach`.

**Atmosphere (ISA)** — altitude effects:
- 0–11 km: `T = 288.15 − 0.0065h`, `ρ = 1.225(T/288.15)^4.2559`.
- 11–20 km: `T = 216.65`, `ρ = 0.36392·e^{−(h−11000)/6341.6}`.
- `a = 20.0468√T`.

**Air data:**
- `q̄ = ½ρV²`, `M = V/a`.
- Velocity in the body frame `v_b = quat⁻¹·vel`.
- `α = atan2(−v_b.y, −v_b.z)`, `β = atan2(v_b.x, −v_b.z)`.

**Coefficients** (all per-aircraft data):
- `CL(α)`: linear `CLα·α` to `α_max`. Past `α_max` it drops 40% over 15°, then follows a flat-plate `1.05·sin 2α`;
  symmetric for negative α.
- `CD = CD0·W(M) + K·(1 + 0.8·max(0, M − 1))·CL² + 1.5·sin²(max(0, |α| − α_max)) + 0.5·β² + 0.08·airbrake`.
  `W(M)` is a transonic wave-drag factor: 1.0 below M 0.85, peak 2.2 at M 1.05, 1.6 from M 2.0.
- Side force `CY = −1.0·β`.

**Forces:**
- Lift along `normalize(right × v̂)`; side force along `normalize(v̂ × liftDir)`; drag along `−v̂`.
- Thrust along body forward: `T(throttle)·σ^0.75·(1 + 0.2·M·(1 − σ))` with `σ = ρ/1.225`.
  - Throttle 0–0.9 maps idle (5% of military) → military; 0.9–1.0 maps military → full afterburner.
  - Spool time constant 0.6 s. The damage state scales thrust (§11).
- Gravity.

**Rotation (fly-by-wire):**
- **Pitch:** the stick commands a load factor.
  - Neutral = `n_trim = liftDir.y` (holds the flight path; −1 G when inverted); full aft = `n_max`; full forward = `n_min`.
  - `α_cmd = clamp(n_cmd·m·g/(q̄·S·CLα), −10°, α_limiter)`.
  - Pitch rate `= (acc·liftDir)/V + k_α·(α_cmd − α)`, clamped to the max pitch rate.
  - Result: G-limited at high speed and lift-limited at low speed, so turning is speed-dependent and a corner speed
    emerges. `α_limiter` sits just past `α_max`, so a low-speed pull stalls and mushes.
- **Roll:** about the velocity vector (stability axis). Rate `= roll·p_max·authority`, reduced by up to 50% between α 15°
  and 30°.
- **Yaw:** a feed-forward keeps the nose on the velocity vector (coordinated flight), plus a sideslip controller toward
  `β_cmd = −yaw·6°`.
- **Authority:** `authority = clamp(q̄/5 kPa, 0.05, 1)`. Thrust-vectoring aircraft add `tvc·thrustFraction` to pitch/yaw
  authority and have higher AoA limiters (supermaneuverability).
- **Lags:** body rates follow commands with first-order lags (pitch 0.15 s, yaw 0.08 s, roll 0.35 s). Since revision 5
  these are slow enough that the jet rolls and pitches smoothly instead of snapping. The quaternion is integrated from
  body rates and renormalized every step.
- **Airbrake** deploys and stows over 1 s.
- **Crash rule:** ground/sea contact when `pos.y < surfaceAt(x, z) + 2 m`, where `surfaceAt = max(heightAt, 0)` (sea at 0 m).
- **Derived outputs** for HUD and effects: `gLoad = ((F_aero + F_thrust)/m · up_b)/g`, Mach, α, β.
- **Visual effects tied to the model:** camera shake and effects use G-load, the transonic buffet band (M 0.95–1.05),
  afterburner and speed.
- **Ground handling (M4, runway spawns), as built:**
  - `FlightState` has `gear` (1 down … 0 up) and `onGround`. On the wheels a separate step runs: gear springs
    (natural frequency 9 rad/s, damping 0.8; the reference point rests about 2.4 m above the runway), rolling friction
    0.025 and wheel brakes 0.35 (the airbrake key; since revision 22 they also idle the engines), no side slip, nose-wheel steering from the roll and rudder inputs
    (25 °/s slow, 4 °/s fast), and rotation up to 14° nose up once the dynamic pressure gives the elevator authority
    (full at 4 kPa, about 155 kt). The jet leaves the ground when lift exceeds weight.
  - Wheels touch only inside an airfield's flattened ground (the runway plus 400 m beyond each end, ±450 m across);
    rolling off it is a crash. A gentle touchdown with the gear fully down rolls on: sinking slower than 5 m/s, less
    than 15° of bank, pitch −3° to 16° (revision 22, for landing; it was 3 m/s, 10°, −2° to 15°, only for a bounce on
    the take-off run).
  - The gear retracts over 4 s once the jet is 30 m above the airfield or has left it, and adds drag (CD +0.02) while
    out. Every jet lifts off within the runway at military power (190–230 kt, 15–24 s) and at full afterburner.
  - Revision 22: the gear comes down by itself, over 4 s, on approach to a friendly airfield (§10.6): within 6 km of
    the runway's ends and 1.5 km of its centre line, under 450 m above it, slower than 140 m/s and not climbing faster
    than 2 m/s. With the gear moving or down there is no PULL UP warning. Every jet lands from a 3° approach at about
    80 m/s with a plain autopilot (touchdown sink about 1 m/s) and stops on the brakes within the runway.
- **Fuel (revision 16):** `physics.fuelKg` is internal fuel, included in `massKg` (the full-tank mass); the mass in the
  equations is `massKg − fuel burnt`. Fuel flow follows thrust: 2.1·10⁻⁵ kg/(N·s) up to military power and
  1.05·10⁻⁴ kg/(N·s) for the afterburner's extra thrust, never under 8% of the military-power flow (Kestrel at sea
  level: 1.6 kg/s military, 7.3 kg/s full afterburner; full afterburner empties a tank in 6.5–12 minutes at sea level).
  An empty tank flames the engines out: no thrust, no flow. A respawn, Training's restock and Free Flight's "fly from
  here" refuel; there is no refuelling in flight.
- **Wind (revision 16):** `FlightEnv.wind` is the air's velocity; airspeed, Mach, α, β, lift and drag use
  `vel − wind`, so the jet drifts with the air mass and its ground speed differs from its airspeed. On the wheels the
  headwind along the runway counts as airspeed. Gusts come from the wind field (§12.3).
- **Departures and spins (revision 16):** with `stalled = clamp((α − α_max)/5°, 0, 1)` and
  `instability = stalled·(1 − departureResistance)·(1 − authority)`, the yaw command gains
  `−8·instability·(β − 0.5 rad·roll)`: stalled at low dynamic pressure the jet loses its weathercock stability and a
  roll input drops a wing. When `instability > 0.05` and `|β| > 12°`, or the jet is slower than 30 m/s with
  `(1 − resistance)·(1 − authority) > 0.3`, it departs into a spin (direction from the sideslip). In the spin the
  fly-by-wire is out: the body yaws round the vertical at `100°·(1 − 0.4·resistance)`/s, the attitude is pulled to 45°
  nose down with wings level, and the broadside airframe adds CD 0.9, so it falls at 70–100 m/s. After 1.5 s,
  recovery progresses at `(0.2 + 0.35·opposite rudder + 0.15·forward stick)·(1 + resistance)` per second; aft stick or
  pro-spin rudder undo it at 0.5/s. On recovery the body rates drop to 30% and for 3 s the AoA limit is `α_max − 2°`
  with no instability, so the jet dives out instead of spinning again. Hard-limited jets (limiter ≤ α_max + 1°) and
  thrust-vectoring jets with thrust barely depart; with the throttle closed thrust vectoring cannot help.
- **Pilot G tolerance (revision 21, `physics/g-tolerance.ts`):** each pilot has a strain from 0 (clear) to 1. Above
  7 G (what a pilot in a G-suit, straining against it, holds for as long as they like) it builds at
  `((n − 7)/2)^1.5 / 10` per second, so 9 G held without a break blacks a clear-headed pilot out in 10 s and 8 G in
  28 s; at or below 7 G it drains at `0.25·clamp((7 − n)/6, 0.2, 1.5)` per second (1 s at 1 G sheds a quarter). From
  0.3 the view goes (§15.2). At 1 the pilot blacks out (G-LOC) for good: the World replaces their input with a slumped
  stick (pull 0.3, rolled toward the low wing to 150° of bank, no buttons, the throttle kept), which takes the jet down
  in a steepening spiral, about 15 s from 3 km and at most 28 s from 8 km. A full-stick turn from 300 m/s starts to
  take the view after about 4 s and blacks the pilot out after 11–13 s. A new jet comes with a clear-headed pilot.
- **Not modeled:** landing gear damage; missiles ignore the wind; cannon shells keep the shooter's velocity, so the
  wind does not move them relative to the target.

## 9. Aircraft roster (fictional, data-driven)

### 9.1 Data-driven configuration

Each aircraft is one `AircraftConfig` data object in `src/shared/data/aircraft/<id>.ts`, registered in `registry.ts`.

| Section | Contents |
|---|---|
| identity | id, name, team, role, description, "inspired by" note (docs only) |
| physics | mass, wing area, military/afterburner thrust, CD0, K, CLα, `α_max`, AoA limiter, G limits, max pitch/roll/yaw rates, thrust vectoring (0–1) |
| sensors | radar range and cone, stealth (0–1), IR signature multiplier, special traits (helmet sight, two-seat crew) |
| stores | cannon type and rounds, SRM count, MRM count, countermeasure salvos |
| damage | hit points, hit radius |
| visual | parametric model spec (fuselage, wing planform, tail type, intakes, nozzles, canards), livery colors |
| hud | default units |
| performance | target ranges (top speed at 11 km and sea level, instantaneous turn rate, 1 G stall speed), verified by tests |

- `validateAircraftConfig` checks ranges and consistency, and runs in the test suite for every registered aircraft.
- The parametric model builder turns `visual` into a mesh, so a new aircraft needs no new code.
- Revision 7: an aircraft can instead use an imported glTF model. `tools/prepare-models.ts` turns it into the body
  frame (nose toward −z, 1 long), simplifies it and compresses it; the client scales it to `visual.lengthM` and adds
  the afterburners at the nozzle points listed in `src/client/render/aircraft-meshes.ts`.

### 9.2 Roster

All names and numbers are fictional. The "inspired by" column is for design reference only and is never shown in game.

| Team | Name | Inspired by | Role | Strengths | Weaknesses |
|---|---|---|---|---|---|
| USA | **Shade** | F-35 | Stealth multirole | Highest stealth, longest-range sensors, faster radar locks | Lowest thrust-to-weight, low top speed, internal stores only (2 SRM + 4 MRM), 180 cannon rounds |
| USA | **Tempest** | F-22 | Stealth air superiority | High stealth, supercruise, best acceleration, pitch thrust vectoring | Lowest hit points, internal stores only (2 SRM + 4 MRM), fewest countermeasures |
| USA | **Kestrel** | F-16 | Light multirole | Best roll rate, strong acceleration, agile at high speed | Low hit points, small radar, 4 SRM + 2 MRM |
| USA | **Condor** | F-15 | Heavy air superiority | Fastest, big radar, 4 SRM + 4 MRM, 940 rounds, high hit points | No stealth, larger turning circle |
| Russia | **Prizrak** | Su-57 | Stealth fighter | Moderate stealth, 3-D thrust vectoring, widest radar cone | Internal stores only (2 SRM + 4 MRM), 150 cannon rounds |
| Russia | **Yastreb** | Su-35 | Supermaneuverable heavy | Best low-speed agility (3-D thrust vectoring), biggest payload (4 SRM + 6 MRM) | No stealth, bleeds energy in sustained turns |
| Russia | **Sapsan** | Su-30 | Two-seat multirole | Two-seat crew: fastest locks, most hit points, 4 SRM + 6 MRM | Lowest acceleration, no stealth |
| Russia | **Kobchik** | MiG-29 | Light fighter | Helmet sight: widest SRM off-boresight and fastest SRM lock; strong low-speed turn | Smallest radar, 4 SRM + 2 MRM, low hit points |

### 9.3 Initial physical parameters (tuned against performance targets in tests)

| | Shade | Tempest | Kestrel | Condor | Prizrak | Yastreb | Sapsan | Kobchik |
|---|---|---|---|---|---|---|---|---|
| Mass (kg) | 21,000 | 27,000 | 12,000 | 20,500 | 26,000 | 25,000 | 26,500 | 15,000 |
| Wing area (m²) | 43 | 78 | 28 | 56 | 78 | 62 | 62 | 38 |
| Thrust mil / AB (kN) | 120 / 195 | 225 / 315 | 76 / 130 | 128 / 212 | 185 / 300 | 170 / 285 | 150 / 250 | 100 / 165 |
| CD0 / K | .024 / .14 | .019 / .11 | .020 / .13 | .021 / .12 | .020 / .11 | .022 / .12 | .023 / .13 | .022 / .13 |
| CLα (/rad) / α_max / AoA limiter (°) | 4.0 / 26 / 28 | 4.1 / 28 / 30 | 4.2 / 25 / 26 | 3.9 / 25 / 26 | 4.1 / 28 / 38 | 4.1 / 28 / 38 | 4.0 / 26 / 28 | 4.2 / 26 / 28 |
| Thrust vectoring | 0 | 0.5 (pitch) | 0 | 0 | 1 | 1 | 0 | 0 |
| Max roll (°/s) | 130 | 155 | 180 | 135 | 160 | 140 | 120 | 160 |
| Hit points | 100 | 85 | 80 | 120 | 95 | 115 | 130 | 85 |
| Radar range (km) / cone (±°) | 60 / 60 | 50 / 60 | 35 / 60 | 55 / 60 | 50 / 75 | 55 / 60 | 60 / 60 | 30 / 60 |
| Stealth | 0.85 | 0.80 | 0.15 | 0 | 0.60 | 0.05 | 0 | 0.15 |
| SRM / MRM | 2 / 4 | 2 / 4 | 4 / 2 | 4 / 4 | 2 / 4 | 4 / 6 | 4 / 6 | 4 / 2 |
| Cannon / rounds | RC-25 / 180 | RC-20 / 480 | RC-20 / 510 | RC-20 / 940 | HC-30 / 150 | HC-30 / 150 | HC-30 / 150 | HC-30 / 150 |
| Countermeasure salvos | 24 | 24 | 40 | 60 | 30 | 60 | 60 | 40 |

Revision 10 (M3 balance pass, §9.4) changed these from the table above, in the data files only: hit points Condor 105,
Prizrak 110, Yastreb 100, Sapsan 100, Kobchik 90 (a proximity hit does about 85 damage, so hit points decided most
fights); the Shade has 32 countermeasure salvos, a 5.5 m hit radius and α_max 28° / limiter 32°; drag was tuned so the
Condor is fastest, the Tempest accelerates best and the Sapsan slowest (Condor CD0 .015 and α_max 22°, Tempest CD0 .018
and K .125, Shade CD0 .025, Yastreb K .14). The Sapsan's two-seat crew still locks fastest, but it no longer has the
most hit points.

G limits are +9 / −3 for all. Performance targets per aircraft live in the data files. Example for Kestrel: top speed
M 1.9–2.3 at 11 km and M 1.1–1.4 at sea level; instantaneous turn 20–27 °/s at 170 m/s and 1 km; 1 G stall 50–75 m/s.

### 9.4 Balance process

- A seeded bot-vs-bot tournament runs in tests (M3): every aircraft pairing, ace bots, a neutral head-on merge,
  100 seeds per pairing (revision 10: about 60% of Ace duels end undecided after 3 minutes, so 50 seeds left too few
  decided duels). `npm run tournament` runs it on all cores in about 15 s; `TOURNAMENT=1 npm test` runs it as a test.
- Each pairing's win rate (of the decided duels; a mid-air collision is a draw) must be 35–65%. If one isn't, adjust
  that aircraft's data file (never the flight code) and re-run.
- Result (revision 10): every pairing within 35–65% over seeds 1–100, and between 38% and 62% over seeds 1–200.
- Revision 16 (fuel, departures; duels fly in still air): the Sapsan's afterburner went from 250 to 243 kN, the
  Shade's departure resistance is 0.7 and its hit radius 5 m. Every pairing is within 35–65% again; Shade–Sapsan
  (36%) and Kestrel–Prizrak (35%) sit at the edge. Fuel barely changes a 3-minute duel; departures were the Shade's
  problem (5–6 spins per 100 duels at resistance 0.5, 2 at 0.7). Departure resistance per jet: Shade 0.7, Tempest 0.7,
  Kestrel 0.6, Condor 0.5, Prizrak 0.85, Yastreb 0.85, Sapsan 0.4, Kobchik 0.55 (Sentinel 0.3). Internal fuel (kg):
  Shade 7,500, Tempest 7,800, Kestrel 3,200, Condor 6,000, Prizrak 8,500, Yastreb 8,000, Sapsan 8,500, Kobchik 3,500
  (Sentinel 20,000).
- Revision 21 (G tolerance, §8): the AI pilots' G management (§14) shifts the fights, as nobody holds 9 G any more.
  Easing at strain 0.6 with a 6 G tolerance put 4 pairings outside, smoother easing 12–13; the tolerance went to 7 G
  and easing to 0.55, and every pairing is within 35–65% over seeds 1–100 again (1,021 draws). Over seeds 1001–1300
  five pairings fall outside (Kestrel and Condor against the Prizrak and Yastreb, Tempest–Yastreb), against four
  before revision 21 on the same seeds: those pairings were already weak, and stay for a later balance pass.

## 10. Weapons, targeting and countermeasures (abstracted)

Weapons are gameplay abstractions with fictional names. No real-world construction, performance data or operational
procedures are modeled.

### 10.1 Cannons

Projectiles inherit the shooter's velocity and feel gravity and drag. Each simulated projectile represents several
rounds to keep entity counts low. Hit test: the projectile's swept segment against each enemy's hit sphere (lag-
compensated in multiplayer). There is no friendly fire.

| | RC-20 (rotary, light) | RC-25 (rotary, medium) | HC-30 (single barrel, heavy) |
|---|---|---|---|
| Rounds/s (projectiles/s × rounds each) | 100 (25 × 4) | 55 (18 × 3) | 30 (15 × 2) |
| Muzzle velocity (m/s) | 1,030 | 1,000 | 880 |
| Damage per projectile | 10.4 | 14.0 | 17.4 |
| Dispersion σ (mrad) | 2.5 | 3.0 | 3.5 |
| Lifetime (s) | 3 | 3 | 3 |

**Lead marker** (a shared function used by the HUD, bots and the player's aim assist, §10.5): iterate the time of flight `t` three times,
then aim direction `= normalize(Δp + Δv·t + ½g·t²·ŷ)`.

### 10.2 Missiles

| | SRM "Dart" (infrared) | MRM "Lance" (radar, M3) |
|---|---|---|
| Needs | IR seeker lock | Radar lock on a radar contact |
| Seeker acquisition cone | 10° half-angle around the designated target, nose, or helmet-sight direction | n/a (the launcher's radar) |
| Off-boresight limit | ±60° (±75° with helmet sight) | inside the launcher's radar cone |
| Lock time | 0.8 s (×0.7 with helmet sight) | 1.5 s (×0.7 two-seat, ×0.8 sensor fusion) |
| Lock range | 9 km tail aspect, 4 km head-on, ×1.3 vs afterburner | the launcher's radar detection range for that target |
| Guidance | proportional navigation (N = 3), 20 g limit, 0.5 s response lag | launcher-supported mid-course (target must stay in radar cone), independent when within 10 km × (1 − 0.5·stealth); N = 3, 20 g limit, 0.5 s response lag |
| Motor | 150 m/s² for 5 s | 110 m/s² for 8 s |
| Max flight time | 25 s | 60 s |
| Countermeasure | flares: 35% decoy chance per salvo (×0.5 if the target is on afterburner) | chaff: 30% break chance per salvo (×1.3 vs stealthy targets) |
| Blast | 130 damage ≤ 4 m, linear to 0 at 18 m; proximity fuze 9 m | same |

- **Common rules:**
  - Minimum interval between launches: 1 s (SRM) and 2 s (MRM).
  - The fuze uses closest approach within each tick, so fast closure never tunnels.
  - Missiles lose their target on leaving the seeker limit, terrain occlusion, or a successful countermeasure roll;
    they then fly ballistic.
  - Self-destruct below 250 m/s after burnout or at max flight time.
  - Missile drag: `C·ρ·V²` plus maneuver drag `0.1·|a_lat|`.
  - **Response lag:** the turning acceleration follows the guidance command with a first-order lag. A hard break
    started shortly before impact (roughly 1–2 s, depending on aspect) makes the missile miss; flying straight,
    turning gently, or breaking at launch does not. This gives skilled pilots a way to beat a missile without flares.
- **Countermeasures:** one key press releases a salvo (one flare plus one chaff; chaff arrives with the MRM in M3), at
  most one salvo per 0.4 s. Each missile guiding on that aircraft rolls once per salvo against the matching
  countermeasure. Flares burn 3 s; chaff lasts 4 s.
- **Launch input:** one key press launches one missile, and only with a lock.

### 10.3 Targeting and sensors

- **Visual:** aircraft within 6 km (8 km on afterburner) with terrain line of sight are spotted and shown on the HUD.
- **Radar** (scans at 5 Hz):
  - Detects aircraft inside the radar cone within `radarRange × (1 − 0.7·targetStealth)`.
  - Contacts appear on the radar display. Teammates' radar contacts are shared via team datalink (shown distinctly,
    and not lockable). As built (M5): every scan, each team's radar contacts are pooled; a pilot's datalink list holds
    those it does not detect itself. They show as hollow diamonds on the radar display and the HUD and as hollow
    markers on the map. Team Objective can take a team's datalink down.
- **Designation:** the target-cycle key cycles through spotted and radar contacts ahead, sorted by angle and range.
  The designated target gets the target box and the target-info readout (type, range, closure, aspect).
  - When nothing is designated, the contact closest to the nose (within 60°) is designated automatically at each
    radar scan. This helps new players, and bots use the same rule.
  - A designation is dropped when the target dies or is no longer a contact.
- **IR seeker (SRM)** has states `SEARCH → TRACK (growl) → LOCKED (tone)`, evaluated every tick.
  - It looks toward the designated target when that is inside the off-boresight limit; otherwise along the nose, or
    along the helmet-sight direction when active.
  - Its lock is kept while the target stays inside the limit, within 1.2× range, and visible.
- **Radar lock (MRM):** builds only while the MRM is selected (keys 1 / 2) and one is left. The designated target must
  be an own-radar contact inside the cone. Lock builds over the lock time and is kept while detected; it also counts
  toward kill credit like an IR lock.
- **Lance flight (M3):** until the missile is within its active range, the launcher must stay alive with the target on
  its radar (inside the cone), or the missile loses the target and flies ballistic. Inside the active range its own
  seeker takes over (gimbal limit and terrain masking as for the Dart). The IR seeker runs only while the Dart is
  selected.
- **Clouds (M4):** a cloud between two points hides each from the other's eyes and from infrared seekers (search,
  track and lock) and breaks an infrared missile's guidance; radar and an active Lance see through. The cloud field is
  shared by the server, the simulation and the renderer.
- **Warnings:**
  - `LOCK` when an enemy radar lock is on you, or a Lance its launcher still guides (HUD "RADAR LOCK", a warble).
  - `MISSILE` (with bearing, range and time to impact) from the moment a missile guides on you. When the time to
    impact drops below 2 s the HUD tells you to turn hard.

### 10.4 Bombs (Strike mode only, M1d)

The "Anvil" is an abstract, unguided free-fall bomb for the Strike mode (§13.1).

- **Carriage:** only Russian aircraft in a Strike match carry it, 8 per aircraft. Every new aircraft (respawn) starts
  with 8. No other mode or team carries bombs.
- **Release:** one press of G releases one bomb, at most one per 0.25 s. The bomb starts at the aircraft's position
  with the aircraft's velocity.
- **Flight:** gravity plus a simple speed-squared drag, like cannon projectiles (§10.1); no guidance. It detonates on
  reaching the surface (land or water). A bomb that leaves the combat area or falls for 60 s disappears.
- **Effect:** bombs damage ground targets only, never aircraft. Damage is 40 within 30 m of a target's center,
  falling linearly to 0 at 90 m, so three good hits destroy a target (100 HP, §11). The blast is generous on
  purpose: at 250 m/s the impact point sweeps about 4 m per frame, so a release a fraction of a second late should
  still count.
- **Impact prediction:** a shared function integrates the same bomb physics from the current aircraft state until the
  path meets the terrain. The HUD and the bots use it; it must agree with the real impact within 5 m.
- **After the launcher dies:** bombs already falling keep going and still count. Impacts after the match has ended
  have no effect.

### 10.5 The player's weapons (revision 20)

The owner found hitting far too hard. In bot duels (a bot brain flying a jet that counts as the player, 30–60 seeds each,
Kestrel against Kobchik) a Veteran's Darts hit Veteran bots 0% of the time and Rookies 18%: every flare salvo of the
last three seconds rolls again, so a disciplined bot that releases six salvos decoys about nine missiles in ten. The
player's weapons (`PLAYER_MISSILES`, `PLAYER_GUN_REACH` in `src/shared/data/weapons.ts`) therefore differ from the
table above; AI pilots fire the plain ones.

| | Player's Dart and Lance |
|---|---|
| Countermeasures | decoy or break chance ×0.3 (Dart 10.5% per salvo, Lance 9%) |
| Lock time | ×0.7 (Dart 0.56 s, Lance 1.05 s) |
| Dart acquisition cone | ×1.3 (13°) |
| Guidance | N = 3.5, 25 g, 0.35 s response lag, 70° gimbal limit |
| Blast | 130 damage ≤ 6 m, linear to 0 at 20 m; proximity fuze 11 m |
| Cannon | rounds hit within three times the target's hit radius (twice at first; the owner asked for more) |
| Gun aim assist | with the nose within 10° of an enemy's lead point (the HUD pipper) and within 1.5 km, the rounds leave toward the lead point; the help fades out by 15° (`src/shared/weapons/gun-assist.ts`; 3°/6° at first). The HUD draws a ring that closes on the pipper as the assist takes hold and turns red when it holds fully |

Measured with the same duels (missile hit rates; wins out of the duels flown, 60 after):

| | Before | After |
|---|---|---|
| Rookie player vs Veteran bot | Dart 18%, Lance 7%, 5 wins of 40 | Dart 29%, Lance 38%, 38 wins |
| Rookie player vs Ace bot | Dart 0%, Lance 4%, 3 wins of 40 | Dart 11%, Lance 10%, 11 wins |
| Veteran player vs Veteran bot | Dart 0%, Lance 16%, 10 wins of 30 | Dart 31%, Lance 38%, 51 wins |
| Veteran player, guns only, vs Veteran bot | 18% of projectiles hit | 46% at twice the radius, 57% at three times |
| The same, firing whenever the enemy is within 8° and 1 km (a loose, human-like trigger) | — | 13% at three times the radius, 18% with the 3°/6° aim assist (vs Rookies 3% → 6%) |

The owner then asked for about 50 wins in 60 against Rookies. In the gun-only duels with the loose trigger (Veteran
skill, Kestrel vs Kobchik) the Rookie bot's opening missiles, 16–22 s in and before any gun range, kill the player in
about a third of the duels (61 of 180), so no aim can win more than about 40 in 60 there. The assist was widened
until the player won nearly every duel that came to guns: 19 wins in 60 at 3°/6°, 25 at 6°/10°, 33–41 at 8°/12°, and
37 in 60 (112 of 180, 7 draws, the rest lost to opening missiles) at 10°/15°. With all weapons the Rookie-skilled
player already won 46 of 60 against a Rookie (the fights end with missiles before the guns, so the aim does not
change it).

Aces stay hard: they release the most flares and break best. A first try with stronger assists (×0.2 decoy, 30 g,
0.25 s lag) made the Dart hit 57–73% and the player win nine duels in ten; the owner asked for "a little" easier.

### 10.6 Rearming at an airfield (revision 22)

The owner asked for a way to fly home and take on missiles and gun rounds again (`src/shared/world/supply.ts`).

- **Where:** the team's own airfield or a neutral one; never the enemy's. Lechovia has one of each team's and two
  neutral (Wilkowo and Sokolica, 58 km either side of the middle; Morzysko and Skalnik). Strike and Training fly on
  the Test Range, which has none.
- **Supply pass:** over the runway (its length, within 250 m of the centre line), at most 150 m above it and 130 m/s
  (about 250 kt), for 3 s: missiles (Darts, Lances, or the mode's Lance load), gun rounds and flares back to a fresh
  jet's, and the tanks full. The roll-out after a landing counts the same, below 130 m/s on the runway.
- **Stopped:** on the wheels anywhere on a friendly airfield's ground (the runway, its overruns and ±450 m either
  side, so a jet that has steered off the runway still counts) at under 5 m/s for 5 s, the jet is repaired to full hit
  points as well. On the wheels the brakes also take the engines to idle: above about half throttle they outpull the
  brakes, and in the browser a jet landed at 80% throttle rolled on at 40 m/s with the brakes on.
- Each happens once per stay in that state, and only when it would give something (a weapon or flare used, fuel
  under 90%, or for a stop damage), so a runway start or a climb-out over the home field gives nothing. Bombs belong
  to a Strike sortie and are not reloaded. The World emits `resupplied` (with `repaired` after a stop) and exposes
  the progress (`World.supplyProgress`).
- AI pilots do not fly home to rearm; the rule applies to them all the same.

## 11. Damage model

- **Hit points** per aircraft (§9.3). Cannon damage is per projectile; missile blast uses distance falloff (§10.2).
- **Damage states:**

| State | HP | Effects |
|---|---|---|
| Healthy | ≥ 60% | none |
| Damaged | 30–60% | smoke, thrust ×0.9 |
| Critical | < 30% | fire trail, thrust ×0.75, roll rate ×0.7 |
| Destroyed | ≤ 0 | explosion |

- **Credit:** the kill goes to the last enemy who damaged the aircraft. A crash within 15 s of enemy damage or an
  enemy lock credits that enemy ("maneuver kill"); otherwise the death is uncredited.
- **Other deaths:**
  - Mid-air collision (centers closer than `0.5·(r₁ + r₂)`) destroys both aircraft.
  - Leaving the combat area, or climbing above 18 km, for 15 s continuous → destroyed.
  - Blacking out under G (§8, revision 21): the jet flies on with the slumped stick until it hits the ground. The
    death is a `blackout` (`BLACKED OUT (G-LOC)`; kill feed "blacked out and crashed"), credited like a crash: within
    15 s of an enemy's damage or lock that enemy gets the kill ("forced a G-LOC").
- **Respawn:** after 5 s, per the mode's spawn rules, with full stores.
- **Ground targets (Strike, M1d):** each has 100 hit points and takes damage only from bombs (§10.4). It shows smoke
  below 50% and becomes a burning wreck at 0, when it counts as destroyed. Targets are not repaired.

## 12. Maps

### 12.1 Terrain core (all maps)

- **`GridTerrain`:** a height grid (Float32) with bilinear `heightAt(x, z)`, `surfaceAt = max(heightAt, 0)`,
  `normalAt`, and a line-of-sight test that samples every 250 m.
- **Deterministic generation** from a seed. The server, the client physics and the terrain renderer all use the same
  grid, so collisions match the visuals.
- **Features** layers generated from the same seed: water, land cover, settlements, roads, airfields.

### 12.2 Test range (M1)

- 60 × 60 km, grid 512² (~117 m cells).
- **Terrain:** rolling farmland in the center, a lake, a river valley, a hill ridge in the south rising to about
  1,200 m, and sea along the north edge.
- **Shading:** satellite photos blended by land class (farmland, forest, mountain, sand, water, snow), per
  `2026-09-29-realistic-graphics-design.md`.
- **Combat area:** a 25 km radius circle.
- **Spawns:** the two teams spawn airborne 15 km apart, facing each other.
- **Strike layout (M1d):** three target sites on open farmland west of the river, about 8 km apart along a north–south
  line, each on flat, dry ground away from the lake. The USA spawns 8 km west of that line at 4,000 m; Russia spawns
  24 km east of it at 5,000 m. Both face the targets.

### 12.3 Lechovia (M4)

200 × 200 km, grid 2049² (~98 m cells), rendered with quadtree LOD chunks built in a Web Worker.

**As built (revision 11):**
- Generated in about 3 s from a seed (`src/shared/data/maps/lechovia/`): base noise heights, then rivers, lakes, the
  lagoon and airfields are carved or flattened into the grid, and a land-cover grid is painted (sea, lake, river,
  beach, field, meadow, forest, rock, snow, marsh, urban, airfield). The page generates it in an inline Web Worker
  while the title screen is up; the server generates every map once at start.
- Rivers: the Lechna (source in the southern range, through the capital Lechów, out to sea west of the lagoon) and the
  Odrawa in the west. Their water level only falls toward the sea and stays below the banks; valleys slope down to
  them over 1.5 km. About 40 glacial lakes in the north-east lake district and a few elsewhere.
- Cities: Lechów (capital), Morzysko (port), Odrzyn, Skalnik (foothills), Pojezierz (lake district). Sixty villages
  named from Polish-like syllables, never a real major city.
- Roads: A* over a 500 m grid (climbing and bridges cost extra, lakes and the sea are impassable), smoothed; highways
  join the cities, a local road joins every village and airfield to the network.
- Airfields: Wilkowo Air Base (USA, west, runway 09), Sokolica Air Base (Russia, east, runway 27), Morzysko and Skalnik
  (neutral). 3,000 m (2,500–2,600 m neutral) by 45 m runways, flattened ground ±450 m, a parallel taxiway, an apron,
  four arched hangars and a tower.
- Combat area: 85 km radius around the centre. Airborne spawn lines 15 km either side of the capital at 5,000 m.
- Rendering: 64-cell chunks at six levels, chosen by distance (graphics preset: split at 1.1, 1.4 or 1.8 chunk
  widths), skirts against cracks, parents shown until all children are built, an outer ring that stretches the map's
  edges to the horizon. Towns get instanced houses and blocks on their urban ground (about 12,000 in all), roads are
  ribbons that bridge rivers, and the terrain shader tints towns and marshes.
- Sky: the Preetham model scaled to the scene's brightness (brighter while the sun is low), lighting the scene through
  an environment map rebuilt whenever the sun has moved 1.5°; haze takes the sky's horizon colour; stars, a full moon
  opposite the sun, moonlight and a dim night ambient; exposure rises at night. Revision 19 (the owner found dusk and
  night too dark to see): a fill light and +0.4 exposure while the sun is low (under ~20°), and at night a stronger fill
  (2.0), moon (1.1) and exposure (2.3), a lighter night sky, haze and image-based light, and moonlit blue-grey clouds;
  full daylight is unchanged.
- Weather (cloud base and top): Clear; Scattered 25% (1,600–2,700 m); Broken 60% (1,300–3,200 m); Overcast, a deck
  1,100–2,300 m; Rain, a deck 800–2,600 m with rain streaks below it. Cumulus are soft billboards placed in 1.6 km cells
  where the shared cloud field has cloud, sorted back to front, drawn within 20, 30 or 40 km (graphics preset);
  inside a cloud the haze closes to a whiteout.
- Time: 52° N at the equinox (sunrise 06:00, noon sun 38° up in the south, sunset 18:00). Start times Dawn 06:30, Day
  12:00, Dusk 17:30, Night 23:00; the clock runs one game hour per real minute unless held. The HUD shows the local
  time and dims at night.
- Night: town and street lights, runway edge (white), threshold (green) and end (red) lights, and red, green and
  white navigation lights with strobes on every jet.
- Wind (revision 16): surface / 11 km speed and gust share per preset: Clear 3 / 15 m/s, 10%; Scattered 5 / 20, 15%;
  Broken 7 / 25, 20%; Overcast 9 / 28, 20%; Rain 12 / 32, 35%. The speed holds to 1 km, then rises to the upper-air
  value at 11 km while the direction veers 30°. The direction it blows from is drawn from the match seed, anywhere
  round the compass (revision 18; revision 16 drew westerlies between 200° and 340°, which favoured one team). Gusts are three smooth waves in space and time per axis (vertical at 40%), bounded by the gust
  share. Training, tests and the balance tournament fly in still air (`EnvironmentSettings.calm`). Smoke, fire and
  contrails drift with the wind; the clouds stay put.

- **Geography inspired by Poland:**
  - **North:** a sea coast with beaches, a sand spit and a lagoon.
  - **Northeast:** a lake district of forested moraine hills and dozens of lakes.
  - **Center:** broad plains of strip fields, woods and villages. A great river runs from the southern mountains north
    to the sea, with the capital on its banks; a second river runs along the west.
  - **South:** foothills, then a mountain range along the southern edge, with peaks to about 2,400 m and valleys.
  - **East:** large forests and marshes.
- **Places:** all fictional.
  - About 5 cities with curated fictional names, and about 60 villages with names generated from Polish-like
    syllables (checked against a list of real major cities).
  - Roads: highways between cities and local roads to villages, routed over terrain cost.
  - **Military airfields** (fictional, with runways, taxiways, hangars and a tower): one per team at the west and east
    edges, and two neutral ones.
- **Rendering:**
  - Terrain shading: strip fields, forests, urban tint, rock and snow on high slopes.
  - Water: the sea plane; rivers and lakes via water-flagged terrain vertices.
  - Settlements: instanced buildings per settlement.
  - Roads: ribbons.
- **Weather presets:** clear, scattered, broken, overcast (+ light rain). They drive cloud-layer coverage and altitude,
  fog density and light. Clouds block visual detection and IR locks.
- **Day/night:**
  - Time of day is a room setting and advances at a configurable rate (default 1 game hour per real minute; can be
    frozen).
  - The sky, sun and moon, stars and ambient light follow it.
  - At night: city lights, runway lights, aircraft navigation lights and a dimmer HUD.

## 13. Game modes

All modes implement `GameMode`: setup, per-tick update, scoring on events, spawn rules, win conditions, and HUD status.

| Mode | Rules | Milestone |
|---|---|---|
| **Free Flight** | No scoring or enemies (optional passive AI targets); spawn anywhere; time-of-day and weather controls | M1 |
| **Team Deathmatch** | +1 per enemy kill; each death of a team's aircraft gives the other team +1; first to 15 or most after 10 min | M1 (vs AI), M2 (online) |
| **Air Superiority** | Three capture zones (cylinders, 4 km radius, 1–7 km altitude) along the front. A zone's capture progress moves toward the team with more aircraft inside (rate ∝ numeric advantage, 10 s to capture with +1). Each owned zone gives +1 point every 2 s. First to 300 or most after 12 min. Details in §13.3 | M5 |
| **Team Objective** | Each team protects two AI-flown high-value "Sentinel" radar aircraft (slow, 400 HP; the USA's sturdier, §13.4) orbiting behind its lines. Destroying one gives +20 and cuts the enemy team's datalink for 60 s; kills give +1; destroyed Sentinels return after 120 s. First to 60 or most after 15 min. Details in §13.4 | M5 |
| **Strike** | Russia must destroy two of three ground targets; the USA must hold them for 9 min. 4 aircraft per team. Details in §13.1 | M1d (vs AI) |
| **Training** | A guided first flight in four lessons; no score, cannot be lost. Details in §13.2 | M1c |

**Spawning:** airborne at the team's spawn line (5,000 m, 250 m/s, facing the front) or, from M4, at the team's airfield
on the runway, as the player chooses. Strike uses its own spawn points (§12.2).
- Runway starts (M4) are offered in Team Deathmatch and Free Flight on maps with a team airfield: two lanes 12 m
  either side of the centre line, rows 300 m apart from 150 m past the threshold, at full military power. Bots and
  Strike always start in the air.

### 13.1 Strike (M1d)

An asymmetric mode: Russia attacks, the USA defends. In M1d it is a 1v1 against one AI pilot, like Team Deathmatch,
and the player's jet decides the side: the Kestrel defends for the USA, the Kobchik attacks for Russia.

- **Targets:** three fictional facilities, "A" (supply depot), "B" (radar site) and "C" (fuel depot), placed per §12.2.
  Each has 100 HP and is damaged only by bombs (§10.4).
- **Aircraft:** each team has 4 aircraft. Any loss uses one: shot down, crashed, mid-air collision, or leaving the
  combat area. After a loss the next aircraft spawns 5 s later with full stores; a team with none left does not
  respawn. (Online, from M2, each team gets 4 aircraft per player.)
- **Time limit:** 9 minutes (8 before revision 10: with Lances on both sides the Veteran attacker's win rate fell to
  29%; 9 minutes brings it back to 49% over 80 seeds).
- **Russia wins** when two targets are destroyed, or when the USA loses its 4th aircraft.
- **The USA wins** when the time runs out, or when Russia loses its 4th aircraft.
- **No draws.** The checks run each tick in this order, and the first that applies decides the match:
  1. Two targets destroyed → Russia wins. A target destroyed in the final tick still counts.
  2. A team has lost its 4th aircraft → the other team wins. If both lose their last aircraft in the same tick, the
     USA wins: the attack failed.
  3. Time is up → the USA wins.
- **Ordnance:** bombs released before the attacker died still count; impacts after the match ends do not.
- **Mode status** (for the HUD and the end screen): time left, each target's HP, aircraft left per team, the winner,
  and the reason (targets destroyed, targets held, or a team out of aircraft).

### 13.2 Training (M1c)

- **Lessons:**
  1. **Fly:** three rings (250 m pass radius) 3.5, 7 and 10.5 km ahead of the jet in a gentle climbing S-turn.
  2. **Gun:** a drone 1.5 km ahead flying a 6 km orbit at 170 m/s; destroy it.
  3. **Missile:** a drone 4 km ahead (7 km orbit, 180 m/s); destroy it.
  4. **Defend:** a drone 3 km behind fires one short-range missile 1.5 s into the lesson; the lesson passes once the
     missile is gone and the player has stayed alive for 1 s more.
- **Drones** are enemy-team aircraft flown by a drone pilot: a level right-hand orbit, constant speed (idle and
  airbrake when fast), no weapons, no evasion.
- **Restarts:** being shot down restarts the current lesson after the 3 s respawn; a drone more than 15 km from the
  player also restarts it. Each lesson refills the player's hit points and stores.
- **End:** after the fourth lesson the player's team is the winner; the end screen offers a dogfight next.
- **HUD:** a lesson panel under the heading tape names the player's own keys (or pad buttons); the next ring is a
  glowing hoop with a HUD marker or edge arrow.

### 13.3 Air Superiority (M5, as built)

- **Zones:** A, B and C on the front, the perpendicular bisector of the two spawn points: B midway between the spawns,
  A and C 0.4 × the combat radius (at most 20 km) either side. On Lechovia: 20 km north and south of the capital.
- **Capture:** progress −1 (Russia) … +1 (USA) moves at (aircraft of the USA inside − Russia's inside) / 10 s. A side
  owns a zone when progress reaches its end, and loses it when the other side pushes progress back past 0 (taking an
  enemy zone with +1 takes 20 s). A tie or an empty zone holds. Sentinels and dead aircraft do not count.
- **Scoring:** every 2 s from the first tick, +1 per owned zone. Kills score nothing. First to 300, or the higher score
  after 12 minutes (equal: a draw).
- **Events:** `zone` (captured or neutralized) for banners, the kill feed and sound.
- **HUD:** a zone strip under the score (boxes filled by owner, a bar of progress toward your side); hexagonal markers
  with the zone letter, range and a progress arc, edge arrows for zones you do not own; inside a zone, CAPTURING /
  NEUTRALIZING n%, HOLDING, CONTESTED or OUTNUMBERED.

### 13.4 Team Objective (M5, as built)

- **Sentinels:** two per team, 0.6 × the combat radius behind the front on the team's side and a quarter radius either
  side of its axis, orbiting (radius 0.15 × the combat radius, at most 8 km) at 7,000 m and 150 m/s. A fictional
  four-engine radar aircraft: 60 t, 400 HP, a 16 m hit radius, a 150 km all-round radar, 60 countermeasure salvos, no
  weapons; never offered to pilots or bots and outside the balance tournament. Each starts (and returns) on the point
  of its orbit farthest from the middle of the combat area (revision 19; before, both teams' started west of the orbit
  centre, one team's 16 km nearer the front).
- **Sentinel pilot:** flies its orbit; turns away from the nearest enemy fighter within 18 km at full power and its
  orbit height, in a turn of at most 40° of bank that holds its height (revision 19: the fighter-style roll-and-pull
  spiralled it into the ground, half of all Sentinel losses); keeps inside 0.7 × the combat radius, leaning inward
  beyond it; releases countermeasures when a missile is under 3 s away.
- **Balance (revision 19):** Russia won about 75% of 3 v 3 bot matches. Identical jets on both sides gave an even
  mode, so the rosters made the difference: the Russian jets' Lance loads (4.5 a jet against 3.5), and their toughness,
  flares and 30 mm guns, which shoot Sentinels down faster the more fighters hunt. So every fighter in Team Objective
  carries 4 Lances (a mode rule, like Strike's bombs), and the USA's Sentinels have 400 + 50 HP per Russian fighter
  (450 in 1 v 1, 550 in 3 v 3, 600 in 4 v 4; the game passes the fighters per side to the mode). Bot play, Veterans
  with random jets: the USA won 11–14 (1 v 1, 15 draws), 16–24 (2 v 2), 35–42 (3 v 3, 80 matches) and 19–21 (4 v 4).
- **Scoring:** a Sentinel shot down gives the other team +20 and takes its own team's datalink down for 60 s; it
  returns at its orbit after 120 s. Every death of a fighter gives the other team +1. First to 60, or the higher
  score after 15 minutes.
- **HUD:** SENTINELS n : n and the datalink state under the score; ringed Sentinel markers with an HP bar (yours
  always, the enemy's while known), banners and sounds when one goes down.

### 13.5 Free Flight extras (M5, as built)

- **Sky:** the pause menu sets the time of day (Dawn, Day, Dusk, Night), the clock and the weather; the World winds its
  start hour back so the chosen hour holds now, rebuilds its clouds, and the client rebuilds its sky. Online, the
  change applies to the whole room.
- **Fly from here:** on the map screen a click flies the jet from that point (at least 2,000 m and 1,500 m above the
  ground, heading for the middle), or from the runway when the click is within 2.5 km of an airfield.
- **The whole map (revision 22):** Free Flight has no combat area: only leaving the map's square (or climbing above
  18 km) starts the boundary countdown, a click flies you from where you clicked (kept 2 km inside the edge), and the
  map screen draws no dashed circle. It used to pull a click into 0.9 × the combat area, so a click near the map's
  edge flew you from tens of kilometres away.
- **Target drones (offline):** four unarmed enemy jets on orbits 6 km round the player; a drone shot down is cleared
  after 2 s and replaced after 10 s; they follow the player to a new spawn. Weapons work only while they fly.

### 13.6 Campaign (revision 18)

Nine missions over Lechovia (`src/client/campaign/missions.ts`), flown in order for either side; each is an ordinary
match of one of the four scoring modes with the world, sides, skills and score limit fixed by the mission. The clock
stands still. Mission 1 is always open; clearing (winning) a mission opens the next. A draw does not clear.

| # | Mission | Mode | World | Sides (player's side first) | Skills (opponents / wingmen) | Win |
|---|---|---|---|---|---|---|
| 1 | First Sortie | Dogfight | Day, clear | 1 v 1 | Rookie | first to 3 |
| 2 | Two-Ship | Dogfight | Day, scattered | 2 v 2 | Rookie / Veteran | first to 5 |
| 3 | The Lake District | Air Superiority | Dawn, broken | 2 v 2 | Veteran / Veteran | first to 120 |
| 4 | Outnumbered | Dogfight | Dusk, scattered | 2 v 3 | Rookie / Veteran | first to 6 |
| 5 | Strike Package | Strike (Test Range) | Day, clear | USA 2 v 1, Russia 1 v 1 | USA: Ace bomber; Russia: Veteran / Veteran | Strike rules |
| 6 | Night Hunters | Dogfight | Night, clear | 3 v 3 | Veteran / Ace | first to 5 |
| 7 | Eyes in the Sky | Team Objective | Day, overcast | 3 v 3 | USA: Veteran, Russia: Ace / Ace | first to 40 |
| 8 | Storm Front | Air Superiority, runway start | Day, rain | 4 v 4 | Ace / Ace | first to 200 |
| 9 | Last Light | Team Objective | Dusk, scattered | 4 v 4 | Ace / Ace | first to 60 |

- **Sides:** a mission may give one side other numbers where the mode favours the other. Strike favours the bomber
  as soon as it has a wingman (in bot play two Veteran defenders held 0 of 10 matches against two bombers), so the
  Russian player bombs alone against one fighter and the American player with a wingman meets one Ace bomber; in
  Strike each team has 4 aircraft per pilot of the larger side. In mission 7 the suggested jets lead (Tempest for
  the USA, Prizrak for Russia): the Russian player meets Aces for the same fight (revision 19; before Team Objective
  was evened out, the American player met Rookies).
- **Tuning:** each mission was flown by bots with a Veteran in the player's seat, 10–12 seeds per side; every mission
  is won by that stand-in 40–100% of the time on both sides, harder towards the end.
- **Jets:** the briefing suggests a jet per side; the player may pick any of their side's four. After a win the next
  mission flies with its own suggested jet, unless the player chose another one for the mission just won, which they
  then keep.
- **Progress** (`localStorage`, key `contested-skies:campaign`, read through a sanitizer): per side, per mission:
  cleared, attempts, most kills in a cleared run, fewest deaths in a cleared run; and the side last flown for.

## 14. AI

- **`BotPilot`** (shared, pure) maps a perception to a `ControlInput`, the same interface humans use, so bots obey the
  same physics.
  - Perception is world truth, delayed by the difficulty's reaction time and filtered by the bot's own sensors. A bot
    sees where a target was one reaction time ago, extrapolated along the velocity it had then, so it reacts late to
    new maneuvers but not to straight flight.
- **Steering primitive:** `steerToward(state, desiredDirection)`. It banks until the target direction lies in the lift
  plane, pulls, and uses rudder and wing-leveling for fine alignment. The same function drives the human mouse-aim mode.
- **Behavior priority** (highest first):
  1. **Ground avoidance:** if the flight path predicted 5 s ahead gets closer than 150 m to the surface, pull up.
  2. **Boundary:** turn back inside the area.
  3. **Defend:** a missile is guiding on the bot → release countermeasures once it is within 3 s of impact; beam it
     and pull as hard as the profile allows once it is within (2 s − reaction delay) of impact. The bot judges each
     missile's time to impact with a per-missile error (spread in the table below), so weaker pilots mistime the
     break and get hit more.
  4. **Engage:**
     - Choose a target. Fire MRM within 60% of the lock range, SRM within 0.5–7 km, at most one missile per target
       per 5 s.
     - Lead pursuit with the cannon inside gun range, firing when the aim error is under the threshold.
  5. **Patrol:** fly toward the nearest enemy or the area center.
  6. **Energy:** afterburner in combat; ease the pull below corner speed.
  7. **G management (revision 21):** whatever the behavior, past a G strain of 0.55 the bot pulls at most half stick
     (about 5 G), and when it is breaking from a missile or pulling away from the ground, only past 0.9. AI pilots
     never black out in testing (three 2-minute Ace duels in `blackout.test.ts`; 60 3-minute 1 v 1 matches across the
     skills). Rookies barely feel the G (their 70% pull is about 6.6 G, under the tolerance); Veterans fly with some
     of the view gone 6% of the time, Aces 40%.
- **Difficulty profiles:**

| | Rookie | Veteran | Ace |
|---|---|---|---|
| Reaction delay | 0.8 s | 0.4 s | 0.15 s |
| Aim noise | 3° | 1.5° | 0.5° |
| Max pull used | 70% | 85% | 100% |
| Countermeasure discipline | 0.4 | 0.8 | 1.0 |
| Time-to-impact judgement spread | 45% | 20% | 7% |
| Gun range | 500 m | 700 m | 900 m |
| Fire threshold | 2.5° | 1.5° | 0.8° |
| Bomb impact error, RMS miss distance (Strike) | 35 m | 18 m | 6 m |

- **Mode-specific AI:** Sentinel aircraft (Team Objective) fly orbits and flee threats; bots contest zones in Air
  Superiority. As built (M5): a mode gives each bot a goal. In Air Superiority it is a zone its side does not own (or
  one the enemy is in), spread over the candidates by bot id, circled at 4,000 m inside the zone; in Team Objective
  two bots in three hunt the nearest enemy Sentinel and every third fighter of a team escorts its own (counted among
  the team's fighters since revision 19: counting aircraft ids gave the sides different numbers of escorts, and a lone
  1 v 1 fighter escorted). A bot closing on a Sentinel breaks off inside 200 m (revision 19; slow, 30 m wide, it was
  rammed about 1.5 times a match). With a goal, a bot fights enemy fighters
  only within 12 km of itself and near the goal (within its radius + 4 km) or on its tail within 2.5 km; an enemy
  Sentinel within 25 km comes first, and the bot steps its designation onto it. Otherwise it flies to the goal and
  circles there. Over 4v4 bot matches on Lechovia both modes run to a close finish.
- **Strike attacker (Russia, M1d):** priorities 1–3 above stay first. Then:
  4. **Self-defense:** fight the defender (as in Engage) when it is within 600 m and within 60° of the bot's tail.
     Farther out the bot presses the run: bot-vs-bot turning fights rarely end in a kill, so fighting from 3 km (the
     first design) let the defender run out the clock in all 20 balance matches.
  5. **Bombing run:**
     - Pick the standing target that needs the fewest further hits, nearest first.
     - Approach about 1,500 m above the ground at full military power, steering so the predicted impact point
       (§10.4) runs across the target.
     - Release a two-bomb stick that straddles the target: the first bomb when the predicted impact point, offset by
       an error drawn from the profile's bomb impact error, enters the target's 30 m full-damage radius, and the
       second 0.25 s later.
     - On the final 1.5 km of the run it re-predicts the impact every tick, flies level and holds its track.
     - Then fly on until about 5 km beyond the release distance and turn back for another pass, unless the next
       target is already ahead.
  6. **Out of bombs:** fight the defender as in Team Deathmatch.
- **Strike defender (USA, M1d):** priorities 1–3 above stay first. Then:
  4. Engage the attacker nearest to any standing target, if it is within 15 km of one; break off once the fight
     drifts farther than that from every target.
  5. Otherwise patrol: orbit the center of the standing targets at 4,000 m with a 5 km radius.

## 15. Client

### 15.1 Camera

The game is always third-person (revision 4). There is no first-person, cockpit or free camera.

- **Chase camera:** behind and above the jet (30 m back, 7 m up, 70° field of view) with a smoothed follow. In
  mouse-aim mode it follows the aim direction and keeps the horizon level; in keyboard mode it rolls with the jet.
  After a respawn it starts behind the new position instead of sweeping across the map.
- **Clear of the ground (revision 23, `clearanceLift`):** the chase and kill cameras stay 3 m above the ground, and
  the line to the jet (or the kill cam's subject) 2 m above it at eight samples; when the ground is in the way the
  camera rises at once (at most 300 m) and settles back over 0.4 s once clear. Before, flying low over hills the
  camera could sit in a slope behind the jet or behind a ridge it had just cleared, and the scenery covered the jet.
- **Look around:** holding C or the right mouse button swings the camera around the jet; releasing it swings back.
  The look direction also aims the helmet sight.
- **Shake:** trauma-based noise from G > 6, the transonic buffet band, afterburner, cannon fire, hits and nearby
  explosions. It decays over time, and a "reduce motion" setting scales it.
- **While waiting to respawn (M5):** a kill cam for 2.5 s: from behind the wreck, looking at the killer with a field of
  view that frames it (or at the wreck after a crash); it eases onto its shot, or cuts with reduce motion. Then
  spectating: the chase camera follows a pilot still flying (the killer first, then your team, the enemy, the
  Sentinels), level with the horizon along its flight path; A / D (or the stick) switch.

### 15.2 HUD (Canvas 2D, clean green; amber/white option)

- **Flight:** airspeed, altitude, heading tape, throttle and afterburner, G (current and max), Mach, AoA,
  flight-path marker.
- **Aircraft status:** HP and damage state, airbrake, stall warning, pull-up warning.
- **Weapons:** selected weapon, remaining cannon rounds, SRM, MRM and countermeasures. Gun boresight cross and lead
  marker on the designated target within 2 km.
- **Targeting:**
  - Target box and target info (type, range, closure, aspect); lock status (SRCH / TRK / LOCK).
  - Contact markers (friendly blue, enemy red) and an off-screen arrow for every enemy contact.
- **Warnings:** `LOCK` and `MISSILE` with a bearing arrow. Each missile guiding on you gets a red marker with its range
  (an edge arrow when off-screen); your own missiles get a small white marker. `TURN HARD NOW` flashes under 2 s to
  impact.
- **Radar display:** a top-down scope, heading-up, with range scales 10 / 20 / 40 / 80 km. It shows own-radar contacts,
  datalink contacts and missiles in flight.
- **Game:** mode status (scores, zones, time), kill feed, hit markers, scoreboard (Tab), map (M), respawn countdown.
- **Strike (M1d):**
  - **Status:** time left, targets standing, and aircraft left per team.
  - **Targets (both sides):** each target has a ground marker with its letter and an HP bar, and an edge arrow when
    off-screen. Destroyed targets are crossed out.
  - **Attacker:** bombs left (`BMB 8`) in the weapons status. On a bombing run (the predicted impact within 2.5 km
    of a standing target) the impact point is drawn on the ground, joined to the flight-path marker by a fall line.
    `RELEASE` flashes while it lies within a target's 30 m radius. (Before revision 20 the cue showed whenever bombs
    were aboard: from altitude its fall line hung from the gun sight to the bottom of the screen all the way in, and
    the owner took it for a broken aiming line.)
  - **Defender:** banners `TARGET B UNDER ATTACK` (when a target is hit, at most once per 3 s per target) and
    `TARGET B DESTROYED`; the kill feed also records destroyed targets.
- **The way home and the landing (revision 22, `hud/supply-hud.ts`):** with no missiles or no gun rounds left, fuel
  under BINGO or hit points under 30%, a diamond marks the nearest friendly airfield with the reason and the range
  (`RTB · REARM · WILKOWO AIR BASE 43 KM`), or an amber edge arrow when it is off screen; with both missiles and rounds
  gone a `WEAPONS EMPTY · RTB TO REARM` banner shows once. Within 12 km of a friendly runway and 1,500 m above it the
  HUD outlines the runway and reads out the supply pass, `SUPPLY PASS  SPD 280/250 KT  ALT 820/450 FT` (green once
  met), and then `GEAR DOWN  SINK 640 FT/MIN` (sink amber past 70% of the touchdown limit, red past it). Taking on
  supplies shows `REARMING 60%` or `REPAIRING 60%` with a bar, then a `REARMED · REFUELLED` or `REARMED · REPAIRED`
  banner and a chime. The gear motor sounds as the gear comes down too. From a touchdown until the jet stops or flies
  again, the hint line reads `LANDED · B brakes · stop to repair, then full power to take off`. The map screen gives the distance
  to every airfield you can use (`✈ Wilkowo Air Base · 43 km`).
- **G effects:** red tint below −2.5 G (a third as strong with reduce motion, M5). Revision 21 (`hud/g-vision.ts`), from
  the pilot's G strain (§8): past 0.3 the view turns red (full by halfway to G-LOC), darkness closes in from the
  edges until the middle goes too, and the last quarter goes black; the G readout turns amber, then red past halfway.
  The effect covers the scene and the HUD, but not the messages, banners or the hint line. Blacked out (G-LOC), the
  HUD is gone, the screen holds black for 2 s with `G-LOC` and `BLACKED OUT · NO CONTROL`, then over 1.5 s the
  falling jet shows through, 60% dark and red. Reduce motion keeps the effect to 60% before the blackout (the
  blackout itself stays black). Cockpit warnings (PULL UP, stall) keep sounding. Replaces M1's blackout vignette
  (more than 7 G held for 2 s), which did nothing to the jet.
- **M5:** the zone strip and markers (§13.3), Sentinel markers and the datalink state (§13.4), hollow datalink
  contacts; the respawn screen names the killer (jet and hit points left), who you watch, and the next jet.
- **Revision 16:** `GS` (ground speed) under the AoA; `WIND 262° 37 KT` (bearing it blows from, speed in the jet's
  units) under the vertical speed; `FUEL 72%` above the throttle, amber under 20% (BINGO) and red at 0. Crossing
  BINGO shows a `BINGO FUEL` banner with two low chimes; a flameout sounds three falling chimes and keeps `FLAMEOUT`
  on screen. A spin replaces STALL with a red `SPIN` and a steady recovery line: `AUTO RECOVERY` in mouse aim
  (the mapper pushes the stick forward, holds opposite rudder and parks the aim on the horizon ahead), otherwise the
  pilot's own keys (`W NOSE DOWN · Q RUDDER · LET GO OF THE ROLL`, or stick forward and a bumper on a gamepad). AI
  pilots recover the same way and stay off the afterburner below 25% fuel. The bomb sight allows for the wind.

### 15.3 Controls

- **Mouse-aim (default):** the mouse sets an aim direction and `steerToward` flies the jet there; the keyboard adds on top.
  At 100% sensitivity the aim turns 0.0011 rad (0.063°) per pixel (revision 15); free look (C or right mouse) turns
  the head twice as far per pixel.
- **Keyboard direct:** W/S pitch (W = nose down), A/D roll, Q/E yaw, with input ramping over 0.15 s. Arrow keys also
  pitch and roll.
- **Gamepad and flight stick (M1c):** the browser Gamepad API.
  - Standard layout: left stick pitch/roll (push = nose down), right stick look, LB/RB rudder, LT/RT throttle
    down/up, X cannon (hold), A missile, B flares and chaff, Y next target, D-pad down bomb, D-pad up airbrake (hold),
    D-pad left / right select SRM / MRM (M3), Start pause, Back scores (hold).
  - Other devices (flight sticks): assignable roll, pitch, rudder and throttle axes with invert flags and assignable
    buttons; calibration records each axis's travel and rest position (levers use mid-travel); 0.08 dead zone.
  - Stick input overrides the mouse aim like the keyboard; in mouse-aim mode the aim follows the nose while the pad
    stick is deflected, so letting go holds the heading.
- No `Ctrl` bindings: browsers reserve shortcuts such as `Ctrl+W`, which would close the tab mid-flight.

| Key | Action |
|---|---|
| Mouse | Aim (mouse-aim mode; click the view to capture the mouse) |
| W/S · A/D · Q/E | Pitch · roll · rudder (overrides the mouse aim while held) |
| Shift / Z, mouse wheel | Throttle up / down (top 10% = afterburner) |
| Space or left mouse | Cannon |
| F | Fire missile (one per press, needs a lock) |
| G | Drop a bomb (one per press; Strike, Russian side, M1d) |
| 1 / 2 | Select SRM / MRM (MRM from M3) |
| R | Cycle target |
| X | Countermeasures |
| B | Airbrake (hold) |
| C or right mouse | Look around (hold); also aims the helmet sight |
| Tab | Scoreboard (hold) |
| M | Map (M4): the whole map with towns, roads and airfields, the combat area, you, teammates and known enemies |
| P / Esc | Pause |

### 15.4 Graphics

- **M1 prototype:**
  - Procedural parametric aircraft models; from revision 7 two jets use the owner's imported models (about
    25,000–32,000 triangles, 1024 px textures, about 0.4 MB each): since revision 10 the F-35A model flies as the
    Shade and the Su-57 model as the Prizrak.
  - The upgraded generator (M3): a body lofted through superellipse sections (round, or chined on the stealthy jets)
    with an ogive nose, cockpit, spine and engine bulges; chin, side or caret intakes; separate nacelles for widely
    spaced twins; thin-airfoil wings, tails, canards and LERX; a tinted glass canopy (longer on the two-seater) with
    frames; a painted texture per jet (USA soft two-tone greys, Russia blue-grey splinter camouflage, panel lines,
    radome, anti-glare panel, wing roundels and a fin flash in the team colour) that reflects the sky. Models are
    built once per type and cloned.
  - A photographed sky that also lights the scene, satellite-photo terrain, an animated sea and distance haze
    (`2026-09-29-realistic-graphics-design.md`).
  - Simple effects: afterburner, tracers, missile trails, flares, explosions, smoke.
  - Afterburner (revision 19; the owner found the single orange cone far too plain): each nozzle's flame is traced
    through a volume in a shader (`src/client/render/effects/afterburner.ts`). A white-hot core comes out of the nozzle
    and turns yellow down the middle, with shock diamonds about a nozzle diameter apart; an orange mantle cools to red,
    streams with turbulence and breaks into ragged tongues at the tail. The plume runs from 2.5 nozzle diameters when
    the afterburner lights (throttle above 90%) to 7.5 at full and flickers; barely lit it burns thin and pale blue. The
    flame lets its own light through but dims the sky behind it a little, so it keeps its colour by day; it fades into
    the haze with distance. The title-screen jet cruises at half afterburner.
  - Visibility (revision 5): an aircraft farther away than where it would shrink below about 0.7° is drawn larger in
    proportion to distance (up to 8×), and a missile likewise below about 0.4°, so neither fades to a single pixel. A
    missile shows a bright motor flame while its motor burns and leaves a thick smoke trail. Hit detection is unaffected.
  - Strike (M1d): each target is a small group of simple fictional structures (sheds, a dish, tanks) built from boxes
    and cylinders on a concrete pad. Damaged targets smoke; destroyed ones burn. Bomb impacts reuse the explosion
    effect with a dust burst.
- **M4/M5 target (a modern military-sim look):**
  - Lighting: PBR aircraft materials; shadows near the camera; bloom for afterburners and explosions.
  - Atmosphere: haze and height fog with aerial perspective; cloud layers.
  - Effects: contrails above 8 km, wingtip vapor above 5 G, refined explosions and missile smoke.
  - Night lighting.
- **M5, as built:** one ribbon-trail system (camera-facing quads, one draw call per kind) for contrails from every
  engine above 8 km (fading in from 7.6 km, 40 s life, spreading to 28 m) and wingtip vapour above 5 G (from 4.5 G,
  0.8 s); online jets' load factor is estimated from how their velocity turns. Critically damaged jets burn at the
  engines and a wing root with thick black smoke. A jet shot down, collided or lost in the air falls as a tumbling,
  burning copy of its model and bursts where it meets the ground. The Sentinel has its own model with a turning radar
  dish.
- **Budget:** < 400 draw calls and < 2 M triangles per frame.

### 15.5 UI and audio

- **Opening (revision 24, `intro-screen.ts`, script in `intro-script.ts`):** the page opens on about five seconds of
  gun-camera footage, drawn on a 2D canvas, so it needs nothing that is still loading.
  - Letterbox bars carry the camera's caption and timecode on top, and below them the loading count, a segmented
    progress bar and "click or press any key to skip". A boot check list types out, and the HUD comes up: pitch
    ladder, heading tape, speed and altitude.
  - The sequence, over a dawn horizon: a bandit (a flat-shaded twin-tailed fighter, burners lit, vapour off its wing
    tips) overtakes from over the camera's shoulder and settles ahead. The seeker hunts and locks (1.6–2.25 s), FOX 2
    (2.5 s), and the missile hits (3.0 s): a flash, a fireball, a shock ring, sparks and burning pieces, SPLASH ONE.
    At 3.4 s the title (LECHOVIA over SKIES, as on the title screen) slams in with colour fringes that close up;
    then the red streamer, a light sweep and the tag line. Grain, scan lines and a vignette throughout.
  - At 5 s it cuts to the title screen with a white flash and a fade, as soon as everything has loaded; it waits
    for loading no longer than 9 s, after which the title screen's own load bar carries on. It counts real time,
    so a slow machine still sees five seconds; a hidden tab pauses it.
  - The title screen is built underneath from the start, so the cut lands on it ready. A click, a tap or any key
    skips (0.4 s fade). Keys it takes never reach the title screen: a held Enter or Space does not press FLY.
  - With reduced motion: no jets, blast, shake or flashes; the sky, the HUD and the title fade in.
- **Start screen (revision 4):** a minimal title screen over a live 3D scene. The selected jet circles over the
  landscape while the camera orbits it slowly; the scene holds still when the system asks for reduced motion.
  - On screen: the title, the aircraft choice, the opponent's skill, a large FLY button, links to Free Flight and to
    Controls (control scheme and key list), the callsign in a corner, and one line of image credits.
  - The scenery photos load while the start screen is up and the game reuses them, so a match starts without a
    loading wait. Until they are ready the title shows over a dark background.
  - Typography: the display font Rajdhani (SIL Open Font License 1.1) is bundled with the page, Latin subset only;
    small text uses the system font.
- **Mission choice (M1d):** the title screen offers DOGFIGHT (Team Deathmatch) or STRIKE. With STRIKE selected, one
  line states the selected jet's role: "Kestrel · USA: hold all three targets for 9 minutes" or "Kobchik · Russia:
  destroy two of the three targets". Free Flight stays a link.
- **World row (M4):** map (Lechovia or the Test Range), Air or Runway start, time of day (Dawn, Day, Dusk, Night), a
  "Clock runs" switch and the weather. The scene behind the menu shows the chosen time and weather. Revision 19: at the
  owner's request the weather and "Clock runs" are gone from the title screen; its matches fly in scattered cloud with
  the clock still (Free Flight's pause menu and campaign missions still set both). Strike and Training
  fix the Test Range and an air start. Online, the pilot who opens a room fixes its map, time, clock and weather.
- **Later menus (M5, as built):** Mission offers Dogfight, Air Superiority, Team Objective and Strike, with a line on
  the chosen mission's rules; "Pilots per side" (1, 2, 4) sits beside the opponent skill. The ONLINE sheet chooses the
  mode of a new room (Free Flight included).
- **Other screens:** loading, pause/settings, death/respawn (killer, weapon, countdown, aircraft change), match end.
  - M5: the match end adds a damage column, a line on the zones or Sentinels, and "Your flight" (kills, deaths,
    missiles fired and hit, gun hits, damage, top speed, max G, time in the air), all from the events every client
    receives. In Free Flight the pause menu holds the sky and drone controls.
  - In Strike the match-end screen leads with the reason (`TARGETS HELD`, `TARGETS DESTROYED`, `RUSSIA OUT OF
    AIRCRAFT` or `USA OUT OF AIRCRAFT`) and lists the targets destroyed above the per-pilot table.
- **Career records (revision 17):** every finished match except Training (Free Flight never finishes) is added to
  this browser's records (`localStorage`, key `contested-skies:career`, read through a sanitizer so damaged or older
  data loads as zeros): matches won, lost and drawn; kills, deaths, Sentinels, missiles fired and hit, gun hits,
  damage, time in the air and distance; matches and wins per mission; matches, kills and deaths per jet (by the jet
  flown at the time); the last 10 matches (day, mission, pilots per side, skill, jet, result, kills, deaths); and
  personal bests: most kills in a match, longest kill streak, most damage in a match, longest life and top speed
  (values under 1 never count). The end screen says "First match on record" the first time and lists every best a
  match beats ("New best · Most kills in a match: 7"). The title screen's **Records** link opens a sheet with all of
  it, and **Erase records** (two clicks) starts over. Quitting a match from the pause menu records nothing.
- **Campaign (revision 18):** **Campaign** beside FLY opens a sheet with the side (each with "n of 9 cleared"), the
  nine missions (Cleared, Next, Open or Locked; locked ones cannot be chosen) and the chosen mission's briefing: its
  facts (mode; map, time, weather and a runway start; sides, wingmen's and opponents' skill; how it is won), the text,
  the pilot's progress on it, and the side's four jets with the suggested one marked. A first campaign starts on the
  side of the jet chosen on the title screen, later ones on the side last flown. The mission's title shows as a
  banner for 4 s at the start. The end screen names the mission above the title and says **Mission complete**,
  **Mission failed** or, after the last, **Campaign complete**; a first clear adds "Cleared on the first attempt · 3
  of 9" (or "after n attempts"). After a win it shows the next mission's briefing, and the main button is **Next
  mission** (straight into it); otherwise **Retry mission**, and **Fly it again** after the last. Campaign matches
  count in the career records like any other.
- **Settings** persist in `localStorage` (try/catch, defaults if unavailable). The settings screen (M1c), from the
  title screen and the pause menu, has five tabs: Controls (steering, mouse sensitivity 25–300%, invert), Keys
  (rebinding), Gamepad (status, assignments, calibration), Display (graphics, HUD color green/amber/white, HUD size
  80–140%, reduce camera shake) and Sound (on/off, master volume).
- **Music (revision 19):** the owner's choice, "Life in the Danger Zone" by DJARTMUSIC (Pixabay, Pixabay Content
  License; `public/audio/life-in-the-danger-zone.mp3`, 67 s at 128 kbps, credited on the title screen and in
  CREDITS.md), looped from the first click or key press (browsers block sound before one). It plays at master ×
  music volume on the title screen and at 40% of that in flight, fades over 0.8 s between them, and pauses while the
  tab is hidden. Settings → Sound: Music on/off and Music volume (default 60%); Sound off silences it too.
- **Audio:** WebAudio-synthesized, no asset files.
  - Wind, cannons. (The engine and afterburner were removed at the owner's request in revision 19: "the engine sound
    is awful, I don't want it".)
  - SRM growl and lock tone, radar lock warning, missile warning, explosions and hits.
  - Bomb release (a short thump); bomb impacts use the explosion sound, scaled by distance.
  - Master volume.
  - M5: explosions panned to where they happen; the nearest missile within 700 m as a positional voice with a
    Doppler shift (the two nearest jets' engines were heard the same way until revision 19); a stall horn, a pull-up tone, runway rumble, rain, the gear
    motor, a respawn whoosh, a kill chime, zone and Sentinel cues, and a chord at the end of a match.
  - Settings (M5): Reduce motion (shake, G effects, kill cam), Reduce flashing (steady warnings, no strobes) and Team
    colours (blue/red or a colour-blind safe blue/orange).

## 16. Server (M2)

Removed in revision 14, with §7.

- **`main.ts`:** config from env/CLI (`PORT` 8080, `HOST` 0.0.0.0, `MAX_ROOMS` 20, `MAX_HUMANS_PER_ROOM` 16,
  `BOTS_PER_TEAM` 4, `BOT_SKILL` veteran, `DIST_DIR` dist); static files from `dist/` (hashed assets cached for good,
  the page revalidated); `ws` at `/ws`; `GET /healthz`, `GET /api/rooms`, `POST /api/error` (rate limited); LAN URL
  printout. Runs straight from TypeScript (Node ≥ 23.6 strips the types).
- **Docker:** a two-stage image builds the site and runs the server as the `node` user with a health check.
- **`RoomManager`:** creates and closes rooms (a room closes 30 s after the last human leaves).
- **`Room`:** owns a `World`, player↔aircraft mapping, input queues, snapshot encoding, event fan-out and history.
- **Tick loop:** a process-wide fixed-step accumulator.
  - Each room's step is isolated in try/catch; 3 consecutive failures close the room.
- **Shutdown:** SIGINT/SIGTERM broadcast `serverShutdown`, then close.

## 17. Error handling

| Situation | Behavior |
|---|---|
| WebGL unavailable | Friendly message with browser guidance |
| Exception inside a simulation step | Logged; the offending entity is removed if identifiable; the room/session continues; 3 consecutive failures stop it with a visible error |
| Invalid aircraft data file | `validateAircraftConfig` fails the test suite and throws at registration with the aircraft id and field |

## 18. Performance budgets

| Area | Budget |
|---|---|
| Client frame | 60 fps at 1080p on a 2020+ laptop; < 400 draw calls; < 2 M triangles |
| Terrain chunk build (worker, M4) | < 4 ms per chunk (measured 1.9 ms) |
| World step | < 2 ms with 32 aircraft (server and local); M5 measured 0.34–0.50 ms on average with 32 bots (36 aircraft with the Sentinels) on Lechovia |
| Network per client | ≤ 50 KB/s down, ≤ 1 KB/s up |
| Initial download | < 5 MB (maps are generated from seeds, not downloaded); the single-file build is 5.4 MB in M5, the multi-file build splits it and the browser caches the pieces |

## 19. Testing strategy

Test-driven development with Vitest: write the failing test first for all logic in `src/shared/`, `src/server/`
and the pure parts of `src/client/`. Rendering, feel and visuals are verified by running the game in the browser
pane at each stage.

- **Atmosphere:** ρ, T and a at 0 / 5 / 11 / 15 km within 1% of ISA tables.
- **Flight model** (every registered aircraft):
  - Level trim holds altitude within 30 m over 10 s.
  - Full aft stick at 300 m/s: peak n in [8.0, 9.5]. Low speed is lift-limited; very low speed sinks.
  - Roll builds up smoothly: under 40% of the max rate after 0.1 s, over 80% after 0.8 s; a full-stick half roll takes
    1.2–2.0 s.
  - 60 s of random inputs never produces NaN; identical inputs give identical states.
  - Each aircraft's performance targets (§9.3) are met.
- **Weapons:**
  - Ballistics and damage; the lead-marker solution hits a constant-velocity target.
  - Proportional navigation hits a non-maneuvering target and runs out of energy at long range. A hard break timed
    shortly before impact makes it miss; flying straight, a gentle turn or a break at launch does not.
  - Fuze closest-approach math.
  - Countermeasure rates over 1,000 seeded trials within ±5% of expected.
- **Targeting:**
  - Radar detection range vs stealth; seeker range vs aspect and afterburner.
  - Terrain occlusion; lock build-up and loss; designation order.
- **Damage:** state thresholds and effects; kill credit, including maneuver kills and collisions.
- **Map:**
  - Terrain determinism and bilinear sampling; `surfaceAt` over the sea; line of sight.
  - (M4) Feature placement: airfields flat, villages not in water, roads connected; sea in the north, peaks of about
    2,400 m in the south, rivers that never climb, dozens of lakes in the north-east, fictional unique names.
- **Ground handling (M4):** every jet lifts off within the runway at military power and afterburner and climbs away
  with the gear up; rolls straight with the stick centred; steers and brakes to a stop; holds still on the brakes;
  rolling off the airfield crashes; runway starts only where the mode offers them.
- **Weather and time (M4):** cloud cover per preset within ±8%; clouds block sight lines only inside the layer and hide
  a jet from the eye and the infrared seeker but not radar; the sun's path at 52° N; the clock.
- **Modes:** scoring, win conditions, zone capture math, Sentinel rules, spawn placement. As built (M5): zone layout,
  capture and neutralizing times, scoring; Sentinels hold their orbit, run from a fighter, score 20, cut the datalink
  for 60 s and return after 120 s; the datalink and its loss; jet changes at respawn; Free Flight sky changes,
  fly-from-here and drones; a lone bot takes all three zones; bots on both sides contest zones; bots hunt down a
  Sentinel; rooms, messages and sessions for every online mode; `npm run smoke -- --mode=…` for each.
- **Strike (M1d):**
  - Rules: time-out → USA; two targets destroyed → Russia; a team's 4th loss → the other team; the same-tick order of
    §13.1; no respawn without aircraft left; impacts after the match ends are ignored.
  - Bombs: carried only by Russian jets in Strike, 8 per aircraft, refilled on respawn, at most one per 0.25 s; the
    impact prediction agrees with the real impact within 5 m for level and diving releases from 500 to 3,000 m above
    the ground at 200–350 m/s; damage falloff; a target is destroyed at 0 HP.
  - Layout: every target sits on dry land with a gentle slope, inside the combat area.
  - AI: unopposed, Veteran and Ace attackers destroy two targets within 9 minutes in at least 80% of seeded runs; a
    defender bot intercepts an attacker; over 20 seeded Veteran-vs-Veteran matches the attacker wins 35–65% (so neither
    side is automatically superior).
- **AI:**
  - Steering converges on a direction (< 3° within 5 s); ground avoidance recovers from a low dive.
  - Fires only when aligned; defends against inbound missiles.
  - Ace beats rookie in > 80% of the seeded 1v1s that end in a kill, and ≥ 70% end in a kill within 3 minutes.
    (Revision 5: with dodgeable missiles, some duels outlast the limit once both sides have spent their missiles.)
- **Balance (M3):** the tournament per §9.4.
- **Networking (M2):**
  - Codec round-trips and quantization bounds; garbage input raises a typed error.
  - Prediction converges under simulated latency; interpolation limits.
  - Server integration tests with real `ws` clients: join, snapshots, inputs, hit/kill/respawn, room full,
    protocol-violation disconnect.
  - Deploy smoke test (`npm run smoke [url] [--lag=ms]`): health check, the page, and two headless pilots over real
    WebSockets who fly, see each other and swap a quick-chat line; it checks round trip, prediction error and queue
    depth.
- **Client logic:** input mapping, camera blend math, HUD math and unit formatting, fixed-step accumulator.
- **Gate:** `npm test` and `npm run build` (type-check + client build) pass before every commit.
  `src/shared/` line coverage ≥ 80%.

## 20. Development milestones

Each milestone has its own implementation plan in `docs/superpowers/plans/` and ends runnable. The order follows the
brief (§11 of the brief: steps 1–11).

| # | Milestone | Brief steps | Scope | Accepted when |
|---|---|---|---|---|
| M1a | **Fly** | 1–6 (+ basic HUD) | Scaffold; math; atmosphere; data-driven aircraft config (Kestrel); flight model; steering; test-range terrain; local World and session; renderer, sky, terrain mesh, parametric model; keyboard + mouse-aim; HUD and chase cameras with transitions/shake; free camera; basic flight HUD; start menu with Free Flight | One aircraft is flyable at 60 fps; stall, G-limit, energy bleed and altitude effects observable; tests green |
| M1b | **Fight** | 7–9 | Second aircraft (Kobchik) as the AI opponent; cannon + lead; SRM + IR seeker; flares; basic radar detection and designation; damage model; destruction and respawn; Team Deathmatch vs 1 AI; bot pilot; effects (tracers, missile trails, flares, explosions, smoke); full combat HUD (target info, lock, missile warning, radar display, ammo, kill feed, hit markers, scoreboard); minimal audio; third-person camera and a minimal title screen over a live 3D background (checkpoint feedback) | A 1v1 dogfight against the AI is playable end to end with both weapons and countermeasures |
| M1c | **Website basics** | — (§24) | Guided training flight; settings screen (volume, mouse sensitivity, invert, HUD color and size, key remapping); gamepad and flight-stick support; Low/Medium/High graphics presets chosen from the frame rate; loading progress; page metadata, social-preview image and icon; color-blind-safe team markers; every sound warning also shown as text | A first-time visitor completes the training flight and a fight on a mid-range laptop without reading the README |
| M1d | **Strike** (built before M1c, owner's priority) | — (owner request, 2026-09-30) | Strike mode vs 1 AI (§13.1): three ground targets, the Anvil bomb with impact prediction, 4 aircraft per team, attacker and defender AI, strike HUD, mission choice on the title screen, match-end reasons, sounds | A 1v1 Strike match is playable end to end from both sides; the Veteran-vs-Veteran attacker win rate is 35–65% |
| M2 | **Multiplayer** | 10 | Node server, rooms, protocol and codecs, authoritative World, NetworkSession (prediction, reconciliation, interpolation, clock sync, lag compensation), lobby (team + aircraft), bots fill, LAN URLs, lag simulator; invite links and Quick play; preset quick-chat; callsign filter; page/server version check; error reporting and a health check; one browser smoke test; multi-file site build; Dockerfile for the owner's host | Two tabs plus a second LAN machine fight each other smoothly at `?lag=150`; integration tests green; `docker build`/`run` serves the game |
| M3 | **Roster & weapons** | 11 | The remaining 6 aircraft (data + parametric models); upgraded model generator (smooth fuselage, canopy glass, panel lines, sky-reflecting paint, team paint schemes); radar/stealth model; MRM "Lance" + chaff; RWR `LOCK` warning; balance tournament | All 8 aircraft selectable; tournament win rates within 35–65% |
| M4 | **World** | 11 | Lechovia map (terrain LOD in worker, geography, settlements, roads, airfields), runway spawns with ground handling, clouds and weather, day/night cycle; map screen (revision 11) | Take off from a fictional airfield and fight over recognizable Poland-inspired terrain at 60 fps, day and night |
| M5 | **Modes & polish** | 11 | Air Superiority, Team Objective, Free Flight extras; end-of-match summary; graphics upgrades (contrails, wingtip vapor, damage fire); kill cam, spectating while respawning, changing jets on respawn; full audio; remaining accessibility options; README; as built also the team datalink, pilots per side offline and protocol 4 (revision 12) | All four modes playable online |

## 21. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Flight-model tuning takes many iterations | Numeric performance targets in data + tests; `?debug=1` overlay |
| Balance across 8 aircraft | Automated seeded tournament; tuning only in data files |
| Prediction jitter | Queue-depth feedback, smoothing, lag simulator |
| Terrain and cloud rendering cost | Quadtree LOD, fog, worker builds, quality settings |
| Browser floating-point differences | Server authoritative; reconciliation corrects drift |
| Scope creep | Milestones each runnable; out-of-scope list (§23) |
| Node native TypeScript limits | Erasable syntax only, enforced by `tsconfig` |

## 22. Content, attribution and licensing

- **Fictional content:** aircraft, weapons, the country, cities, villages and airfields are fictional.
  - Aircraft are only "inspired by" real types; no real designations or real specifications are shown.
  - Revision 7: at the owner's request two jets look like the F-35A and the Su-57, using the owner's own models (some
    textures carry markings); since revision 10 these are the Shade and the Prizrak, the jets inspired by those types.
    Their names and specifications stay fictional.
  - No real-world military installations are reproduced.
  - Strike targets are fictional facilities in open country (a supply depot, a radar site, a fuel depot). Towns,
    villages and people are never targets, and no casualties are shown.
- **Abstraction:** weapons and sensors are gameplay abstractions (§10). No real-world construction or operational
  guidance.
- **Tone:** a neutral game scenario, with no real events, casualties or political messaging.
- **Licensing:** `three` and `ws` are MIT licensed. No project license file is added; the owner decides.

## 23. Out of scope (v1)

- Accounts, rankings and leaderboards; records shared between browsers or devices. (Records kept in one browser
  arrived in revision 17.)
- Free-text and voice chat (preset quick-chat is in scope, M2).
- (Landing and rearming arrived in revision 22, §10.6; fuel, spins/departures and wind in revision 16.) AI pilots
  flying home to rearm.
- Air-to-ground weapons other than the Strike mode's abstract bomb (§10.4), which never damages aircraft.
- Real-world map data.
- Functional cockpit instruments/MFDs.
- VR, mobile/touch.
- Anti-cheat beyond server authority and input validation.
- An automated browser test suite beyond one deploy smoke test (M2).
- Choosing and paying for a server host: the owner's decision. The project provides the single-file static build and
  a Dockerfile (M2).

## 24. Public website (revision 3)

The game is published as a public website. These features come from the roadmap review of 2026-09-29; each lists
its milestone.

| Area | Features | Milestone |
|---|---|---|
| First minute | A 2–3 minute guided training flight: fly with the mouse, shoot a target drone, lock and fire a missile, beat an incoming missile with flares. (The start screen's Controls panel arrived in M1b.) | M1c |
| Controllers | Gamepad and flight-stick support (Gamepad API, standard mapping, axis calibration); key remapping; mouse sensitivity and invert | M1c |
| Hardware range | Low/Medium/High graphics presets (pixel ratio, texture size, draw distance, effects), chosen automatically from the measured frame rate and changeable in settings | M1c |
| Loading | A loading progress bar. Once assets pass about 5 MB, publish the multi-file build (`dist/`) instead of one HTML file so browsers cache and load pieces in parallel | M1c (progress), M2 (multi-file) |
| Sharing | A title screen with a Play button over a live 3D background (M1b); page title, description, social-preview image and icon (M1c) | M1b, M1c |
| Hosting | Netlify (or any static host) serves single-player builds. Online play needs a Node host with WebSockets; the simplest setup serves the page and the game from one server (§7). Free tiers usually sleep when idle. (Revision 13: Netlify is linked to the repository and builds the multi-file site on every push that changes the page, per `netlify.toml`; the one-file build remains for hand deploys.) (Revision 14: no server; GitHub Pages serves the multi-file site from the `gh-pages` branch, which `.github/workflows/publish.yml` rebuilds after the tests pass on every push to `main` or a `claude/…` branch, at https://hirotomatsui000.github.io/dogfight/; revision 19: https://lechovia-skies.github.io/._./, the repository `lechovia-skies/._.`; the workflow builds for the root of the address when a repository is named `<owner>.github.io`) (Revision 21: the organization's own site, the repository `lechovia-skies/lechovia-skies.github.io`, sends the bare address and every address with nothing behind it to `/._./`: chat apps drop the last `.` of a link sent without its final `/` and open `/._`, which showed GitHub's 404 page to other players.) | M2 |
| Joining | An invite link per room, and "Quick play" that joins the busiest room. Bots fill empty seats so one human plus bots is a full match. (Removed in revision 14) | M2 |
| Safety | Server authority for all hits (§7); callsign filter; preset quick-chat messages only; rate limits; a short privacy note (no accounts, no tracking) | M2 |
| Updates | A page/server version check that asks players to reload; browser error reporting; a server health check; one automated browser smoke test (load the site, fly 10 s) before each deploy. (Revision 14: all removed with the server; the publish workflow runs the unit tests before each deploy) | M2 |
| Feedback | Hit markers, kill confirmation and kill feed (M1b); kill cam, spectating while respawning, changing jets on respawn (M5, built) | M1b, M5 |
| Accessibility | Team markers that differ in shape as well as color; HUD color and size options; every sound warning also shown as text; reduce-motion also covers G-force effects; reduce flashing and colour-blind team colours (M5, built) | M1c, M5 |
