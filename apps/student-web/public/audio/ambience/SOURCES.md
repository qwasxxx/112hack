# Ambience asset sources

Downloaded 2026-09-25 and re-encoded locally the same day for System-112 training.

Runtime uses only these files under `apps/student-web/public/audio/ambience/`.
No remote audio is fetched while a call is running.

All selected works are Creative Commons Zero or public domain.
Attribution is not legally required. Authors are recorded for provenance.

| Filename | Original source | Author | License | Attribution required | Download date |
|---|---|---|---|---|---|
| `fire_loop.mp3` | https://freesound.org/people/NickTayloe/sounds/813328/ | NickTayloe | CC0 1.0 | No | 2026-09-26 |
| `traffic_accident_loop.mp3` | https://commons.wikimedia.org/wiki/File:Cars_passing_over_bridge.ogg | Dsw4 | Public domain | No | 2026-09-25 |
| `street_crowd_loop.mp3` | https://commons.wikimedia.org/wiki/File:1_minute_at_the_alexa_mall_in_berlin.ogg | thore / PDSounds | Public domain | No | 2026-09-25 |
| `argument_crowd_loop.mp3` | https://freesound.org/people/lextrack/sounds/264515/ | lextrack | CC0 1.0 | No | 2026-09-25 |
| `gas_building_loop.mp3` | https://freesound.org/people/leonelmail/sounds/427851/ | leonelmail | CC0 1.0 | No | 2026-09-25 |
| `medical_room_loop.mp3` | https://freesound.org/people/aleclubin/sounds/641306/ | aleclubin | CC0 1.0 | No | 2026-09-25 |
| `urban_infrastructure_loop.mp3` | https://commons.wikimedia.org/wiki/File:Sunday_in_the_city_street_noise1.ogg | cori / PDSounds | Public domain | No | 2026-09-25 |
| `water_emergency_loop.mp3` | https://freesound.org/people/jodybruchon/sounds/475215/ | jodybruchon | CC0 1.0 | No | 2026-09-25 |
| `generic_emergency_loop.mp3` | https://freesound.org/people/leonelmail/sounds/427851/ (later section) | leonelmail | CC0 1.0 | No | 2026-09-25 |
| `distant_siren_loop.mp3` | https://commons.wikimedia.org/wiki/File:American_police_siren_i.ogg | lezer / PDSounds | Public domain | No | 2026-09-25 |
| `explosion_oneshot.mp3` | https://freesound.org/people/Deganoth/sounds/165910/ | Deganoth | CC0 1.0 | No | 2026-09-25 |
| `collision_oneshot.mp3` | https://freesound.org/people/squareal/sounds/237375/ | squareal | CC0 1.0 | No | 2026-09-25 |
| `fire_voices_loop.mp3` | Mixed locally from CC0 recordings: https://freesound.org/people/IENBA/sounds/491405/ , https://freesound.org/people/guamorims/sounds/391365/ , https://freesound.org/people/Fabrizio84/sounds/457961/ , https://opengameart.org/content/crowd-shoutingspeaking-ambience | IENBA; guamorims; Fabrizio84; StarNinjas | CC0 1.0 | No | 2026-09-26 |

Notes:

- Freesound items were taken from the published CC0 preview encodes of the original recordings.
- Wikimedia/PDSounds files were downloaded from `upload.wikimedia.org` originals.
- Local processing on 2026-09-25: mono 44.1 kHz 160 kbps MP3, loudness-matched, short loop crossfade. Collision and explosion remain one-shots and are never looped.
- `fire_loop.mp3` is a small wood-wick crackle (not a large blaze), encoded gently so pops stay natural. Playback is quieter and phone-band limited.
- Crowd/mall material is walla / murmuring, not clear Russian dialogue.
- `fire_voices_loop.mp3` is real recorded shouts behind the caller on every call except QUIET: full level on ticket 1.1, 20% quieter everywhere else. Phone-band limited.
- No asset in this folder is fetched from the internet at runtime.
