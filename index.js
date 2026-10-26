require("dotenv").config();
const { createAgent } = require("./core");

// ══════════════════════════════════════════════════════════
//  CONTROLS — only edit this block
// ══════════════════════════════════════════════════════════
const CONFIG = {
  AGENT_NAME:        "Daily Tech Digest",
  AGENT_EMOJI:       "🌐",
  THEME_COLOR:       "#22d3ee",
  DIGEST_DIR:        "digests/tech",
  TIME_WINDOW_HOURS: 48,
  ITEMS_PER_FEED:    10,
  SNIPPET_LENGTH:    350,
  MODEL:             "gemini-2.5-flash",
  MAX_RETRIES:       3,
  MIN_STORIES:       10,
  MAX_STORIES:       15,
  EMAIL_FROM:        "contact@tccards.tn",
  IMPACT_VERBS:      "Lets / Makes / Gives / Cuts / Adds / Brings / Signals / Shifts",

  // ─── FEEDS (Global, tech-first) ─────────────────────────
  FEEDS: [
    // US
    "https://feeds.arstechnica.com/arstechnica/index",             // Ars Technica – deep tech, hardware, science
    "https://www.theverge.com/rss/index.xml",                      // The Verge – consumer tech
    "https://techcrunch.com/feed/",                                // TechCrunch – startups, AI, venture
    "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", // NYT Technology
    "https://feeds.a.dj.com/rss/RSSWSJD.xml",                      // WSJ Tech
    "https://www.cnet.com/rss/news/",                              // CNET – general tech news
    "https://www.wired.com/feed/rss",                              // Wired
    "https://www.engadget.com/rss.xml",                            // Engadget – gadgets and launches
    "https://www.tomshardware.com/feeds/all",                      // Tom's Hardware – chips, PC hardware
    "https://www.techradar.com/rss",                               // TechRadar – products

    // Europe and UK
    "http://feeds.bbci.co.uk/news/technology/rss.xml",             // BBC Technology
    "https://www.theregister.com/headlines.rss",                   // The Register – IT, deep and sharp
    "https://tech.eu/feed/",                                       // Tech.eu – European startups (may block bots)
    "https://www.theguardian.com/us/technology/rss",               // The Guardian Technology

    // Asia-Pacific
    "https://asia.nikkei.com/rss/feed/nar",                        // Nikkei Asia – Japan, SE Asia, semiconductors
    "https://technode.com/feed/",                                  // TechNode – China tech ecosystem
    "https://www.scmp.com/rss/91/feed",                            // SCMP Tech – Hong Kong, SE Asia
    "https://www.techinasia.com/feed",                             // Tech in Asia – SE Asia startups (may block bots)

    // Security and privacy
    "https://krebsonsecurity.com/feed/",                           // Krebs on Security
    "https://www.troyhunt.com/rss/",                               // Troy Hunt
    "https://www.bleepingcomputer.com/feed/",                      // BleepingComputer – daily security news

    // Developers and deep tech
    "https://hnrss.org/frontpage",                                 // Hacker News front page
    "https://simonwillison.net/atom/everything/",                  // Simon Willison – AI, LLMs, Python
    "https://www.jeffgeerling.com/blog.xml",                       // Jeff Geerling – DevOps, hardware, Raspberry Pi

    // Enterprise and cloud
    "https://www.infoworld.com/feed/",                             // InfoWorld – enterprise IT, cloud
    "https://www.zdnet.com/news/rss.xml",                          // ZDNet – enterprise tech
  ],

  // ─── EXCLUDE KEYWORDS (Pre-filter) ─────────────────────
  // Removed BEFORE Gemini sees them. Whole-word match.
  // Tech business (funding, acquisitions, earnings, lawsuits) is now ALLOWED.
  // Only clearly non-tech noise is dropped here.
  EXCLUDE_KEYWORDS: [
    "celebrity", "horoscope", "recipe", "fashion", "lifestyle",
    "sports", "nfl", "nba", "soccer", "box office",
  ],

  // ─── CATEGORIES ─────────────────────────────────────────
  CATEGORIES: "Smartphone|Laptop|Tablet|AI|Gaming|Chip|Wearable|Software|Auto|Home|Camera|Audio|Security|Enterprise|Cloud|Policy|Semiconductor|Developer|Startup|Business|Other",

  // ─── RANK CRITERIA (global, tech first) ─────────────────
  RANK_CRITERIA: [
    "1. Major product, hardware, or OS launches with real specs, price, or availability",
    "2. AI models, tools, and features people can use today",
    "3. Chips, semiconductors, and compute news that moves the industry",
    "4. Security vulnerabilities and breaches with confirmed impact (CVEs, 0-days)",
    "5. Big tech business with real industry impact: major acquisitions, large funding rounds, earnings from big tech, major lawsuits and antitrust actions",
    "6. Software and platform updates rolling out now",
    "7. Tech policy and regulation worldwide (EU, US, China, India, etc.)",
    "8. Enterprise, cloud, and developer news with broad impact",
    "9. Everything else tech-related, including community picks (Hacker News, dev blogs)",
  ].join("\n"),

  // ─── INCLUDE RULES ──────────────────────────────────────
  INCLUDE_RULES: [
    "- It is about technology: products, software, AI, chips, security, internet, or the tech industry",
    "- It matters to a global tech audience, from any region of the world",
    "- It is recent news from the last 48 hours",
    "- It states real facts, not rumor",
  ].join("\n"),

  // ─── EXCLUDE RULES ──────────────────────────────────────
  EXCLUDE_RULES: [
    "- Not about technology (general politics, sports, entertainment, lifestyle)",
    "- Pure speculation or rumor (reportedly, could, might, leaked)",
    "- Shopping deals, coupons, and product-review roundups",
    "- Crypto / NFT price news (unless tied to a major tech story)",
  ].join("\n"),
};
// ══════════════════════════════════════════════════════════

createAgent(CONFIG).run().catch(err => { console.error("Fatal:", err); process.exit(1); });
