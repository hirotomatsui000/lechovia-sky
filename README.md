# Lechovia Skies

A browser-based flight-combat prototype. Two teams, **USA** and **Russia**, fly **fictional** fighters inspired by
real aircraft over a fictional landscape inspired by Poland. This repository is being built in milestones (see
`docs/superpowers/specs/2026-09-29-poland-dogfight-design.md`).

**Play it:** https://lechovia-skies.github.io/._./ (desktop or laptop with a keyboard and mouse). The site
is rebuilt after every push ([Publish as a website](#publish-as-a-website)). The game was called Contested Skies until
2026-10-03; settings, records and campaign progress saved under that name carry over.

**Current milestone: M5 "Modes & polish"** (after M1a "Fly", M1b "Fight", M1d "Strike", M1c "Website basics", M2
"Multiplayer", M3 "Roster & weapons" and M4 "World"). Online play (M2) was taken out again on 2026-10-02: the game is
single player against AI pilots and runs entirely in the browser.
- **Easier to hit** (2026-10-03): your missiles lock sooner, are fooled by flares and chaff far less often, turn
  harder and burst wider, and your cannon rounds hit within three times the old distance. Guns have an aim assist: with the aim point
  (the circle in front of the target) within about 10° of your nose, the rounds go to it; a ring closes on the
  circle as the assist takes hold and turns red when it holds. The AI pilots keep their weapons
  as they were, so Aces are still hard to bring down.
- **Music** (2026-10-03): "Life in the Danger Zone" by DJARTMUSIC (Pixabay) plays on the title screen from your
  first click or key press, and more quietly in flight. **Settings** → **Sound** has a Music switch and a music
  volume. The synthesized engine sound is gone, and dusk and night are brighter: the land, the horizon, the clouds
  and other jets stay visible. The afterburner flame looks like burning gas: a white-hot core, shock diamonds and an
  orange flame that flickers and breaks up at the tail.
- **Team Objective evened out** (2026-10-03): Russia used to win about three matches in four. Now every jet carries 4
  Lances in this mode, the USA's Sentinels are sturdier the more Russian fighters there are, and the Sentinels fly
  like radar planes (they used to spiral into the ground when running from a fighter). In bot play the sides now win
  about equally from 1 v 1 to 4 v 4.
- **Campaign** (2026-10-03): nine missions over Lechovia, flown in order for either side. **Campaign** beside FLY
  opens the list: pick USA or Russia, read the briefing (mode, time, weather, who you fly with and against, how to
  win) and choose a jet (one is suggested). Clearing a mission opens the next, and the end screen goes straight on to
  it with its briefing; a loss or a draw offers a retry. It starts with a 1 v 1 against a Rookie and ends with four
  Aces a side in Team Objective at dusk, by way of a 2 v 3, a Strike, a night fight and a runway take-off in a storm.
  Progress is kept in your browser for each side, and campaign matches also count in the Records.
- **Fuel, wind and spins** (2026-10-02):
  - Every jet carries its real-world share of internal fuel and burns it with the throttle; the afterburner drinks
    about five times as much per unit of thrust. The jet gets lighter as it burns. The HUD shows `FUEL` above the
    throttle; at 20% it says `BINGO FUEL`, and an empty tank flames the engines out (`FLAMEOUT`): you glide. Respawning
    (or Free Flight's "fly from here") fills the tanks.
  - The wind comes with the weather (light in clear skies, strong and gusty in rain), from a different direction each
    match, stronger and veering higher up. You fly in the moving air: the HUD shows ground speed (`GS`) and the wind under the altitude,
    a headwind shortens the take-off run, bombs drift (the bomb sight allows for it), and smoke and contrails blow
    downwind. Training flies in still air.
  - Too slow and stalled, a jet can depart into a spin, especially if you roll there; it yaws round and falls at
    70–100 m/s. Mouse aim recovers by itself (`SPIN` · `AUTO RECOVERY`). With keyboard steering: nose down (W),
    rudder against the spin (Q or E, as the HUD says) and let go of the roll. Thrust-vectoring jets (Prizrak,
    Yastreb) and hard-limited ones (Kestrel, Condor) are hard to depart; the Sapsan is the easiest.
- **Four modes**:
  - **Dogfight** (Team Deathmatch): first to 15, or the most after 10 minutes.
  - **Air Superiority**: three zones (A, B, C) on the front, each a cylinder 4 km across from 1,000 to 7,000 m. The
    side with more jets inside takes a zone; each zone you own scores a point every 2 s. First to 300.
  - **Team Objective**: each side guards two slow **Sentinel** radar planes flown by the game. Shooting one down is
    worth 20 points and takes the other side's datalink down for 60 s; it comes back after 2 minutes. Every fighter
    shot down is worth a point. Every jet carries 4 Lances here. First to 60.
  - **Free Flight**: no enemies. From the pause menu set the time of day, the clock and the weather, and call up
    target drones; on the map (M) click anywhere to fly from there, or on an airfield to start on its runway.
  - Strike and the Training flight are still there.
- **Pilots per side** (1, 2 or 4): your AI wingmen against as many AI pilots.
- **Team datalink**: you also see the enemies your teammates have on radar, drawn hollow on the radar display and the
  map (they cannot be locked).
- **While you wait to respawn**: a kill cam on whoever shot you down, then spectating (A / D to switch pilots), and
  Q / E to pick a different jet for the next life.
- **Contrails** above 8 km, **wingtip vapour** above 5 G, jets that burn when badly hit, and wrecks that fall in flames.
- **Fuller sound**: explosions heard from where they are, missiles going by (with a Doppler shift as they pass), a
  stall horn, a pull-up tone, runway rumble, rain, and chimes for kills, zones and Sentinels. There is no engine sound
  (taken out on 2026-10-03 at the owner's request).
- **Records** (2026-10-02): every finished match is saved in your browser, no account needed. **Records** on the
  title screen shows your totals (matches, wins, kills, deaths, missiles and hits, damage, time in the air), personal
  bests (most kills in a match, longest kill streak, most damage, longest life, top speed), matches by mission and by
  jet, and your last ten matches. The end screen tells you when you beat a best. Training and Free Flight are not
  counted, and clearing the site's data erases the records.
- **End-of-match summary**: damage per pilot, how the zones or Sentinels ended up, and your own flight (kills,
  missiles fired and hit, gun hits, damage, top speed, max G, time in the air).
- **Accessibility**: reduce motion (also softens the G blackout and holds the kill cam still), reduce flashing (steady
  warnings, no strobes) and a colour-blind safe team colour pair, besides the HUD colour and size.

Earlier milestones:
- **Lechovia**, a fictional 200 × 200 km country inspired by Poland: a Baltic-style coast with a lagoon and a sand
  spit, a lake district, two rivers falling from the southern mountains (peaks of about 2,400 m) to the sea, eastern
  forests and marshes, five cities and some sixty villages with invented names, roads, and four air bases. The map is
  generated in a background thread while the title screen is up and drawn in more detail near your jet.
- **Take off from a runway** (choose *Runway start*): open the throttle, pull up at about 170 kt, and the gear
  retracts by itself. There is no landing.
- **Time of day and weather**: Dawn, Day, Dusk or Night on the title screen; matches from there fly in scattered
  cloud with the clock standing still (since 2026-10-03). Free Flight's pause menu still offers Clear, Scattered,
  Broken, Overcast or Rain and a clock that runs one hour per minute, and campaign missions bring their own weather.
  Clouds hide jets from your eyes and from heat-seeking missiles, not from radar. At night towns, roads and runways light up and every jet shows navigation lights.
- A **map screen** on M.
- **Eight aircraft**, four per team: USA Shade, Tempest, Kestrel and Condor; Russia Prizrak, Yastreb, Sapsan and
  Kobchik, each with its own flight model, sensors, stores and strengths. The Shade and the Prizrak wear the owner's
  3D models (inspired by the F-35A and the Su-57); the others are generated with team paint schemes.
- The medium-range radar missile **Lance** (key 2) with radar locks, chaff, and a RADAR LOCK warning when an enemy
  radar locks on to you. AI pilots fly a mix of jets and use Lances beyond Dart range.
- Balanced by a bot tournament: every USA jet against every Russian jet, Ace against Ace, within 35–65% wins.
- A **training flight** (about 3 minutes): fly through rings, gun a drone, lock and fire a missile, beat a missile.
- **Settings**: volume, mouse sensitivity and invert, rebindable keys, gamepad and flight-stick setup, HUD color and
  size, graphics (Auto, Low, Medium, High) and the accessibility options.
- **Gamepads and flight sticks** through the browser's Gamepad API.
- AI pilots at three skills (Rookie, Veteran, Ace).
- **Strike** mode: Russia bombs three fictional targets while the USA holds them for 9 minutes; 4 aircraft per pilot
  per team.
- Weapons: a cannon with a lead marker, heat-seeking (Dart) and radar (Lance) missiles that need a lock, and flares
  with chaff.
- Damage, kill credit and respawns; tracers, missile trails, flares, explosions and smoke; synthesized sound.
- A combat HUD with target box, missile lock, missile warning, radar display, kill feed and scoreboard.
- A third-person camera that follows your jet, and a title screen over a live 3D view of the jet you pick.
- Sim-lite flight physics over Lechovia, or the original 60 × 60 km test range (Strike and Training fly there);
  satellite-photo scenery.

## Requirements

- Node.js **23.6 or newer** (developed with Node 26).
- A current desktop browser with WebGL (Chrome, Edge, Firefox or Safari).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. New pilots start with **Training**. Otherwise pick a mission (Dogfight, Air Superiority,
Team Objective or Strike), an aircraft, the opponents' skill and how many pilots fly on each side, the **World** (map,
air or runway start, time of day, whether the clock runs, weather), and press **FLY** (or **Free flight** to fly without
enemies). **Controls** lists the keys;
**Settings** changes them, the mouse, the gamepad, the HUD, the graphics and the sound (also from the pause menu).
Click the view to capture the mouse, then fly with the mouse. If the aim moves too fast or too slowly, change **Mouse
sensitivity** under **Settings → Controls** (100% turns the aim about 6° per 100 pixels of mouse travel).

Other devices on the same network can open the "Network" URL that Vite prints. Adding `?debug=1` to the address shows
frames per second, angle of attack, G, Mach, altitude, the landing gear and the time of day.

## Controls

| Action | Keys |
|---|---|
| Aim (mouse-aim mode) | Mouse (click the view to capture it) |
| Pitch / roll / rudder | W/S (W = nose down) · A/D · Q/E |
| Throttle (top 10% = afterburner) | Shift up · Z down · mouse wheel |
| Airbrake | B (hold) |
| Cannon | Space or left mouse (hold) |
| Missile (needs the lock tone) | F |
| Select short-range Dart / medium-range Lance | 1 / 2 |
| Bomb (Strike, Russian jets) | G |
| Flares and chaff | X |
| Next target | R |
| Look around (swings the camera round your jet) | C or right mouse (hold) |
| Scoreboard | Tab (hold) |
| Map | M |
| Wheel brakes on the runway | B (hold) |
| Pause / settings | P or Esc |
| While waiting to respawn: watch another pilot · pick the next jet | A / D · Q / E |
| Free Flight: fly from a point of the map | M, then click the map |

Every key except Esc can be changed in **Settings → Keys**.

### Gamepad

A pad with the standard layout (Xbox, PlayStation and most others) works straight away:

| Control | Action |
|---|---|
| Left stick | Pitch and roll |
| Right stick | Look around |
| LB / RB | Rudder |
| LT / RT | Throttle down / up |
| X · A · B · Y | Cannon (hold) · missile · flares and chaff · next target |
| D-pad ↓ / ↑ | Bomb · airbrake (hold) |
| D-pad ← / → | Select Dart / Lance |
| Start · Back | Pause · scores (hold) |
| While waiting to respawn | Left stick ← / → watch another pilot · LB / RB pick the next jet |

Flight sticks and other devices: open **Settings → Gamepad**, assign the roll, pitch, rudder and throttle axes and the
buttons (move or press each one), then **Calibrate**.

In a fight:
- The nearest enemy ahead is targeted automatically; R picks the next one.
- The missile seeker growls while it tracks and gives a steady tone when locked. Then press F.
- For targets beyond about 6 km, press 2 for the Lance: a diamond closes on the target box while the radar locks
  (quick beeps), then turns red with a steady tone. Press F, and keep the target inside your radar cone (roughly
  ahead) until the missile is about 10 km from it; after that it guides itself. Press 1 to go back to the Dart.
- RADAR LOCK flashes when an enemy radar has locked on to you or its Lance is on the way: expect a missile.
- Inside 2 km a gun aim circle appears. Put the nose on it and fire.
- A missile fired at you shows as MISSILE with its range from the moment it launches, and a red marker (or an arrow
  at the screen edge) shows where it is. You can beat it without flares: when the HUD flashes TURN HARD NOW, about
  two seconds before impact, turn hard to put the missile on your wing. Breaking too early or too late does not
  work. Flares and chaff (X) help too: flares against the Dart (better off afterburner), chaff against the Lance
  (better for the stealthy jets).
- Distant jets and missiles are drawn a little larger than life so they never shrink to a single pixel.
- Watch the fuel: afterburner all the time empties the tank in 6–12 minutes near the ground (longer up high).
- Keep your speed up: a stalled, slow jet that rolls can spin (see above), and spinning low is fatal.

In Strike (choose **Strike** under Mission on the title screen):
- The USA jets defend: keep at least two of the three targets standing for 9 minutes, or shoot Russia's jets down
  four times.
- The Russian jets attack with 8 bombs each: destroy two targets, or shoot the USA's jets down four times.
- Fly level about 1,500 m above a target. The circle on the ground shows where a bomb would land; press G as it
  crosses the target (RELEASE flashes). Three good hits destroy a target.
- Each side has 4 aircraft. Losing the fourth loses the match.

In Air Superiority:
- Zones A, B and C sit on the front between the two sides, each a cylinder 4 km across from 1,000 to 7,000 m; the HUD
  marks them with a hexagon and shows them under the score.
- Fly into a zone with more of your side than theirs to take it: 10 s from neutral with one jet more, faster with
  more. An enemy zone must first be neutralized. A tie, or nobody inside, holds it as it is.
- Each zone you own scores a point every 2 s. Kills score nothing, but they empty the zone.

In Team Objective:
- Your two Sentinels (ringed markers) orbit far behind your side; theirs orbit behind theirs. Sentinels carry a radar
  that sees the whole front, so while yours fly your datalink shows enemies far away (hollow marks).
- Shoot down an enemy Sentinel (400 hit points, it runs from fighters and drops flares): +20, and their datalink fails
  for 60 s. It comes back after 2 minutes. Every fighter shot down is worth 1.

In Free Flight:
- Pause (P) to change the time of day, the clock and the weather, or to call up four target drones that circle round
  you and never shoot back.
- Press M and click the map to fly from that point, 1.5 km above the ground; click an airfield to start on its runway.

On the runway (*Runway start*):
- The jet rolls at full military power. Hold Shift for afterburner if you like.
- At about 170 kt (310 km/h) pull up: move the mouse up, or hold S. The nose lifts and the jet flies off.
- The gear folds away once you are 30 m up. Rolling off the airfield, or touching the ground again with the gear up,
  is a crash.

The camera always follows from behind and above your jet (third person).

## Test and build

```bash
npm test
npm run build
```

`npm test` runs the Vitest suite. It checks the flight model against each aircraft's data-file performance targets:
top speed, turn rate, stall speed and G-limits.

`npm run build` type-checks with TypeScript and builds the production bundle into `dist/`.

`npm run tournament` plays the balance tournament on all CPU cores (about 15 s): every USA jet against every Russian
jet, Ace bots, 100 seeded duels each, and fails if a pairing wins outside 35–65% of its decided duels.
`TOURNAMENT=1 npm test` runs the same check inside the test suite (a minute or two).

## Publish as a website

The game is published with GitHub Pages at https://lechovia-skies.github.io/._./: the repository is
`lechovia-skies/._.`, in a free GitHub organization, and GitHub Pages serves a repository at
`<owner>.github.io/<repository>/` (a repository named `<owner>.github.io` would be served at the root). Until
2026-10-03 it was `hirotomatsui000/dogfight`, at https://hirotomatsui000.github.io/dogfight/. After every push to `main` or
to a `claude/…` branch, the **Publish site** workflow (`.github/workflows/publish.yml`) runs the tests, builds the site
and replaces the `gh-pages` branch with it, which GitHub Pages serves: the page changes a minute or two after the
push. The latest push wins, whichever of those branches it went to. When the tests fail nothing is published; the run
on the repository's **Actions** tab says why.

Every other address on `lechovia-skies.github.io` leads to the game too: the organization's own site, the repository
[`lechovia-skies/lechovia-skies.github.io`](https://github.com/lechovia-skies/lechovia-skies.github.io), sends the bare
address and anything with nothing behind it (its `404.html`) on to `/._./`. Chat apps drop the last `.` of a link sent
without its final `/` and open `/._`, which used to show GitHub's 404 page; the old `/lechovia-sky/` lands there too.
The first address, `hirotomatsui000.github.io/dogfight/`, is not redirected.

To switch it on (once): on GitHub open the repository's **Settings** → **Pages**, and under **Build and deployment**
choose Source **Deploy from a branch**, branch **gh-pages**, folder **/ (root)**, then **Save**. The `gh-pages` branch
appears after the workflow's first run.

Visitors need a desktop or laptop with a keyboard and mouse; phones and tablets see a notice.

### One-file build

```bash
npm run build:single
```

This writes `dist-single/index.html`: the whole game, including the scenery photos and the jet models, in one
self-contained file (about 5.4 MB), plus the social-preview image `og-image.jpg` and the icon `icon-180.png` that
other sites and phones fetch. It runs when opened directly in a browser, or from any static host. For link previews
on social sites, build with the site's address: `SITE_URL=https://example.org/ npm run build:single`.

## Scenery

The ground uses real Sentinel-2 satellite imagery of Polish farmland, forest and the Tatra mountains (EOX, CC BY 4.0),
tiled across the fictional map by land type, with a close-up detail photo (Poly Haven, CC0). See `CREDITS.md`.
`node tools/fetch-assets.ts` re-creates the photos in `src/client/assets/` from the original sources. The sky, the
clouds and the light are computed from the time of day and the weather (until M4 the sky was a photo).

Lechovia itself is generated from a seed (`src/shared/data/maps/lechovia/`), the same way on every computer, so nothing has to be downloaded.

## Project layout

| Path | Contents |
|---|---|
| `src/shared/` | Pure TypeScript game core, independent of the browser (the tests and tools run it in Node). It holds data-driven aircraft (`data/aircraft/`), physics (`physics/`), steering AI (`ai/`), terrain and maps (`map/`, `data/maps/`), game modes (`modes/`) and the simulation `world/`. |
| `src/client/` | Browser client: session loop, input, rendering (Three.js), cameras, HUD and menus. |
| `tools/` | Node scripts: the balance tournament, the one-file build, and the asset and model pipelines. |
| `.github/workflows/` | The workflow that tests, builds and publishes the site. |
| `docs/superpowers/` | Design spec and implementation plans. |

### Adding an aircraft

1. Copy `src/shared/data/aircraft/kestrel.ts`, change the numbers, and register the new file in `registry.ts`.
2. Run `npm test`. The flight-model tests check the new aircraft against its own `performance` targets.
3. Run `npm run tournament` and tune the data file until every pairing is within 35–65%.

The 3-D model is generated from the `visual` block (fuselage, wing and tail sizes, engines and their spacing, intake
type, LERX, canards), painted in its team's scheme, so no rendering code changes are needed.

### Using your own 3D model for an aircraft

1. Put the original `.glb` file in `models-src/` (ignored by git) and add an entry for it to `MODELS` in
   `tools/prepare-models.ts`: the file name, and the turns that bring its nose to −z with the wings level.
2. Run `node tools/prepare-models.ts`. It writes `src/client/assets/models/<aircraft id>.glb` (1 long, simplified,
   1024 px WebP textures, meshopt-compressed).
3. Import the file in `src/client/render/aircraft-meshes.ts` and add the nozzle positions to `IMPORTED_MODELS`.
   The model is scaled to the aircraft's `visual.lengthM`.

## Content note

All aircraft, weapons, places and organizations are fictional. Aircraft are only *inspired by* real types and use
invented names and specifications.
