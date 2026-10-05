# ZFT Turn Time

ZFT Turn Time is a Foundry VTT V13 module for tracking real-world combat turn duration by combatant, actor, and user.

## Target

- Foundry VTT V13, verified on Build 351
- System-agnostic core
- No hard dependency on D&D5e, MidiQOL, CPR, DAE, SocketLib, or Effect Macro

## Features

- Primary-active-GM single-writer timing
- Uses Foundry V13 `combatStart` and `combatTurnChange`
- Live current-turn timer in the Combat Tracker
- Turn timing displayed beneath the combatant name to preserve horizontal tracker space
- GM-controlled pause/resume timer
- GM-only reset control for restarting the current live turn timer
- GM-only edit control for correcting the current live turn timer
- Reset/edit preserve the timer's current paused or running state
- Paused time excluded from turn duration, averages, and totals
- Dedicated Pause/Resume, Reset, Edit, and Report control row beneath Foundry's native combat controls
- Campaign actor averages
- User averages
- Per-combat encounter combatant statistics
- Maximum turn length rejection
- Optional NPC exclusion
- Optional campaign-stat reset on each combat
- Manual chat report button
- Automatic end-of-combat chat report
- Public module API

## Installation

Copy the `zft-turn-time` folder into:

`{Foundry User Data}/Data/modules/`

Enable **ZFT Turn Time** in the world and reload Foundry.

## Combat Tracker

The active combatant displays live turn timing beneath the combatant name.

Example:

```text
Warrior Veteran
⏱ 18s · avg 22s
```

While paused:

```text
Warrior Veteran
⏸ 18s · avg 22s
```

The module adds its own control row beneath Foundry's native combat controls:

```text
[ Pause Timer / Resume Timer ]   [ ↺ ]   [ ✎ ]   [ Report ]
```

Reset and Edit are icon-only controls with tooltips to conserve Combat Tracker width.

- Reset restarts only the active combatant's current live turn at zero.
- Edit sets the active combatant's current live elapsed time.
- Neither control changes previously recorded turns, averages, totals, or campaign statistics.
- If the timer is paused, Reset/Edit leave it paused. If it is running, it continues running from the new value.

Foundry's native combat controls are not modified.

## Pause / Resume Behavior

Pause freezes the active turn timer at its current elapsed duration.

Resume continues from that saved active duration rather than including the paused wall-clock interval.

If the turn advances or combat ends while paused, only the accumulated active time is recorded.

## Data Model

Campaign aggregates are stored in the hidden world setting:

`zft-turn-time.campaignStats`

Current encounter state is stored on the Combat document flag:

`flags.zft-turn-time.combatState`

The active timer state includes:

- current combatant ID
- actor ID
- active start timestamp
- accumulated active milliseconds
- paused state
- round
- turn

The module does not write timing state every second. Combat state is written only when combat starts, advances, pauses, resumes, or otherwise needs to persist a transition.

## Public API

```js
const api = game.modules.get("zft-turn-time")?.api;

api.campaignStats;
api.combatState;
api.isPaused;

api.getActorStats(actorId);
api.getUserStats(userId);
api.formatDuration(65000);

await api.pauseTimer();
await api.resumeTimer();
await api.toggleTimer();
await api.resetTimer();
await api.setTimerElapsed(90000);
await api.postCombatReport();
await api.resetCampaignStats();

api.isPrimaryGM();
```

## Reports

The Report button posts encounter timing statistics to chat.

Reports include:

- Combatant
- Average turn duration
- Recorded turn count
- Total recorded time

If automatic end-of-combat reporting is enabled, the module finalizes the currently active turn before generating the report. This includes the last combatant's turn, even if combat is ended while that timer is paused.

## Settings

### Track NPC Turns

Controls whether NPC combatants contribute timing samples.

### Maximum Turn Length

Completed turns longer than this value are discarded.

Set the value to `0` to disable the maximum duration check.

### Combat Tracker Display

