# Pocket visual novel story and integration

## Content provenance and adaptation

The source-first review checked the retained parent
`/Volumes/ORICO/Development/Github/pocketjs_flutter_demo`, excluding `pocket_host/`.
It covered `mini_apps/`, `docs/`, `lib/`, `test/`, `tests/`, and `web/`.
The retained tree had no VN scripts, branched dialogue, story variables, endings,
or VN save implementation. The original story and VN core fill those gaps.

| Retained source | Retained behavior | Adaptation |
|---|---|---|
| `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/mini_apps/app_nav/main.js` | JS owns page state and responds to named actions | Player choices use labels and variables from the JS StoryDefinition. JS owns route state. |
| `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/mini_apps/app_game_detail/main.js` | JS updates game state, draws the HUD, and receives input and scene facts across the host boundary | The VN JS core owns narrative state and events. Renderers and native audio receive scene and playback requests only. |
| `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/docs/03_DUAL_HOST_UI_COMPONENTS_SPEC.md` | UI control, focus, and input semantics | The game UI implements choices, history, rollback, save/load, and reading controls in JS. |

The story runtime uses the public types and engine API from `@pocket/vn`. The VN engine
owns interpretation, expressions, and application state, and the guest supplies UI.
The only canonical story source is `demo/js/apps/lantern/story.json`. `story.ts` imports
and types it as `StoryDefinition` so the app, tests, and future Editor can share
serializable data. AST conditions use JSON nodes, which exclude functions, arbitrary
scripts, and `eval`.

## Original story

`demo/js/apps/lantern/CONTENT.md` records the complete manual walkthrough, gameplay
conditions, logical asset keys, and capability node matrix. *The Last Letter of Mist
Harbor* includes an opening, three investigations that can be visited in any order,
an evidence-combination puzzle, a 16-second storm choice, and three endings.
The true ending requires mail route 7, one chime, and minute digit 4. Enter 714 in
that order and choose to trust Mira. The first error allows a retry. The second
locks the relay, leaving the last-train and stay-at-the-station endings reachable.
A timeout evacuates the passengers before safely continuing to the last-train ending.

- Backgrounds use `station`, `archive`, `roof`, and `dawn`.
- Characters use `mira` and `ren`, with expressions `neutral`, `worried`, and `hopeful`.
- CG keys are `truth_letter`, `dawn_departure`, and `harbor_light`.
- Audio requests use `music_storm`, `music_letter`, `music_dawn`, `roof_gust`,
  `station_bell`, `relay_break`, `relay_click`, and `train_depart`. Mira's
  `arrival_02` uses `voice_mira_arrival_02`. The English catalog maps the same cue
  to `voice_mira_arrival_02_en`.

These are logical keys in StoryDefinition. The game and host integrations establish
the corresponding files, renderer mappings, and actual playback. A story audio event
records a playback request. Successful audio output requires host evidence.

### Main story and model showcase counts

The recorded counts came directly from `script` in `demo/js/apps/lantern/story.json`.
The instruction total includes every DSL instruction such as scene, video, and jump.

| Content | Labels | Instructions | Say | Choice |
|---|---:|---:|---:|---:|
| Main story | 53 | 213 | 67 | 13 |
| Standalone character model showcase | 11 | 39 | 10 | 3 |
| Total at that checkpoint | 64 | 252 | 77 | 16 |

The `model_showcase` replay needs no unlocked ending and uses a separate replay
engine that preserves main-story saves. Mira Spine and Hiyori Live2D each offer three
motions. Each of the six branches displays a localized say line before returning
to its motion catalog, leaving an unobstructed moment to view the model. The
catalogs link to each other. The historical main-story count stayed at 53 labels,
213 instructions, 67 lines of dialogue, and 13 choices when this showcase landed.
The v3 main story excluding standalone reels has 71 labels, 218 lines of dialogue,
and 9,961 Han characters. It adds follow-up consequences and restores six skipped
lines. Full native routes, v1/v2 save migration, and the standard macOS Profile
Demo were verified historically with QJBC `57ba6efd…` and PAK `bcbe0d4c…`.
Other platform gates still apply. See [Narrative](LANTERN_NARRATIVE.md) and
[Save migration evidence](VISUAL_NOVEL_SAVE_REVISION.md).

