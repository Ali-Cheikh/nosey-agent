<img src="/assets/Tnosey-foundit.png" align="left" style="margin-top=10px" />

### Nosey is the nosy AI that pokes into your RSS feeds and serves up a daily digest.  
This guide shows exactly how to set it up, customize it, and run it — all for free **within 5mn**.

---

**Workflow (how Nosey snoops):**
```
   +-------------+    +--------------+    +--------------+
   |  RSS Feeds  | -> | Fetch & Dedup| -> |  Gemini Rank |
   +-------------+    +--------------+    +--------------+
                                               |
                +--------------+---------------+
                |              |               |
                v              v               v
         +------------+ +------------+ +------------+
         |  Markdown  | | HTML Email | |  Archive   |
         |  Digest    | |  (Resend)  | |  Index     |
         +------------+ +------------+ +------------+
```

---

## Prerequisites

- GitHub account (free)
- Gemini API key – get it at [Google AI Studio](https://aistudio.google.com/)
- (Optional) Resend API key for email – sign up at [Resend](https://resend.com/)

---

## Quick Start

1. **Fork or clone** this repository to your GitHub account.

2. **Add secrets** in your repository:
   - Go to **Settings → Secrets and variables → Actions → New repository secret**
   - Add:
     - `GEMINI_API_KEY` (required)
     - `RESEND_API_KEY` and `EMAIL_TO` (optional)

3. **Run the workflow manually**:
   - Open the **Actions** tab
   - Select **Daily Tech Digest**
   - Click **Run workflow**

4. **Check the result**:
   - After ~1 minute, a new folder `digests/tech/` appears with a Markdown file named after today’s date.

That’s it. Nosey will now run daily at 08:00 UTC.

---

## Workflow File Example

Full content of `.github/workflows/daily-digest.yml` (currently runs only the Tech agent):

```yaml
name: Daily Tech Digest

on:
  schedule:
    - cron: '0 8 * * *'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - name: Run digest
        run: node index.js         # change to another agent if you want
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          EMAIL_TO: ${{ secrets.EMAIL_TO }}
      - name: Commit digests
        run: |
          git config user.name "digest-bot[bot]"
          git config user.email "digest-bot@noreply.github.com"
          git add digests/
          git diff --cached --quiet || (
            git commit -m "digest: $(date +%Y-%m-%d) [skip ci]" &&
            git push
          )
```

To run a different agent, replace `node index.js` with `node finance-agent.js`, etc.  
To run multiple agents, duplicate the `Run digest` step.

---

## `index.js` Config Example

Open `index.js` (or any agent file) – you'll see a `CONFIG` object like this:

```javascript
const CONFIG = {
  AGENT_NAME: 'Daily Tech Digest',
  AGENT_EMOJI: '🌐',
  THEME_COLOR: '#22d3ee',
  DIGEST_DIR: 'digests/tech',

  TIME_WINDOW_HOURS: 48,
  ITEMS_PER_FEED: 10,
  SNIPPET_LENGTH: 350,

  MODEL: 'gemini-2.5-flash',
  MAX_RETRIES: 3,

  MIN_STORIES: 10,
  MAX_STORIES: 15,

  EMAIL_FROM: 'Nosey Tech <digest@yourdomain.com>',   // optional

  IMPACT_VERBS: 'Lets / Makes / Gives / Cuts',

  FEEDS: [
    'https://www.theverge.com/rss/index.xml',
    'https://techcrunch.com/feed/',
    'https://arstechnica.com/feed/'
  ],

  EXCLUDE_KEYWORDS: [
    'sponsored',
    'advertorial',
    'subscribe'
  ],

  CATEGORIES: 'AI|Gadgets|Software|Hardware|Startups',

  RANK_CRITERIA: [
    'Major product launches or announcements',
    'Significant AI breakthroughs or policy changes',
    'High‑impact security incidents',
    'Big acquisitions or funding rounds',
    'Relevance to general tech audience'
  ],

  INCLUDE_RULES: [
    'Must be published within the last 48 hours',
    'Must be substantive – not just a rumour or minor update'
  ],

  EXCLUDE_RULES: [
    'Exclude purely promotional content',
    'Exclude stock tips or investment advice',
    'Exclude articles that require a subscription to read the full text'
  ]
};

module.exports = CONFIG;
```

- **To change sources:** edit `FEEDS`.
- **To change ranking:** edit `RANK_CRITERIA`.
- **To filter topics:** add words to `EXCLUDE_KEYWORDS`.
- **To change output size:** adjust `MIN_STORIES` and `MAX_STORIES`.

**Never edit `core.js`** – that's the engine; you just configure the agents.

---

## Customizing Output: Email & Markdown

Nosey gives you two finished products: a **Markdown file** (saved in your repo) and an **HTML email** (sent via Resend). Here’s how they’re structured and how to make them yours.

### 📧 Email Design

By default, Nosey sends a dark‑mode, responsive HTML email. You can tweak its look without touching the core engine:

| Config Key | What it controls |
|------------|-------------------|
| `THEME_COLOR` | The accent color used for borders, category badges, and the "TOP STORY" label. Set it to any hex (e.g., `#ff6b6b` for red, `#4ecdc4` for teal). |
| `EMAIL_FROM` | The sender name and address shown in the inbox. Keep it on your verified Resend domain. |
| `AGENT_EMOJI` | Appears in the email subject line and header. |

**The email structure (built automatically):**
- **Top story block** – a highlighted card with the #1 story, including headline, summary, and a "why it matters" blurb.
- **Ranked table** – columns for Rank, Story (with link), Category, Source outlet, and "Why it matters".
- **Source count** – if a story appears in multiple RSS feeds, Nosey shows `2 outlets` or `3 outlets` to signal broad coverage.

**Want a complete redesign?**  
For full control (adding a logo, changing fonts, altering the layout, or switching to a light theme), edit the `buildHTML()` function inside `core.js`. It's a standalone function – you can swap the entire HTML template there without breaking the rest of the engine.

**Example quick tweak in `core.js`:**
```javascript
// Inside buildHTML(), change the background color:
<body style="background:#ffffff; margin:0; ...">  // switch to white
// Or add an <img> tag for your logo at the top.
```

---

### 📄 Markdown Digest Structure

Every run saves a `.md` file inside your agent’s `DIGEST_DIR` (e.g., `digests/tech/2026-08-24.md`). The structure is designed for readability and easy browsing:

**1. Header & Metadata**
```markdown
# 🌐 Daily Tech Digest — Tuesday, August 24, 2026
> 12 stories · 2026-08-24
```
The emoji and name come from `AGENT_EMOJI` and `AGENT_NAME` in your config.

**2. Top Story (highlighted)**
```markdown
## 🔥 Top Story

**[Apple unveils M4 chip with 50% faster NPU](https://...)**  
The new chip delivers 50% faster neural processing, debuting in the MacBook Pro lineup.  
💡 Makes on-device AI significantly faster for developers.
```

**3. Full Table (all ranked stories)**
| # | Headline | Summary | Category | Sources | Why It Matters |
|---|----------|---------|----------|---------|----------------|
| 1 | [link] | ... | AI | The Verge | Makes ... |
| 2 | [link] | ... | Gadgets | 3 outlets | Gives ... |

- **Sources column** – shows the outlet name (e.g., *TechCrunch*) if only one feed covers it, or `2 outlets` / `3 outlets` if multiple sources reported the same story.
- **Category column** – Gemini picks the best match from your `CATEGORIES` pipe‑separated list (e.g., `AI|Gadgets|Software`).

**Want a different Markdown layout?**  
Edit the `buildMarkdown()` function in `core.js`. You can reorder columns, switch to bullet points instead of a table, or add extra sections. The function returns a plain string, so you have full freedom.

---

## Running Multiple Agents

In the workflow file, add another step for each agent. For example:

```yaml
- name: Run Finance
  run: node finance-agent.js
  env:
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
    RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
    EMAIL_TO: ${{ secrets.EMAIL_TO }}
```

Repeat for `gold-agent.js`, `health-agent.js`, or any custom agent.

---

## Local Testing

```bash
npm install
echo "GEMINI_API_KEY=your_key_here" > .env
node index.js
```

The Markdown file will appear in `digests/tech/`.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Git push fails | Ensure workflow has `permissions: contents: write` |
| Gemini API error | Check secret and quota |
| No articles fetched | Test RSS URL in browser |
| No email received | Verify Resend domain and `EMAIL_TO` / `EMAIL_FROM` |

---

## Cost: $0 / month

Gemini, GitHub Actions, and Resend free tiers cover daily runs of all agents. Nosey doesn't cost a penny.

## star?
```js
console.log("====================================================");
console.log("👃 Nosey successfully sniffed out your news for today!");
console.log("⭐ Enjoying your zero-cost digest?");
console.log("👉 Drop a star on: https://github.com");
console.log("====================================================");
```
