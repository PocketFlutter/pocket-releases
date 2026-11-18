# Per-Line Voice Acting and Autoplay

## Sources and Boundaries

The source review covered `playSynthTone` and mute controls in `pocketjs_flutter_demo/pocketjs_super_app_demo.html:923–953` and the retained `lib/`, `mini_apps/`, `native/`, and platform directories excluding `pocket_host/`. The original WebAudio oscillator offered no reusable per-line file playback or native completion callback. The JS-owned game state and thin native event boundary from `mini_apps/app_game_detail/main.js` remain in place. This work retains the single JS audio-intent adapter in `pocket_vn/src/audio.ts` and the just_audio asset allowlist in `pocket_audio`. It supplies the missing token correlation. Line IDs bind authored cues, audio assets resolve them, and actual completion events gate autoplay. See [Ren'Py voice](https://www.renpy.org/doc/html/voice.html) and [LetsGal voice management](https://docs.avg-engine.com/manual/writing/voice-management).

Authors add an optional `voice` cue to a `say` in the same `story.json` and map it to a WAV or other resource in `novel.assets.json.audio`. The Editor dialogue inspector uses the same registry to select or clear voice cues. Localization catalogs can resolve a logical cue to another registered resource.

## State and Event Flow

The engine snapshot's `voice` holds transient playback intent for the current line. Start, replay, load, and rollback each generate a new token. Native `media.audio.play` receives `playbackId`. The just_audio playerState/error boundary emits `media.audio.playback` with channel, playbackId, status, positionMs, and optional durationMs/error. Dart reports playback events without polling position. JS owns story, skipping, autoplay, and resume policy.

The JS adapter checks the current token and calls `engine.reportVoice()` asynchronously to avoid synchronous reentry while publishing a snapshot. Late events from old lines, players, and terminated tokens cannot advance a new line. A missing asset, unsupported host, or playback error ends the wait and reports the actual status. Music and voice reuse the existing queue. Language changes update the resource table. The next apply compares resolved assets and keeps unchanged background music playing.

Autoplay requires text completion, expiration of the autoplay interval, and voice completion. Waiting for voice disarms the story clock until the native completion event wakes it. Model animation uses the existing shared clock. Players retain manual advance and skip-read controls. Menus and lifecycle pauses pause voice. JS decides how to resume from current intent. Saves and rollback checkpoints omit native playback state and tokens. Loading restarts speech from the beginning of the line. Sample-accurate resume is unavailable.

## Original Example and Reproducible Generation

Lantern's Mira `arrival_02` has full Chinese and English dialogue bindings. `demo/js/apps/lantern/scripts/generate_voice.ts` reads the source story and sole `novel.locales.json`, then uses pinned eSpeak NG 1.52.0 source SHA-256 `bb4338102ff3b49a81423da8a1a158b420124b055b60fa76cfb4b18677130a23` for offline PCM16 mono 22050 Hz WAV generation. The recordings last 13.60 and 12.37 seconds, respectively. The compiler runs only in an ignored cache and runtime has no TTS dependency. The example uses synthesized speech. For sources and build tooling licenses, see Demo `ASSETS.md`.

## Verification and Remaining Coverage

- `pocket_vn/test/voice.test.ts` covers autoplay waiting for actual completion, distinct tokens for identical cues, late events, replay, manual and skip-read progression, pause, failure, new playback after load or rollback, and native event exclusion from saves.
- `pocket_vn/test/clock.test.ts` verifies that an expired auto interval schedules no story wake while voice plays and exactly one wake after completion.
- `bun test sdk/packages/pocket_vn/test demo/js/apps/lantern/localization.test.ts demo/js/apps/lantern/story.test.ts` passed 49 tests with 715 assertions, including nine audio adapter regressions.
- `pocket_audio_plugin_test.dart` passed 16 tests, with zero package analysis issues. Music and sound effects without playbackId have no state/error subscriptions. Voice replacement, resume, and stop are isolated by generation.
- `novel_voice_locale_native.test.ts` uses actual QJBC and pointer/button input to verify auto waiting, English UI and assets, replay, old-token isolation, save in the original language, English Continue in a fresh Guest, and full visibility with the keyboard. The protocol test injects host media completion.
- `demo/integration_test/novel_platform_test.dart` ran the same QJBC successfully on macOS, an iOS 27.2 simulator, and an Android API 35 ARM64 emulator. Actual just_audio decoding exercised menu pause, resume, replay, and completion through controller→JS adapter→engine→auto advance. It also verified texture pixels, model deformation, manual save/load, and background music restoration.

Final full-game logs `/tmp/pocket-voice-game-macos-final.log`, `/tmp/pocket-voice-game-ios-final.log`, and `/tmp/pocket-voice-game-android-final.log` each recorded 1 pass and 0 failures. The tested QJBC SHA-256 was `f68194c067936bd1240ac0cd93d61b644620e9374fee8892b7ca05a0b467cb9f`, and the PAK hash was `f1650c25ed6347b5d6f2c60272655e2451293bc88f6e9008d462382e0cc8299c`. The game source remains the authored project.

The full-game regression exposed a wait in the music resume command. Ordinary channels subscribed to extra state, and cancellation passed through an async* await-for conversion. The ablation removed subscriptions on ordinary channels and synchronously maps the voice event source. Final regressions on all three platforms verified the combined path. The resumed animation test searches frames for actual vertex movement, avoiding a comparison of only the endpoints of a loop.

Batch import and export, recording, recognition and matching, waveform clipping, and full cast coverage remain open. Autoplay waits only for author-bound voice cues. Unvoiced lines follow the ordinary text policy.
