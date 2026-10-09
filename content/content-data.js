/*
  THE ONE CONTENT FILE
  The website reads this list on every page. "rank" controls the shared
  homepage / unfiltered-gallery order (lowest number appears first).
  Edit it with editor.html, then replace this file with its exported copy.
*/
window.PORTFOLIO_CONTENT = {
  artist: {
    name: "NOVA//VOID",
    role: "Digital artist · motion designer · VJ · game developer",
    email: "hello@novavoid.art",
    bio: "I build loud moving worlds across screens, stages, and playable spaces. My work lives somewhere between rave flyers, broken game menus, and the moment before a system overloads.",
    socials: [
      { label: "Instagram", url: "https://instagram.com/" },
      { label: "Vimeo", url: "https://vimeo.com/" },
      { label: "YouTube", url: "https://youtube.com/" }
    ]
  },
  projects: [
    { id: "neon-prayer", rank: 1, title: "NEON PRAYER", year: "2026", type: "video", ratio: "portrait", tags: ["motion", "trailers"], description: "A vertical title sequence for an imaginary arcade apocalypse.", credits: "Direction, design, animation", media: "assets/neon-prayer.svg", videoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4", accent: "red" },
    { id: "pressure-system", rank: 2, title: "PRESSURE SYSTEM", year: "2026", type: "video", ratio: "wide", tags: ["live", "motion"], description: "Reactive visual loops built to punch through a warehouse sound system.", credits: "Resolume composition, visuals", media: "assets/pressure-system.svg", videoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4", accent: "blue" },
    { id: "kill-screen", rank: 3, title: "KILL SCREEN", year: "2025", type: "image", ratio: "square", tags: ["games", "trailers"], description: "A game-world key art study with a damaged scorekeeping interface.", credits: "Art direction, UI, world design", media: "assets/kill-screen.svg", accent: "yellow" },
    { id: "night-drive", rank: 4, title: "NIGHT DRIVE_00", year: "2025", type: "video", ratio: "landscape", tags: ["live", "motion"], description: "An endless highway visual set, made for a midnight DJ run.", credits: "Live visual system", media: "assets/night-drive.svg", videoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4", accent: "red" },
    { id: "soft-crash", rank: 5, title: "SOFT CRASH", year: "2025", type: "image", ratio: "tall", tags: ["motion"], description: "A poster experiment about a friendly catastrophe.", credits: "Typography, illustration", media: "assets/soft-crash.svg", accent: "blue" },
    { id: "afterparty", rank: 6, title: "AFTERPARTY.EXE", year: "2024", type: "video", ratio: "wide", tags: ["live", "games"], description: "A glitched closing sequence for people who missed the last train.", credits: "Visual design, programming", media: "assets/afterparty.svg", videoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4", accent: "yellow" },
    { id: "boss-rush", rank: 7, title: "BOSS RUSH", year: "2024", type: "image", ratio: "portrait", tags: ["games", "trailers"], description: "A trailer concept for a game that refuses to be defeated.", credits: "Game development, trailer edit", media: "assets/boss-rush.svg", accent: "red" },
    { id: "signal-lost", rank: 8, title: "SIGNAL LOST", year: "2024", type: "video", ratio: "square", tags: ["motion", "live"], description: "Signal fragments performed as a modular audio-reactive set.", credits: "Motion system", media: "assets/signal-lost.svg", videoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4", accent: "blue" }
  ]
};
