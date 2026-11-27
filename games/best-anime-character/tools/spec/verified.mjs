// Verified test dataset: the human decisions for each version (which VS Battles page + key, medium,
// anime status, artwork). Statistics come from the cached VS Battles revision via tools/vsb.mjs.
// `animeChecked: false` marks an anime-coverage call that still needs a person to confirm.
export default [
  { charId: 'sung-jinwoo', name: 'Sung Jinwoo', alt: ['Sung Jin-Woo', 'Shadow Monarch'], series: 'sl', img: 'Sung Jinwoo',
    continuity: 'Solo Leveling (web novel / manhwa canon)', versions: [
      { v: 'awakened', form: 'E-Rank Hunter', vsb: ['Sung Jin-Woo (Novel)', 'Awakened'], medium: 'manhwa', anime: 'shown', animeChecked: true },
      { v: 'black-heart', form: 'Black Heart', vsb: ['Sung Jin-Woo (Novel)', 'Black Heart'], medium: 'manhwa', anime: 'shown', animeChecked: false,
        animeNote: 'Assumes Season 2 adapted the Demon Castle arc; confirm.' },
      { v: 'true-shadow-monarch', form: 'True Shadow Monarch', vsb: ['Sung Jin-Woo (Novel)', 'True Shadow Monarch'], medium: 'manhwa', anime: 'not-shown', animeChecked: true }
    ] },
  { charId: 'nobara-kugisaki', name: 'Nobara Kugisaki', alt: [], series: 'jjk', img: 'Nobara Kugisaki',
    continuity: 'Jujutsu Kaisen (manga canon)', versions: [
      { v: 'shibuya', form: 'Shibuya Incident', vsb: ['Nobara Kugisaki', 'Shibuya Incident Arc'], medium: 'manga', anime: 'shown', animeChecked: true }
    ] },
  { charId: 'kento-nanami', name: 'Kento Nanami', alt: ['Nanami'], series: 'jjk', img: 'Kento Nanami',
    continuity: 'Jujutsu Kaisen (manga canon)', versions: [
      { v: 'base', form: 'Grade 1 Sorcerer', vsb: ['Kento Nanami', ''], medium: 'manga', anime: 'shown', animeChecked: true }
    ] },
  { charId: 'hisoka-morow', name: 'Hisoka Morow', alt: ['Hisoka'], series: 'hxh', img: 'Hisoka Morow',
    continuity: 'Hunter x Hunter (manga canon)', versions: [
      { v: 'base', form: 'Bungee Gum', vsb: ['Hisoka Morow', ''], medium: 'manga', anime: 'shown', animeChecked: true }
    ] },
  { charId: 'satoru-gojo', name: 'Satoru Gojo', alt: ['Gojo'], series: 'jjk', img: 'Satoru Gojo',
    continuity: 'Jujutsu Kaisen (manga canon)', versions: [
      { v: 'hidden-inventory', form: 'Hidden Inventory', vsb: ['Satoru Gojo', 'Past'], medium: 'manga', anime: 'shown', animeChecked: true },
      { v: 'shinjuku-showdown', form: 'Shinjuku Showdown', vsb: ['Satoru Gojo', 'Present'], medium: 'manga', anime: 'not-shown', animeChecked: true,
        animeNote: 'VS key "Present" runs to the Shinjuku Showdown, which the anime has not adapted.' }
    ] },
  { charId: 'byakuya-kuchiki', name: 'Byakuya Kuchiki', alt: [], series: 'ble', img: 'Byakuya Kuchiki',
    continuity: 'Bleach (manga canon)', versions: [
      { v: 'post-royal-guard', form: 'Post-Royal Guard Training', vsb: ['Byakuya Kuchiki', 'Post-Royal Guard Training'], medium: 'manga', anime: 'shown', animeChecked: true }
    ] },
  { charId: 'asta', name: 'Asta', alt: [], series: 'bc', img: 'Asta',
    continuity: 'Black Clover (manga canon)', versions: [
      { v: 'judgment-day', form: 'Zetten (Judgment Day)', vsb: ['Asta (Final Saga)', 'Judgment Day Arc'], medium: 'manga', anime: 'not-shown', animeChecked: true }
    ] },
  { charId: 'naruto-uzumaki', name: 'Naruto Uzumaki', alt: ['Seventh Hokage'], series: 'nar', img: 'Naruto Uzumaki',
    continuity: 'Naruto / Boruto (manga canon)', versions: [
      { v: 'six-paths', form: 'Six Paths Sage Mode', vsb: ['Naruto Uzumaki (Part II: War Arc)', 'Six Paths'], medium: 'manga', anime: 'shown', animeChecked: true },
      { v: 'baryon-mode', form: 'Baryon Mode', vsb: ['Naruto Uzumaki (New Era)', 'New Era'], medium: 'manga', anime: 'shown', animeChecked: true }
    ] },
  { charId: 'meliodas', name: 'Meliodas', alt: [], series: 'sds', img: 'Meliodas',
    continuity: 'The Seven Deadly Sins (manga canon)', versions: [
      { v: 'post-purgatory', form: 'Post-Purgatory (Assault Mode)', vsb: ['Meliodas', 'Post-Purgatory'], medium: 'manga', anime: 'shown', animeChecked: true }
    ] },
  { charId: 'ichigo-kurosaki', name: 'Ichigo Kurosaki', alt: [], series: 'ble', img: 'Ichigo Kurosaki',
    continuity: 'Bleach (manga canon)', versions: [
      { v: 'true-bankai', form: 'True Bankai', vsb: ['Ichigo Kurosaki (Post-Timeskip)', 'True Zanpakuto'], medium: 'manga', anime: 'shown', animeChecked: true },
      { v: 'merged-hollow', form: 'Merged Hollow Form', vsb: ['Ichigo Kurosaki (Post-Timeskip)', 'Merged Hollow Form'], medium: 'manga', anime: 'not-shown', animeChecked: false,
        animeNote: 'Final TYBW cour status not confirmed; treated as manga-only until checked.' }
    ] },
  { charId: 'yhwach', name: 'Yhwach', alt: ['Juha Bach'], series: 'ble', img: 'Yhwach',
    continuity: 'Bleach (manga canon)', versions: [
      { v: 'almighty-awakened', form: 'The Almighty (Awakened)', vsb: ['Yhwach', 'Almighty Awakened'], medium: 'manga', anime: 'shown', animeChecked: true },
      { v: 'soul-king-absorbed', form: 'Soul King Absorbed', vsb: ['Yhwach', 'Soul King Absorbed'], medium: 'manga', anime: 'not-shown', animeChecked: false,
        animeNote: 'Final TYBW cour status not confirmed; treated as manga-only until checked.' }
    ] }
];
