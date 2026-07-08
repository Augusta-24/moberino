# Signal Drift Memory

- Signal Drift is a pentatonic live-capture looper: every successful action plays now and stamps into the nearest step of a 24-step loop.
- Layer order is DRUMS -> BASS -> KEYS -> CHIMES -> SWELL.
- Count-in is framed as LAY THE KICK. Four player kick taps set tempo; `beatMs` is one loop step, so displayed BPM is based on `beatMs * 4`.
- Count-in kicks are permanent foundation kicks on drum downbeats. The first tapped kicks appear in loop row 1 immediately.
- BASS and KEYS use direct rock tapping. Tapping a rock plays and stamps it; missed rocks drifting past the bottom remain rests.
- Legacy ship, bullet, and steering code paths remain in `js/games/signal.js` dormant for a future boss-duet finale.
- CHIMES and SWELL remain hold-and-pull orb layers.
