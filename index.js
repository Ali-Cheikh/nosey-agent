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
  TIME_WINDOW_HOURS: 48,   // was 24 — matches the "last 48 hours" include rule
  ITEMS_PER_FEED:    10,
  SNIPPET_LENGTH:    350,
  MODEL:             "gemini-2.5-flash",
  MAX_RETRIES:       3,
  MIN_STORIES:       10,
  MAX_STORIES:       15,
  EMAIL_FROM:        "contact@tccards.tn",
  IMPACT_VERBS:      "Lets / Makes / Gives / Cuts / Adds / Brings / Signals / Shifts",

  // ─── FEEDS (International) ──────────────────────────────
  FEEDS: [
    // 🇺🇸 美国 (核心科技)
    "https://feeds.arstechnica.com/arstechnica/index",       // 深度科技、硬件、科学
    "https://www.theverge.com/rss/index.xml",                // 消费科技与文化
    "https://techcrunch.com/feed/",                          // 初创企业与风投
    "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", // 美国主流科技
    "https://feeds.a.dj.com/rss/RSSWSJD.xml",                // 华尔街日报科技 (商业/企业)
    "https://www.cnet.com/rss/news/",                        // 综合科技新闻
    "https://www.wired.com/feed/rss",                        // Wired – tech and culture (new)
    "https://www.engadget.com/rss.xml",                      // Engadget – gadgets and launches (new)
    "https://www.tomshardware.com/feeds/all",                // Tom's Hardware – chips, PC hardware (new)
    "https://www.techradar.com/rss",                         // TechRadar – products and reviews (new)

    // 🇪🇺 欧洲 & 英国
    "http://feeds.bbci.co.uk/news/technology/rss.xml",       // BBC 科技 (英国/全球)
    "https://www.theregister.com/headlines.rss",             // The Register (英国) – 辛辣、深度IT
    "https://tech.eu/feed/",                                 // 欧洲初创企业与风投 (was 403, retry with new headers)
    "https://www.theguardian.com/us/technology/rss",         // 卫报科技 (欧洲视角)
    // heise English feed returned 404 — removed

    // 🌏 亚太地区
    "https://asia.nikkei.com/rss/feed/nar",                  // 日经亚洲 – new URL (old one was 404)
    "https://technode.com/feed/",                            // TechNode – 中国科技生态
    "https://www.scmp.com/rss/91/feed",                      // 南华早报科技 – 香港/东南亚
    "https://www.techinasia.com/feed",                       // Tech in Asia (was 403, retry with new headers)

    // 🔐 安全与隐私
    "https://krebsonsecurity.com/feed/",                     // Krebs – 顶级安全记者
    "https://www.troyhunt.com/rss/",                         // Troy Hunt – 安全与隐私
    "https://www.bleepingcomputer.com/feed/",                // BleepingComputer – daily security news (new)

    // 🧠 开发者与深度技术
    "https://hnrss.org/frontpage",                           // Hacker News – 社区驱动
    "https://simonwillison.net/atom/everything/",            // Simon Willison – AI、LLM、Python
    "https://www.jeffgeerling.com/blog.xml",                 // Jeff Geerling – DevOps、硬件、树莓派

    // 🏢 企业级 & B2B
    "https://www.infoworld.com/feed/",                       // InfoWorld – 企业IT、云计算
    "https://www.zdnet.com/news/rss.xml",                    // ZDNet – 企业科技与评测
  ],

  // ─── EXCLUDE KEYWORDS (Pre-filter) ─────────────────────
  // These are removed BEFORE Gemini sees them (deterministic filter)
  // Matched as WHOLE WORDS now, so "ipo" no longer catches "tripod" etc.
  EXCLUDE_KEYWORDS: [
    // Business noise (still exclude these)
    "earnings", "quarterly results", "ipo", "acquires", "acquisition",
    "funding round", "series a", "series b", "valuation",
    "sec filing", "antitrust", "lawsuit", "layoffs", "laid off",
    "shares rose", "shares fell", "market cap", "analyst rating",
    "patent", "trademark", "merger",

    // Celebrity / lifestyle / sports (international noise)
    "celebrity", "entertainment", "sports", "lifestyle", "fashion",
    "travel", "horoscope", "recipe", "food", "movie", "film", "music",
  ],

  // ─── CATEGORIES (Expanded) ──────────────────────────────
  CATEGORIES: "Smartphone|Laptop|Tablet|AI|Gaming|Chip|Wearable|Software|Auto|Home|Camera|Audio|Security|Enterprise|Cloud|Policy|Semiconductor|Developer|Startup|Other",

  // ─── RANK CRITERIA (International-focused) ──────────────
  RANK_CRITERIA: [
    "1. Major product launches with confirmed specs, price, and global availability",
    "2. Major OS or platform releases available to download now worldwide",
    "3. AI tools or features consumers and developers can use today",
    "4. Hardware announcements with confirmed ship dates and international availability",
    "5. Software features rolling out now globally",
    "6. Security vulnerabilities or breaches with confirmed impact (CVEs, 0-days)",
    "7. Semiconductor, chip, or supply chain news affecting global markets",
    "8. EU or international policy/regulation affecting tech (GDPR, AI Act, etc.)",
    "9. Enterprise/cloud announcements with significant global impact",
    "10. Everything else — community-driven (Hacker News, developer blogs)",
  ].join("\n"),

  // ─── INCLUDE RULES (International) ──────────────────────
  INCLUDE_RULES: [
    "- Directly affects consumers, developers, or enterprises globally",
    "- Real product, feature, or security update someone can use or act on",
    "- Announced or released within the last 48 hours",
    "- Has concrete details: specs, price, release date, CVE, or demo",
    "- Has international or multi-region relevance (not US-only)",
  ].join("\n"),

  // ─── EXCLUDE RULES (International) ──────────────────────
  EXCLUDE_RULES: [
    "- Business-only: acquisitions, earnings, IPO, funding, layoffs (unless product impact)",
    "- Legal-only: lawsuits, regulation without clear tech impact",
    "- Speculation: reportedly, could, might, leaked, patents",
    "- Crypto / NFT / blockchain (unless directly tied to major tech)",
    "- Pure enterprise/B2B with no broad impact or consumer/developer angle",
    "- US-only politics or regional news without international tech relevance",
  ].join("\n"),
};
// ══════════════════════════════════════════════════════════

createAgent(CONFIG).run().catch(err => { console.error("Fatal:", err); process.exit(1); });