Controls which timing information appears in the Combat Tracker:

- Current timer + average
- Current timer only
- Average only
- Hidden

### Reset Campaign Statistics Each Combat

Clears persistent campaign actor/user aggregates whenever a new combat begins.

Encounter statistics are always scoped to the current Combat document.

### Show Combat Report Button

Controls whether the Report button is displayed in the Combat Tracker.

### Post Report When Combat Ends

Automatically posts the encounter timing report when combat ends.

## Diagnostic Logging

All module diagnostic logs begin with:

```text
[ZFT]
```

Expected initialization:

```text
[ZFT] 🛠️ v0.3.0 | Initializing ZFT Turn Time
[ZFT] ⚙️ Turn Time settings registered
[ZFT] 🪝 Combat timing hooks registered
[ZFT] 🖥️ Combat Tracker UI hooks registered
[ZFT] ✅ v0.3.0 | ZFT Turn Time initialized
[ZFT] 🚦 v0.3.0 | Ready | ...
```

Expected turn transition:

```text
[ZFT] ⏱️ Combat timing started | ...
[ZFT] ✅ Turn recorded | actor=... | combatant=... | elapsedMs=...
[ZFT] ▶️ Next turn timer armed | ...
```

Expected pause/resume:

```text
[ZFT] ⏸️ Turn timer paused | combat=... | combatant=... | elapsedMs=...
[ZFT] ▶️ Turn timer resumed | combat=... | combatant=... | elapsedMs=...
```

## V13 Combat Start Ordering

Foundry V13 may fire `combatStart` before `combat.combatant` is populated.

ZFT Turn Time therefore treats `combatTurnChange` as the authoritative recovery point for the first turn and arms the timer there if the initial `combatStart` state does not yet contain an active combatant.

## Validation

Recommended release validation:

1. Start combat with at least two combatants.
2. Confirm the active combatant timer updates once per second.
3. Confirm timing appears beneath the combatant name in both the sidebar and popped-out Encounter Tracker.
4. Confirm Foundry's native combat controls remain visible and unchanged.
5. Pause the active timer and confirm the displayed duration stops advancing.
6. Click Reset and confirm the current active timer returns to zero without changing prior recorded turns.
7. While paused, click Reset and confirm the timer remains paused at zero.
8. Click Edit, enter `1:30`, and confirm the active timer changes to 1:30 and preserves its paused/running state.
9. Resume and confirm timing continues from the saved active duration.
10. Advance a normal active turn and confirm exactly one sample is recorded.
11. Advance a turn while paused and confirm only accumulated active time is recorded.
12. End combat while paused and confirm the final combatant is included in the automatic report.
13. Confirm the Report button posts Average, Turns, and Total for the encounter.
14. Confirm NPC exclusion and maximum-turn rejection settings behave as configured.
15. Confirm campaign actor/user aggregates remain available through the public API.

## v0.3.0

- Added an icon-only Reset control with tooltip for the current active turn timer.
- Added an icon-only Edit control with tooltip and native V13 `DialogV2.input` editor.
- Reset affects only the current live turn and does not change previously recorded statistics.
- Edit accepts seconds, `M:SS`, or `H:MM:SS`.
- Reset/Edit preserve the current paused or running state.
- Added `resetTimer()` and `setTimerElapsed(elapsedMs)` to the public API.

## v0.2.0

- Added GM-controlled pause/resume support.
- Paused wall-clock time is excluded from turn statistics.
- Advancing or ending combat while paused records only accumulated active time.
- Added `pauseTimer()`, `resumeTimer()`, `toggleTimer()`, and `isPaused` to the public API.
- Moved turn timing beneath the combatant name to prevent horizontal crowding.
- Added a dedicated module control row for Pause/Resume and Report.
- Preserved Foundry's native Combat Tracker control row and layout.
- Existing schema 1 active timer flags remain readable and normalize into the current combat-state schema.

## License

MIT License. See `LICENSE`.
