const { GoogleGenerativeAI } = require("@google/generative-ai");
const Parser                 = require("rss-parser");
const { Resend }             = require("resend");
const fs                     = require("fs");
const path                   = require("path");

function createAgent(CONFIG) {
  const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model  = genAI.getGenerativeModel({ model: CONFIG.MODEL || "gemini-2.5-flash" });
  // Browser-like headers: fixes most "403" feeds
  const parser = new Parser({
    timeout: 15000,
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; DigestBot/1.0; +https://github.com)",
      "Accept":     "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
  });
  const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY) : null;

  // RSS Fetch 
  async function fetchRSS() {
    const cutoff = Date.now() - (CONFIG.TIME_WINDOW_HOURS || 48) * 3600000;
    const items  = [];
    for (const url of CONFIG.FEEDS) {
      try {
        const feed   = await parser.parseURL(url);
        const recent = feed.items
          // Atom feeds have isoDate but no pubDate — accept either
          .filter(i => { const d = i.isoDate || i.pubDate; return d && new Date(d) > cutoff; })
          .slice(0, CONFIG.ITEMS_PER_FEED || 10)
          .map(i => ({
            title:   (i.title   || "").trim(),
            source:  feed.title,
            pubDate: i.isoDate || i.pubDate,
            link:    i.link || "",
            snippet: (i.contentSnippet || i.summary || "")
                       .slice(0, CONFIG.SNIPPET_LENGTH || 350).trim(),
          }));
        items.push(...recent);
        console.log("  ✓ " + feed.title + " (" + recent.length + ")");
      } catch (e) { console.warn("  ✗ " + url + ": " + e.message); }
    }
    return items;
  }

  // Filter - whole-word matching so "ipo" doesn't hit "tripod", "film" doesn't hit "filmmaker", etc.
  function preFilter(items) {
    const kw     = (CONFIG.EXCLUDE_KEYWORDS || []).map(k =>
      new RegExp("\\b" + k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"));
    const before = items.length;
    const out    = kw.length
      ? items.filter(i => !kw.some(r => r.test(i.title + " " + i.snippet)))
      : items;
    console.log("  Pre-filter: " + before + " → " + out.length + " (−" + (before - out.length) + ")");
    return out;
  }

  // Dups remover and jokers ditector, sort by source count
  function wordSet(s) {
    return new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w=>w.length>3));
  }
  function jaccard(a, b) {
    const sA = wordSet(a), sB = wordSet(b);
    if (!sA.size && !sB.size) return 1;
    return [...sA].filter(w => sB.has(w)).length / new Set([...sA,...sB]).size;
  }
  function deduplicate(items) {
    const groups = [];
    for (const item of items) {
      const match = groups.find(g => jaccard(item.title, g.title) >= 0.45);
      if (match) {
        match.sources.add(item.source);
        if (item.snippet) match.snippets.push(item.snippet);
      } else {
        groups.push({ title: item.title, link: item.link, pubDate: item.pubDate,
          sources: new Set([item.source]),
          snippets: item.snippet ? [item.snippet] : [] });
      }
    }
    // Most-covered stories first
    return groups.sort((a, b) => b.sources.size - a.sources.size);
  }

  // prompt Builder (can be prettier)
  function buildPromptInput(groups) {
    return groups.map((g, i) => {
      const src = g.sources.size > 1
        ? "[" + g.sources.size + " outlets: " + [...g.sources].join(", ") + "]"
        : "[" + [...g.sources][0] + "]";
      return (i+1) + ". " + g.title + "\n   " + src + "\n   " + (g.snippets[0] || "(no snippet)");
    }).join("\n\n");
  }

  // let GEM give us its opinion
  async function analyzeNews(groups, rawCount, date) {
    const MIN = CONFIG.MIN_STORIES || 8;
    const MAX = CONFIG.MAX_STORIES || 12;

    const buildPrompt = (extra) => [
      "You are a senior " + CONFIG.AGENT_NAME + " editor. Today is " + date + ".",
      groups.length + " unique stories deduplicated from " + rawCount + " RSS entries.",
      "Stories with more outlets are more newsworthy.\n",
      "TASK: Select " + MIN + "–" + MAX + " most important stories, ranked #1 first.\n",
      "RANKING CRITERIA:\n" + CONFIG.RANK_CRITERIA + "\n",
      "INCLUDE (story must meet ALL):\n" + CONFIG.INCLUDE_RULES + "\n",
      "EXCLUDE (any of these = skip immediately):\n" + CONFIG.EXCLUDE_RULES + "\n",
      "RULES:",
      "- Base decisions ONLY on information in the snippets.",
      "- If you are unsure, leave the story out rather than guess.",
      "- Headlines: present tense, max 8 words, no 'reportedly/could/might/leaked'.",
      "- Summaries: max 15 words, state what happened, not what might happen.",
      "- why_it_matters: must start with a verb — " + (CONFIG.IMPACT_VERBS || "Lets / Makes / Gives / Cuts / Adds") + ".\n",
      "STORIES:\n" + buildPromptInput(groups) + "\n",
      "OUTPUT — critical: return ONLY a JSON array. Start with [ and end with ].",
      "No markdown. No backticks. No explanation. No text before or after.",
      'Schema: {"rank":1,"headline":"...","summary":"...","category":"' + CONFIG.CATEGORIES + '","source":"outlet","link":"https://...","source_count":2,"why_it_matters":"verb..."}',
    ].join("\n") + (extra || "");

    const MAX_R = CONFIG.MAX_RETRIES || 3;
    async function callModel(prompt) {
      for (let i = 1; i <= MAX_R; i++) {
        try {
          const res   = await model.generateContent(prompt);
          const text  = res.response.text().replace(/\`\`\`(?:json)?/g, "").trim();
          const match = text.match(/\[[\s\S]*\]/);
          if (!match) throw new Error("No JSON array found in response");
          return JSON.parse(match[0]);
        } catch (e) {
          console.warn("  Attempt " + i + " failed: " + e.message);
          if (i === MAX_R) throw e;
          await new Promise(r => setTimeout(r, 2000 * i));
        }
      }
    }

    let stories = await callModel(buildPrompt());

    // Top-up: if Gemini came back under the minimum, ask once more
    if (stories.length < MIN && groups.length >= MIN) {
      console.log("   Only " + stories.length + " stories (min " + MIN + ") — asking Gemini to top up...");
      try {
        const more = await callModel(buildPrompt(
          "\n\nIMPORTANT: your previous answer had only " + stories.length + " stories. " +
          "You MUST return at least " + MIN + ". Fill the gap with the next-best stories " +
          "that still fit the INCLUDE rules, preferring well-sourced ones."
        ));
        if (more.length > stories.length) stories = more;
      } catch (e) { console.warn("  Top-up failed, keeping first result: " + e.message); }
    }
    return stories;
  }

  // HTML Email Builder — ranked cards + buzz meter
  // Transparent page: only the cards carry a background, so the email sits
  // naturally on a white OR dark inbox. All text lives inside solid cards.
  function buildHTML(stories, date) {
    const tc     = CONFIG.THEME_COLOR || "#6c8cff"; // accent
    const CARD   = "#171b26";
    const BORDER = "#2a3350";
    const WHITE  = "#ffffff";
    const SOFT   = "#9aa4bd";
    const MUTE   = "#7a85a3";
    const DIM    = "#3d4a73";
    const FOOT   = "#8a90a2"; // readable on white and dark
    const FONT   = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

    const esc = s => String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const safeUrl = u => /^https?:\/\//i.test(u || "") ? esc(u) : "";

    // Always-white clickable headline (arrow in accent)
    const headline = (s, size) => {
      const url   = safeUrl(s.link);
      const inner = '<span style="color:' + WHITE + ';font-size:' + size + 'px;font-weight:700;line-height:1.3;">' + esc(s.headline) + '</span>';
      return url
        ? '<a href="' + url + '" target="_blank" class="lnk" style="color:' + WHITE + ';text-decoration:none;">' +
          inner + ' <span style="color:' + tc + ';font-size:' + size + 'px;">&#8599;</span></a>'
        : inner;
    };

    // Buzz meter: filled dots = outlets covering the story (max 5)
    const meter = n => {
      const c = Math.min(Math.max(parseInt(n, 10) || 1, 1), 5);
      return '<span style="color:' + tc + ';">' + "●".repeat(c) + '</span>' +
             '<span style="color:' + BORDER + ';">' + "●".repeat(5 - c) + '</span>';
    };
    const outlets = s => (s.source_count > 1 ? s.source_count + " outlets" : "1 outlet");

    const spacer = '<div style="height:10px;line-height:10px;font-size:10px;">&nbsp;</div>';

    const shell = (inner, border) =>
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + CARD + '" ' +
      'style="background-color:' + CARD + ';border:1px solid ' + border + ';border-radius:12px;border-collapse:separate;">' +
      '<tr><td style="font-family:' + FONT + ';">' + inner + '</td></tr></table>';

    const header =
      shell(
        '<div style="padding:18px 16px 16px;">' +
          '<div style="font-family:' + FONT + ';font-size:22px;font-weight:800;color:' + WHITE + ';">' +
            esc(CONFIG.AGENT_EMOJI) + ' ' + esc(CONFIG.AGENT_NAME) + '</div>' +
          '<div style="font-family:' + FONT + ';font-size:11px;color:' + MUTE + ';margin-top:5px;">' +
            esc(date) + ' &middot; ' + stories.length + ' stories &middot; ranked by importance</div>' +
          '<div style="height:3px;line-height:3px;font-size:3px;background-color:' + tc + ';border-radius:2px;margin-top:14px;">&nbsp;</div>' +
        '</div>', BORDER);

    const card = (s, i) => {
      const top  = i === 0;
      const rank = String(i + 1).padStart(2, "0");
      return shell(
        '<div style="padding:' + (top ? "16px" : "13px 14px") + ';">' +
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
            '<td align="left" style="font-family:' + FONT + ';font-size:' + (top ? 26 : 18) + 'px;font-weight:800;color:' + (top ? tc : DIM) + ';line-height:1;">' + rank + '</td>' +
            '<td align="right" style="font-family:' + FONT + ';font-size:10px;color:' + SOFT + ';white-space:nowrap;">' + outlets(s) + ' &nbsp;' + meter(s.source_count) + '</td>' +
          '</tr></table>' +
          '<div style="height:8px;line-height:8px;font-size:8px;">&nbsp;</div>' +
          '<div style="font-family:' + FONT + ';">' + headline(s, top ? 18 : 15) + '</div>' +
          '<div style="font-family:' + FONT + ';font-size:' + (top ? 13 : 12) + 'px;color:' + SOFT + ';line-height:1.5;margin-top:6px;">' + esc(s.summary) + '</div>' +
          '<div style="font-family:' + FONT + ';font-size:12px;line-height:1.5;margin-top:6px;">' +
            '<span style="color:' + tc + ';font-weight:700;">Why it matters</span> ' +
            '<span style="color:' + SOFT + ';">' + esc(s.why_it_matters) + '</span></div>' +
          '<div style="font-family:' + FONT + ';font-size:10px;color:' + MUTE + ';letter-spacing:.08em;margin-top:8px;">' +
            esc(String(s.category || "").toUpperCase()) + ' &middot; ' + esc(s.source) + '</div>' +
        '</div>', top ? tc : BORDER);
    };

    const preheader = esc(stories[0].headline) + (stories.length > 1 ? " + " + (stories.length - 1) + " more stories" : "");

    return '<!DOCTYPE html><html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head>' +
      '<meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta name="color-scheme" content="light dark">' +
      '<meta name="supported-color-schemes" content="light dark">' +
      '<title>' + esc(CONFIG.AGENT_NAME) + ' — ' + esc(date) + '</title>' +
      '<style>' +
      ':root{color-scheme:light dark;supported-color-schemes:light dark;}' +
      'a{color:' + WHITE + ' !important;text-decoration:none !important;}' +
      'u + .body a{color:' + WHITE + ' !important;text-decoration:none !important;}' +
      'a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;}' +
      '[data-ogsc] .lnk,[data-ogsc] .lnk span{color:' + WHITE + ' !important;}' +
      '@media (max-width:620px){.wrap{width:100% !important;}}' +
      '</style></head>' +
      '<body class="body" style="margin:0;padding:0;">' +
      '<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;">' + preheader + '&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
      '<tr><td align="center" style="padding:20px 12px;">' +
      '<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">' +
      '<tr><td style="font-family:' + FONT + ';">' +
        header + spacer +
        stories.map((s, i) => card(s, i)).join(spacer) +
        '<div style="font-family:' + FONT + ';font-size:10px;color:' + FOOT + ';text-align:center;margin-top:18px;">auto-committed daily &middot; Gemini 2.5 Flash + RSS</div>' +
      '</td></tr></table>' +
      '</td></tr></table></body></html>';
  }

  // Plain-text fallback (used by clients that don't render HTML)
  function buildText(stories, date) {
    return CONFIG.AGENT_NAME + " — " + date + "\n\n" +
      stories.map((s, i) =>
        (i + 1) + ". " + s.headline + "\n   " + s.summary + "\n   Why it matters: " + s.why_it_matters +
        "\n   " + s.category + " · " + (s.source_count > 1 ? s.source_count + " outlets" : s.source) +
        (s.link ? "\n   " + s.link : "")
      ).join("\n\n");
  }

  // Markdown Files Builder
  function buildMarkdown(stories, date, slug) {
    const top  = stories[0];
    const rows = stories.map((s, i) =>
      "| " + (i+1) + " | [" + s.headline + "](" + s.link + ") | " + s.summary +
      " | " + s.category + " | " + (s.source_count > 1 ? s.source_count + " outlets" : s.source) +
      " | " + s.why_it_matters + " |"
    ).join("\n");
    return "# " + CONFIG.AGENT_EMOJI + " " + CONFIG.AGENT_NAME + " — " + date + "\n\n" +
      "> " + stories.length + " stories · " + slug + "\n\n" +
      "## 🔥 Top Story\n\n" +
      "**[" + top.headline + "](" + top.link + ")**  \n" +
      top.summary + "  \n💡 " + top.why_it_matters + "\n\n---\n\n" +
      "| # | Headline | Summary | Category | Sources | Why It Matters |\n" +
      "|---|----------|---------|----------|---------|----------------|\n" +
      rows + "\n";
  }

  // pretty styling
  function updateIndex(date, slug, count) {
    const dir = CONFIG.DIGEST_DIR || "digests";
    const p   = path.join(dir, "README.md");
    const h   = "# " + CONFIG.AGENT_EMOJI + " " + CONFIG.AGENT_NAME + " — Archive\n\n";
    const e   = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : h;
    if (!e.includes(slug))
      fs.writeFileSync(p, e + "- [" + date + "](./" + slug + ".md) — " + count + " stories\n");
  }

  // the supreme exe 
  async function run() {
    const date = new Date().toLocaleDateString("en-US",
      { weekday:"long", month:"long", day:"numeric", year:"numeric" });
    const slug = new Date().toISOString().split("T")[0];

    console.log("\n" + CONFIG.AGENT_EMOJI + "  " + CONFIG.AGENT_NAME + " — " + date + "\n");

    console.log("📡 Fetching RSS...");
    const raw = await fetchRSS();
    console.log("   " + raw.length + " raw articles\n");

    console.log("🧹 Pre-filtering...");
    const filtered = preFilter(raw);
    console.log();

    console.log("🔗 Deduplicating...");
    const deduped = deduplicate(filtered);
    const multi   = deduped.filter(g => g.sources.size > 1).length;
    console.log("   " + deduped.length + " unique topics · " + multi + " covered by 2+ outlets\n");

    console.log("🤖 Gemini analyzing...");
    const stories = await analyzeNews(deduped, raw.length, date);
    console.log("   " + stories.length + " stories selected\n");

    if (resend && process.env.EMAIL_TO) {
      console.log("📧 Sending email...");
      const from = CONFIG.EMAIL_FROM || (CONFIG.AGENT_NAME + " news@tccards.tn");
      const { data, error } = await resend.emails.send({
        from, to: process.env.EMAIL_TO.split(","),
        subject: CONFIG.AGENT_EMOJI + " " + CONFIG.AGENT_NAME + " — " + date,
        html: buildHTML(stories, date),
        text: buildText(stories, date),
      });
      if (error) console.error("   Email error:", error);
      else        console.log("   ✓ Sent " + data.id + "\n");
    }

    const dir = CONFIG.DIGEST_DIR || "digests";
    fs.mkdirSync(dir, { recursive: true });
    const outPath = path.join(dir, slug + ".md");
    fs.writeFileSync(outPath, buildMarkdown(stories, date, slug));
    console.log("📄 Written → " + outPath);
    updateIndex(date, slug, stories.length);
    console.log("\n✅ Done! " + stories.length + " stories · " + deduped.length + " unique · " + raw.length + " fetched\n");
  }

  return { run };
}

module.exports = { createAgent };
