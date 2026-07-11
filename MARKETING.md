# README-ROAST — Communication & Marketing Plan

## Target Audiences

| Audience | Why They Care | Where They Are | Tone |
|----------|-------------|----------------|------|
| **AI/LLM developers** | Claude Code skill, AI humor, self-deprecating | r/ClaudeAI, r/LocalLLaMA, X (AI Twitter), Discord servers | Meta, self-aware, technically sharp |
| **Open-source maintainers** | Their READMEs are being roasted. The badge spreads. | r/programming, r/opensource, GitHub Trending, Hacker News | Insider humor, "we all do this" |
| **Developer tool enthusiasts** | Novel CLI tool, viral mechanics, badge ecosystem | r/commandline, r/unixporn (for ASCII cards), Product Hunt | Aesthetic, clever, terminal-pilled |
| **General developers** | Universal pain point: bad READMEs are everyone's problem | r/webdev, r/javascript, r/Python, dev.to, X | Relatable, practical, funny |
| **Content creators / bloggers** | Ready-made content: "I roasted 50 READMEs and ranked them" | YouTube, dev.to, Substack, Medium | Dramatic, ranking-obsessed |

---

## Launch Sequence — Day 0 to Day 30

### Phase 1: Pre-Launch (Day 0-2)

| Action | Channel | Notes |
|--------|---------|-------|
| Polish GitHub repo | github.com/KorroAi/readme-roast | README, LICENSE, CODE_OF_CONDUCT, example output all perfect |
| Create demo roasts | Local | Roast 3-5 well-known repos (React, TensorFlow, VS Code, curl, htop) and save screenshots |
| Select the funniest roast | — | One roast that made YOU laugh out loud. That's the lead. |
| Prepare launch post draft | X, Reddit | Two versions: short (X) and long (Reddit). Both with screenshot. |

### Phase 2: Launch Day (Day 1)

**Primary: X / Twitter**

```
Post a screenshot of the funniest roast with a one-line hook:

"I built a Claude Code skill that roasts your README. 5 personas.
Gordon Ramsay. David Attenborough. A noir detective. A McKinsey consultant.
A brutalist who speaks in 5-word sentences.

Here's what it said about [popular repo]:

[screenshot]

/readme-roast on any repo. Link in reply."
```

Timing: Tuesday/Wednesday, 9-11 AM EST. Peak developer activity.

**Primary: Reddit**

Target: r/programming, r/ClaudeAI, r/opensource

Post format:
- Title: "I built a skill that roasts your README using 5 personas (including Gordon Ramsay and David Attenborough)"
- Body: Link to repo + 2-3 funniest roast excerpts + quick start command + "roast your own" call to action
- First comment: "Here's the full list of things it audits. The roast is funny but the audit is real." + list

**Secondary: Hacker News**

"Show HN: README-ROAST — A Claude Code skill that gives your README an honesty score" — Post when Reddit thread has >50 upvotes for social proof.

### Phase 3: Amplification (Day 2-7)

| Action | Channel | Details |
|--------|---------|---------|
| Reply to every comment | X, Reddit, HN | Engagement drives algorithms. Reply with persona roasts of their repos if they ask. |
| "Roast my README" thread | X | "Reply with your repo. I'll run README-ROAST on it and reply with the one-liner." |
| Cross-post to dev.to | dev.to | Article: "I Roasted 20 Popular Open Source READMEs. Here Are the Results." Ranking + commentary. |
| Post ASCII card in r/unixporn | Reddit | Show the ASCII Honesty Card output. Terminal aesthetics drive shares. |
| Reach out to AI newsletter curators | Email / DM | tldr.tech, AlphaSignal, The Batch, Ben's Bites — "New Claude Code skill + viral format" as pitch angle. |

### Phase 4: Viral Expansion (Day 8-30)

| Tactic | Mechanism | Expected Outcome |
|--------|----------|-----------------|
| **Badge spread** | Honesty badges appearing in real READMEs → organic discovery | 50-100 badges in the wild within 30 days |
| **"Roast battle" challenge** | "Post your Honesty Score. Lowest score wins a PR fixing their README." | User-generated content, competition |
| **Persona bracket** | Poll: "Which persona should we add next?" → user engagement → eventual v1.1 with new persona | Community ownership |
| **YouTube content** | Find a creator who does "AI reviews my code" content. Offer them the skill. | 1 video = 10K-100K impressions |
| **GitHub Trending** | Star velocity in first 48 hours determines Trending placement. Ask friends for stars. | Trending = 5x-10x discovery |

---

## Content Calendar — First 30 Days

