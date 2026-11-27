/* $20 Anime Battle — central game configuration.
   Everything here is a GAME-SPECIFIC conversion. VS Battles Wiki is a community power-scaling reference,
   not an official canon authority, and it has no "stars". Loaded by the page and by tools/*.mjs (Node). */
(function (g) {
  const ABC = g.ABC = g.ABC || {};
  ABC.config = {
    version: 1,

    /* Reference pages the ladders below were copied from (MediaWiki revision ids at time of copy). */
    sources: {
      tiering: { url: 'https://vsbattles.fandom.com/wiki/Tiering_System', revid: 9401765, checked: '2026-11-27' },
      speed: { url: 'https://vsbattles.fandom.com/wiki/Speed', revid: 9714659, checked: '2026-11-27' },
      attackPotency: { url: 'https://vsbattles.fandom.com/wiki/Attack_Potency' },
      profileFormat: { url: 'https://vsbattles.fandom.com/wiki/Standard_Format_for_Character_Profiles' },
      regeneration: { url: 'https://vsbattles.fandom.com/wiki/Regeneration' },
      intelligence: { url: 'https://vsbattles.fandom.com/wiki/Intelligence' },
      stamina: { url: 'https://vsbattles.fandom.com/wiki/Stamina' }
    },

    /* VS Battles tier ladder, weakest to strongest, with its own level names (Tiering System page). */
    tiers: [
      ['11-C', 'Low Hypoverse level'], ['11-B', 'Hypoverse level'], ['11-A', 'High Hypoverse level'],
      ['10-C', 'Below Average Human level'], ['10-B', 'Human level'], ['10-A', 'Athlete level'],
      ['9-C', 'Street level'], ['9-B', 'Wall level'], ['9-A', 'Small Building level'],
      ['8-C', 'Building level'], ['High 8-C', 'Large Building level'], ['8-B', 'City Block level'], ['8-A', 'Multi-City Block level'],
      ['Low 7-C', 'Small Town level'], ['7-C', 'Town level'], ['High 7-C', 'Large Town level'], ['Low 7-B', 'Small City level'],
      ['7-B', 'City level'], ['7-A', 'Mountain level'], ['High 7-A', 'Large Mountain level'],
      ['6-C', 'Island level'], ['High 6-C', 'Large Island level'], ['Low 6-B', 'Small Country level'], ['6-B', 'Country level'],
      ['High 6-B', 'Large Country level'], ['6-A', 'Continent level'], ['High 6-A', 'Multi-Continent level'],
      ['5-C', 'Moon level'], ['Low 5-B', 'Small Planet level'], ['5-B', 'Planet level'], ['5-A', 'Large Planet level'], ['High 5-A', 'Brown Dwarf level'],
      ['Low 4-C', 'Small Star level'], ['4-C', 'Star level'], ['High 4-C', 'Large Star level'], ['4-B', 'Solar System level'], ['4-A', 'Multi-Solar System level'],
      ['3-C', 'Galaxy level'], ['3-B', 'Multi-Galaxy level'], ['3-A', 'Universe level'], ['High 3-A', 'High Universe level'],
      ['Low 2-C', 'Universe level+'], ['2-C', 'Low Multiverse level'], ['2-B', 'Multiverse level'], ['2-A', 'Multiverse level+'],
      ['Low 1-C', 'Low Complex Multiverse level'], ['1-C', 'Complex Multiverse level'], ['High 1-C', 'High Complex Multiverse level'],
      ['1-B', 'Hyperverse level'], ['High 1-B', 'High Hyperverse level'], ['Low 1-A', 'Low Outerverse level'], ['1-A', 'Outerverse level'],
      ['High 1-A', 'High Outerverse level'], ['0', 'Boundless']
    ],

    /* Seven-star classification: game conversion from VS Battles tier NUMBERS. Score bands keep the old 1–100 range. */
    stars: {
      1: { name: 'Human', color: '#9098A5', majors: [10], lo: 1, hi: 14 },
      2: { name: 'Fighter', color: '#58B87B', majors: [9], lo: 15, hi: 29 },
      3: { name: 'Elite', color: '#55A5EE', majors: [8], lo: 30, hi: 44 },
      4: { name: 'Master', color: '#B18AF4', majors: [7], lo: 45, hi: 59 },
      5: { name: 'Legendary', color: '#EBA34D', majors: [6], lo: 60, hi: 74 },
      6: { name: 'Mythic', color: '#E96878', majors: [5, 4, 3], lo: 75, hi: 89 },
      7: { name: 'God Tier', color: '#E8CB79', majors: [2, 1, 0], lo: 90, hi: 100 }
    },
    /* Tier 11, Unknown, Varies, ranges, "likely/possibly" and estimates go to manual review (see PROJECT_PLAN.md). */
    manualReviewMajors: [11],

    /* Score = band.lo + round(span × (tierShare × tierPosition + secondaryShare × secondary)).
       tierPosition: the tier's place inside its star (0..1). "+" / "at least" / unquantified "higher" adds plusStep of one subtier. */
    scoring: { tierShare: 0.8, secondaryShare: 0.2, plusStep: 0.5 },

    /* Secondary factors only separate characters inside a star; each is 0..1, missing (null) factors are skipped
       and the remaining weights renormalised (missing never counts as zero). AP is NOT a secondary factor. */
    weights: { speed: 0.25, durability: 0.15, hax: 0.2, resistances: 0.1, regeneration: 0.1, intelligence: 0.1, stamina: 0.05, limitations: 0.05 },

    /* Speed ladder (Speed page, "Speed Levels" table + Other). COMBAT speed only; travel speed is never scored. */
    speedLadder: ['Immobile', 'Below Average Human', 'Average Human', 'Athletic Human', 'Peak Human', 'Superhuman',
      'Subsonic', 'Subsonic+', 'Transonic', 'Supersonic', 'Supersonic+', 'Hypersonic', 'Hypersonic+', 'High Hypersonic',
      'High Hypersonic+', 'Massively Hypersonic', 'Massively Hypersonic+', 'Sub-Relativistic', 'Sub-Relativistic+',
      'Relativistic', 'Relativistic+', 'Speed of Light', 'FTL', 'FTL+', 'Massively FTL', 'Massively FTL+', 'Infinite', 'Immeasurable'],
    /* Game calibration: the combat speed treated as "typical" for each star. Speed factor = 0.5 + (rank − expected) / 12, clamped 0..1. */
    speedExpected: { 1: 'Athletic Human', 2: 'Subsonic', 3: 'Supersonic+', 4: 'High Hypersonic', 5: 'Massively Hypersonic', 6: 'Relativistic', 7: 'Massively FTL+' },

    regenLadder: ['Low', 'Mid-Low', 'High-Low', 'Low-Mid', 'Mid', 'High-Mid', 'Low-High', 'Mid-High', 'High', 'Low-Godly', 'Mid-Godly', 'High-Godly'],
    intelLadder: ['Mindless', 'Instinctive', 'Animalistic', 'High Animalistic', 'Below Average', 'Average', 'Above Average', 'Gifted',
      'Genius', 'Extraordinary Genius', 'Supergenius', 'Nigh-Omniscient', 'Omniscient'],
    /* Stamina page levels plus wording profiles commonly use; game calibration 0..1. */
    staminaWords: [['Infinite', 1], ['Limitless', 1], ['Godlike', 0.9], ['Nigh-Infinite', 0.9], ['Extremely High', 0.8],
      ['Superhuman', 0.7], ['Very High', 0.7], ['High', 0.6], ['Peak Human', 0.5], ['Athletic', 0.4], ['Average', 0.25], ['Below Average', 0.1]],

    /* Hax: VS Battles ability page names that change a fight beyond raw stats. Factor = min(1, Σ weight / 3). */
    hax: {
      'Soul Manipulation': 1, 'Time Manipulation': 1, 'Time Stop': 1, 'Space-Time Manipulation': 1, 'Spatial Manipulation': 0.75,
      'BFR': 0.75, 'Sealing': 0.75, 'Power Nullification': 0.75, 'Mind Manipulation': 0.75, 'Durability Negation': 1,
      'Existence Erasure': 1.5, 'Causality Manipulation': 1.5, 'Fate Manipulation': 1.5, 'Reality Warping': 1.5,
      'Conceptual Manipulation': 1.5, 'Probability Manipulation': 0.75, 'Death Manipulation': 1, 'Absorption': 0.75,
      'Power Mimicry': 0.75, 'Matter Manipulation': 0.75, 'Necromancy': 0.5, 'Poison Manipulation': 0.5, 'Curse Manipulation': 0.5,
      'Paralysis Inducement': 0.5, 'Sleep Manipulation': 0.5, 'Illusion Creation': 0.5, 'Memory Manipulation': 0.5,
      'Precognition': 0.5, 'Acausality': 0.75, 'Information Analysis': 0.25, 'Body Control': 0.25, 'Gravity Manipulation': 0.5
    },
    /* Resistances factor = min(1, count / resistFull). */
    resistFull: 6,

    /* Character selection (data/draw.js). Appearance probability only — never touches power scores.
       starWeights: Classic-style tier weights (renormalised over tiers that still have characters).
       seriesSizeExponent: a series' weight inside a tier is (characters left in that tier)^exponent, so big series
         don't dominate (0 = every series equal, 1 = every character equal). maxCharacterBoost caps how much more likely
         one character in a small series can be than the tier's per-character average (before freshness).
       freshness: soft preference for series seen less this match: weight / (1 + freshness × (seen − fewest seen)).
       sameSeriesFactor: weight multiplier for the series drawn immediately before (only when others are available).
       recentFactor: weight multiplier for characters seen in recent completed matches (balanced draws only).
       recentMax: size of the bounded recent-character history. */
    draw: {
      starWeights: { 1: 0.10, 2: 0.15, 3: 0.20, 4: 0.25, 5: 0.17, 6: 0.10, 7: 0.03 },
      seriesSizeExponent: 0.5, maxCharacterBoost: 1.5, freshness: 0.75, sameSeriesFactor: 0.25, recentFactor: 0.35, recentMax: 300
    },

    /* Central series registry. `vs` = VS Battles category; `canon` = profile Origin values accepted as canonical for
       this series family (anything else — films, games, GT, crossovers — is excluded). `animeDone` = origins whose
       whole canon has been animated, so their versions count as shown in the anime; `mangaOnly` = origins the anime
       hasn't adapted. Every other origin gets anime status "unknown" (kept out of Anime only mode). `medium` = source. */
    series: {
      nar: { name: 'Naruto', color: '#ff8a1f', vs: 'Naruto', medium: 'manga', canon: ['Naruto', 'Naruto Shippuden', 'Boruto', 'Boruto: Naruto Next Generations', 'Boruto: Naruto Next Generation', 'Boruto: Two Blue Vortex'], animeDone: ['Naruto', 'Naruto Shippuden'], mangaOnly: ['Boruto: Two Blue Vortex'] },
      ble: { name: 'Bleach', color: '#ff5c7a', vs: 'Bleach', medium: 'manga', canon: ['Bleach'], animeDone: [], mangaOnly: [] },
      hxh: { name: 'Hunter x Hunter', color: '#7ed957', vs: 'Hunter X Hunter', medium: 'manga', canon: ['Hunter X Hunter', 'Hunter x Hunter'], animeDone: [], mangaOnly: [] },
      bc: { name: 'Black Clover', color: '#2ac3a2', vs: 'Black Clover', medium: 'manga', canon: ['Black Clover'], animeDone: [], mangaOnly: [] },
      sl: { name: 'Solo Leveling', color: '#6b8cff', vs: 'Solo Leveling', medium: 'manhwa', canon: ['Solo Leveling'], animeDone: [], mangaOnly: [] },
      sds: { name: 'The Seven Deadly Sins', color: '#e8c15a', vs: 'Nanatsu no Taizai', medium: 'manga', canon: ['Nanatsu no Taizai', 'Nanatsu No Taizai', 'Four Knights of the Apocalypse', 'Four Knights of The Apocalypse'], animeDone: ['Nanatsu no Taizai', 'Nanatsu No Taizai'], mangaOnly: [] },
      jjk: { name: 'Jujutsu Kaisen', color: '#b07bff', vs: 'Jujutsu Kaisen', medium: 'manga', canon: ['Jujutsu Kaisen', 'Jujutsu Kaisen.', 'Jujutsu Kaisen: Modulo'], animeDone: [], mangaOnly: ['Jujutsu Kaisen: Modulo'] },
      ft: { name: 'Fairy Tail', color: '#ff7043', vs: 'Fairy Tail', medium: 'manga', canon: ['Fairy Tail'], animeDone: [], mangaOnly: [] },
      op: { name: 'One Piece', color: '#e53935', vs: 'One Piece', medium: 'manga', canon: ['One Piece'], animeDone: [], mangaOnly: [] },
      db: { name: 'Dragon Ball', color: '#ffb300', vs: 'Dragon Ball', medium: 'manga', canon: ['Dragon Ball', 'Dragon Ball Z', 'Dragon Ball Super', 'Dragon Ball Super: Super Hero', 'Dragon Ball Super: Broly', 'Dragon Ball Daima'], animeDone: ['Dragon Ball', 'Dragon Ball Z', 'Dragon Ball Super: Super Hero', 'Dragon Ball Super: Broly', 'Dragon Ball Daima'], mangaOnly: [], animeOrigins: ['Dragon Ball Daima', 'Dragon Ball Super: Super Hero', 'Dragon Ball Super: Broly'] },
      ds: { name: 'Demon Slayer', color: '#26a69a', vs: 'Demon Slayer: Kimetsu No Yaiba', medium: 'manga', canon: ['Demon Slayer: Kimetsu No Yaiba'], animeDone: [], mangaOnly: [] },
      aot: { name: 'Attack on Titan', color: '#a1887f', vs: 'Attack on Titan', medium: 'manga', canon: ['Attack on Titan'], animeDone: ['Attack on Titan'], mangaOnly: [] },
      fma: { name: 'Fullmetal Alchemist: Brotherhood', color: '#c62828', vs: 'Fullmetal Alchemist', medium: 'manga', canon: ['Fullmetal Alchemist', 'Fullmetal Alchemist: Brotherhood'], animeDone: ['Fullmetal Alchemist', 'Fullmetal Alchemist: Brotherhood'], mangaOnly: [] },
      ff: { name: 'Fire Force', color: '#ff5722', vs: 'Enen no Shouboutai', medium: 'manga', canon: ['Enen no Shouboutai'], animeDone: [], mangaOnly: [] },
      mha: { name: 'My Hero Academia', color: '#43a047', vs: 'My Hero Academia', medium: 'manga', canon: ['My Hero Academia', 'My Hero Academia: Vigilantes'], animeDone: [], mangaOnly: [] },
      vin: { name: 'Vinland Saga', color: '#90a4ae', vs: 'Vinland Saga', medium: 'manga', canon: ['Vinland Saga'], animeDone: [], mangaOnly: [] },
      opm: { name: 'One Punch Man', color: '#fdd835', vs: 'One-Punch Man', medium: 'manga', canon: ['One-Punch Man', 'One Punch Man'], animeDone: [], mangaOnly: [] },
      dn: { name: 'Death Note', color: '#9e9e9e', vs: 'Death Note', medium: 'manga', canon: ['Death Note'], animeDone: ['Death Note'], mangaOnly: [] },
      cote: { name: 'Classroom of the Elite', color: '#7986cb', vs: 'Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e', medium: 'novel', canon: ['Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e'], animeDone: [], mangaOnly: [] }
    },
    media: ['anime', 'manga', 'manhwa', 'novel'],                       // novel: Classroom of the Elite (light novel)
    animeStatus: ['shown', 'not-shown', 'anime-only', 'unknown'],      // unknown = not confirmed; excluded from Anime only
    statuses: ['verified', 'imported', 'legacy', 'needs-review', 'excluded'],
    imageBase: 'https://s4.anilist.co/file/anilistcdn/character/large/'
  };
})(typeof window !== 'undefined' ? window : globalThis);
