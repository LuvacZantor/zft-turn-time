# ZFT Turn Time

Foundry VTT V13 module for tracking real-world combat turn duration.

## Target

- Foundry VTT V13, verified target Build 351
- System-agnostic core
- No hard dependency on DnD5e, MidiQOL, CPR, DAE, SocketLib, or Effect Macro

## Features

- Primary-active-GM single-writer timing
- Uses Foundry V13 `combatStart` and `combatTurnChange`
- Live current-turn timer in the Combat Tracker
- Campaign actor averages
- User averages
- Per-combat encounter combatant statistics
- Maximum turn length rejection
- Optional NPC exclusion
- Optional campaign-stat reset on each combat
- Chat report button
- Automatic end-of-combat chat report
- Public module API

## Installation

Copy the `zft-turn-time` folder into:

`{Foundry User Data}/Data/modules/`

Restart Foundry, enable **ZFT Turn Time** in the world, and reload.

## API

```js
const api = game.modules.get("zft-turn-time")?.api;

api.campaignStats;
api.combatState;
api.getActorStats(actorId);
api.getUserStats(userId);
api.formatDuration(65000);
await api.postCombatReport();
await api.resetCampaignStats();
api.isPrimaryGM();
```

## Data Model

Campaign aggregates are stored in the hidden world setting:

`zft-turn-time.campaignStats`

Current encounter state is stored on the Combat document flag:

`flags.zft-turn-time.combatState`

The active stopwatch timestamp is written only when a combat starts or advances. There is no per-second document write.

## Diagnostic Logging

All module console logs begin with `[ZFT]`.

Expected initialization:

```text
[ZFT] 🛠️ v0.1.9 | Initializing ZFT Turn Time
[ZFT] ⚙️ Turn Time settings registered
[ZFT] 🪝 Combat timing hooks registered
[ZFT] 🖥️ Combat Tracker UI hooks registered
[ZFT] ✅ v0.1.9 | ZFT Turn Time initialized
[ZFT] 🚦 v0.1.9 | Ready | ...
```

Expected combat transition:

```text
[ZFT] ⏱️ Combat timing started | ...
[ZFT] ✅ Turn recorded | actor=... | combatant=... | elapsedMs=...
[ZFT] ▶️ Next turn timer armed | ...
```

## Validation Procedure

1. Install and enable the module in a V13.351 world.
2. Open browser dev tools and clear the console.
3. Create a combat with at least two combatants.
4. Start combat as the GM.
5. Confirm the active combatant shows a ticking stopwatch badge.
6. Wait several seconds and advance to the next combatant.
7. Confirm the previous actor now has an average and the next actor has a live timer.
8. Advance through at least one full round.
9. Click the stopwatch report button in the Combat Tracker.
10. Confirm a chat table is posted with Average, Turns, and Total.
11. In the console run:
   `game.modules.get("zft-turn-time").api.campaignStats`
12. Confirm actor/user aggregate data exists.
13. Test an NPC with **Track NPC Turns** disabled and confirm the console reports the NPC sample was skipped.
14. Temporarily set **Maximum Turn Length** to 2 seconds, take a >2 second turn, and confirm the sample is rejected with a `[ZFT] ⚠️` diagnostic.

## Expected Success Behavior

- Exactly one completed-turn sample is recorded per turn.
- Only the deterministic primary active GM writes timing data.
- Live display updates once per second without database writes.
- Campaign actor averages survive combat deletion and world reloads.
- Encounter statistics remain scoped to the Combat document.
- Invalid/overlong samples do not change averages.

## V13 Combat Start Ordering

Foundry V13 may fire `combatStart` before `combat.combatant` is populated. The module therefore treats
`combatTurnChange` as the authoritative recovery point for the first turn and arms the timer there if
the initial `combatStart` state was empty.

## v0.1.9 Fix

Corrected the V13 Combat Tracker UI regression introduced in v0.1.3 where `stateOverride`
was referenced inside `decorateCombatTracker()` even though it is only valid for report generation.

Expected result:
- live tracker timing renders again,
- first-turn recovery remains intact,
- automatic end-of-combat report remains enabled.

## v0.1.9 Presentation Fix

Improved chat report layout for narrow Foundry chat cards:
- compact `Avg` header,
- numeric columns remain on one line,
- Combatant column takes the flexible width,
- long names wrap cleanly,
- report can horizontally scroll as a final fallback instead of clipping.

## v0.1.9 Encounter Reset Fix

Combat Tracker display is now strictly scoped to the current Combatant in the current encounter.

Previous campaign Actor/User aggregates are no longer used as a visual fallback when a new
combat begins. This means:
- average starts empty for a new encounter,
- recorded turn count starts at zero,
- same token/Actor history from prior combats does not appear in the tracker,
- campaign aggregates remain available through the module API for future analytics.

## v0.1.9 Report Speaker Fix

Turn Time reports now use the currently logged-in GM user name as the chat speaker.
Selected tokens/actors no longer determine the report speaker.

Expected console confirmation:

`[ZFT] 📊 Combat timing report posted | ... | speaker=<GM Name>`

## v0.1.9 Popout Live Timer Fix

The once-per-second live timer refresh now updates every rendered Combat Tracker instance,
including both the sidebar tracker and a popped-out Encounter/Combat Tracker window.

No popout layout or styling changes are made.

Expected render diagnostic:

`[ZFT] 🪟 Combat Tracker rendered | ... | rows=<n>`