```
Week 1: Launch
  Mon: Repo goes public. All social posts.
  Tue: "Roast my README" thread on X.
  Wed: dev.to article: "I Roasted 20 Popular READMEs."
  Thu: Reddit crosspost to r/webdev, r/Python.
  Fri: ASCII card post on r/unixporn.

Week 2: Deepen
  Mon: "Top 10 Most Egregious README Lies" — compilation thread.
  Wed: Reach out to 5 AI newsletters.
  Fri: "Which persona are you?" — quiz format post.

Week 3: Expand
  Mon: "Honesty Scores we've seen: the distribution" — data post.
  Wed: YouTube creator outreach (5 DMs).
  Fri: "README-ROAST vs Human Review" — comparison thread.

Week 4: Sustain
  Mon: Feature teaser: "New persona coming. Guess who."
  Wed: "Roast battle" challenge launch.
  Fri: Monthly roundup: "July's Most Honest Repos."
```

---

## Key Assets Needed

| Asset | Format | Priority | Notes |
|-------|--------|----------|-------|
| 3-5 high-quality roast screenshots | PNG, 1200x800 | CRITICAL | Lead with the funniest. These are your ads. |
| Repo demo GIF | GIF, <5MB, 30s | HIGH | Terminal recording: `/readme-roast` → output scrolls → badge appears |
| Persona lineup graphic | PNG, 1200x630 | HIGH | 5 character illustrations or stylized ASCII heads. Twitter card size. |
| "Roast my README" landing page | Link on README | MEDIUM | One-click: paste repo URL → get roast. Drives adoption. |
| Honesty Score tier list | PNG, 800x2000 | MEDIUM | "Painfully Honest to Fiction" tier list. Tier list format goes viral. |

---

## Metrics to Track

| Metric | Tool | Target (30 days) |
|--------|------|-----------------|
| GitHub stars | GitHub | 500+ |
| Skill invocations | Manual tracking or `/readme-roast` counter | 1000+ |
| Badges in the wild | GitHub search for `HONESTY CERTIFIED` | 50+ |
| X post impressions | X Analytics | 50K+ |
| Reddit upvotes (combined) | Reddit | 500+ |
| Newsletter mentions | Manual tracking | 3+ |
| YouTube videos | Manual tracking | 1+ |
| Honesty Score avg | Internal tracking | Fun stat to share |

---

## The Viral Hook (Elevator Pitch)

**For developers:**
> "It's a Claude Code skill that roasts your README. Gordon Ramsay, David Attenborough, a noir detective, a McKinsey consultant, or a brutalist who speaks in 5-word sentences. Gives you an honesty score and a badge. Equal parts roast and genuine audit. `/readme-roast` on any repo."

**For AI enthusiasts:**
> "An AI that calls out AI slop in READMEs. The twist: it's an AI skill itself, and it'll roast its own README if you ask. Self-awareness as a feature."

**For open-source maintainers:**
> "Fix your README in 30 seconds. Get an honesty score. Embed the badge. Your contributors will stop being confused by your setup instructions."

---

## Risk Mitigation

| Risk | Probability | Mitigation |
|------|------------|------------|
| Roasts offend a prominent maintainer | Medium | Personas punch up, never down. Platform-aware intensity protects small projects. Pre-roast major repos privately first. |
| Skill quality inconsistent | Medium | Humor quality gate is mandatory. Bad roasts get caught before output. |
| "Just another AI gimmick" | High | Lead with the genuine audit — it finds real issues. The humor is the wrapper, the audit is the product. |
| Low initial adoption | Medium | Badge system creates organic growth. Even 10 badges in the wild create 10 inbound links. |
| Claude Code skill format not widely known | Low | README includes clear install instructions. "That's it. No dependencies. No Docker." |

---

## Post-Launch Virality Path

```
Launch Day
    │
    ├── X post → screenshot shared → "roast my repo" replies → thread goes viral
    │
    ├── Reddit post → r/programming front page → cross-posts to other subs
    │
    ├── HN Show HN → front page → developer credibility
    │
    └── Newsletter pickups → tldr.tech, AlphaSignal → tech audience

Week 1
    │
    ├── Badges start appearing → "What's this Honesty Certified badge?" → organic search
    │
    └── dev.to article → ranking format → shared on LinkedIn

Week 2-4
    │
    ├── YouTube video → 10K+ views → new users
    │
    ├── GitHub Trending → exponential star growth
    │
    └── Community roasts community → self-sustaining content loop
```

---

## Success Criteria

- **Minimum viable success:** 100 GitHub stars, 5 badges in the wild, 1 newsletter mention
- **Good outcome:** 500 stars, 50 badges, 3 newsletter mentions, front page of r/programming
- **Viral outcome:** 2000+ stars, 200+ badges, HN front page, YouTube video, GitHub Trending
- **Legendary outcome:** Badges appear on major repos (React, Vite, etc.), skill becomes a standard part of the open-source toolkit, someone builds a CI action for it