### Recorded standard playtest checkpoint

At this checkpoint, the standard macOS Profile Demo ran from the isolated cache
`sdk/.pocket-build/lantern-playable-v4-strict-20261108/pocket_host.app` with PID 4789.
Embedded Lantern QJBC and PAK SHA-256 values were
`8defe742d93c066cabbaf7e2c8f665f854c05c8ee03c40e706f1578cae9cb962` and
`8126d148c8f71d573dbae11927647150d8d96922f88bab48074d018299369c08`. Root UI QJBC
and PAK values were `472720425817eb7f3153887d455ebf70b90515b951b0fe07ce4509ffdfdad89f`
and `5955143ed323987400f8db937ccf96f9206be94e5259479c8688b0710c7a4fba`.
Metal and the VM service were ready, the open activation request was accepted, and
Editor was closed. Foreground pixel inspection remained incomplete because the
computer-use native pipe could not start. Title-page and in-game visuals were
therefore unverified in that run. Strict v4 model Profile at 390×DPR2 and parallax
Profile passed in 50 and 22 seconds. The full four-way matrix remains evidence
from historical checkpoint e037. Run and build logs are
`/tmp/pocket-lantern-v4-playable.log` and `/tmp/pocket-lantern-v4-playable-build.log`.
The cached `playable.json` contains process and artifact fingerprints.

The `已读跳过` (Skip Read) control in parallax screenshots was initially thought to show a
single character. Later ROI pixel analysis found identical four-glyph masks in all
three images. That resolves this suspected missing glyph. Truncation and usability
checks for other interfaces remain separate. See [Parallax pixel acceptance](LANTERN_PARALLAX_FLUTTER.md).

## Content validation

`demo/js/apps/lantern/story.test.ts` executes the story using the Pocket VN engine.
It covers puzzle success, success after one retry, lockout after repeated failure,
last-train and stay-at-the-station endings, the timeout route, ending and CG
metadata, and save restoration. It imports the canonical JSON to detect drift
between the story source and TS type entry point. The core tests under
`sdk/packages/pocket_vn/test/` check shared behavior such as malformed-save
validation and preferences. Demo integration verifies the player-facing controls.

```sh
cd demo/js/apps/lantern
bun test story.test.ts
```

These tests verify that choices change variables, visible options, story position,
and ending metadata. Asset loading, audible host output, and compiled native guest
execution need their own tests.

## Real integration and acceptance entry points

- `demo/js/tests/novel_native.test.ts` compiles QJBC and PAK with the pinned
  toolchain and drives an actual native guest with pointers to reach all three
  endings. It also verifies save/load, rollback, skip read, stage changes, and
  audio requests. Actual sound output is tested separately.
- `novel_keyboard_native.test.ts` and `novel_viewport_native.test.ts` cover keyboard
  confirmation, choice, back, touch, and viewport. `spine_native.test.ts` checks
  official Spine execution and actual mesh changes.
- `demo/integration_test/novel_platform_test.dart` launches from the actual
  SystemHost and checks decoded texture pixels, model deformation, save/load,
  and lifecycle. The original Spine game passed on macOS, iOS, and Android
  simulators. See [Platform acceptance](VISUAL_NOVEL_PLATFORMS.md) and
  [Per-line voice](VISUAL_NOVEL_VOICE.md) for the final combined results covering
  per-line voice, replay, and waiting for completion. A real Windows run remains pending.
- The single `novel.locales.json` covers 77 English lines, 16 choices, three endings,
  and five replay titles. Switching languages preserves story position and
  preferences. Saves use original text and map it to the current language on load.
  `novel_voice_locale_native.test.ts` verifies Continue in a new guest.
  Persistence through an OS restart remains outside that check.
- `demo/integration_test/novel_audio_test.dart` verifies WAV transport and
  completion in the real player. Demo `ASSETS.md` records the original voice text
  and pinned offline synthesis tools.

The [full gap table](VISUAL_NOVEL_LETSGAL_PARITY.md) tracks the remaining editor,
presentation, and distribution capabilities against the market comparison.
