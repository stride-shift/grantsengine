/* Curated nonprofit freebies + discounts.
 *
 * Edit this file to add or remove resources. Each entry should include a verified
 * apply URL — if the URL goes 404, surface it (the UI dims and warns on missing).
 * Categories drive grouping in the UI.
 */

export const FREEBIE_CATEGORIES = [
  { id: "ai", label: "AI & LLM credits" },
  { id: "design", label: "Design & marketing" },
  { id: "ads", label: "Advertising" },
  { id: "productivity", label: "Productivity & collaboration" },
  { id: "infrastructure", label: "Cloud & infrastructure" },
  { id: "training", label: "Training & learning" },
];

export const FREEBIES = [
  // ── AI & LLM credits ──
  {
    id: "anthropic-npo",
    name: "Anthropic for Nonprofits",
    category: "ai",
    offer: "Discounted API credits for Claude — applies to verified nonprofits",
    url: "https://www.anthropic.com/contact-sales",
    eligibility: "Registered nonprofit with documented mission",
    notes: "Apply via sales contact; explain use case (proposal drafting, beneficiary impact).",
  },
  {
    id: "openai-npo",
    name: "OpenAI for Nonprofits",
    category: "ai",
    offer: "Discounted ChatGPT Team / API credits for verified 501(c)(3)-equivalent organisations",
    url: "https://openai.com/nonprofits",
    eligibility: "Registered nonprofit; international NPOs may need to email directly",
    notes: "Discount via the Nonprofit pricing page; verify via Goodstack.",
  },
  {
    id: "google-ai-npo",
    name: "Google AI for Social Good",
    category: "ai",
    offer: "Gemini credits + project funding for high-impact nonprofit AI projects",
    url: "https://ai.google/social-good/",
    eligibility: "Project-based; must demonstrate measurable social impact",
    notes: "Competitive — closer to a grant than a discount. Worth applying for AI-native programmes.",
  },

  // ── Design & marketing ──
  {
    id: "canva-npo",
    name: "Canva for Nonprofits",
    category: "design",
    offer: "Free Canva Pro for verified nonprofits (unlimited templates, brand kit, premium assets)",
    url: "https://www.canva.com/canva-for-nonprofits/",
    eligibility: "Registered NPO/PBO; verify via Percent (formerly Goodstack)",
    notes: "Single most-used freebie for SA NPOs. Apply once, stays valid as long as registration current.",
  },
  {
    id: "adobe-npo",
    name: "Adobe Creative Cloud for Nonprofits",
    category: "design",
    offer: "Up to 70% off Creative Cloud All Apps for verified nonprofits",
    url: "https://www.adobe.com/africa/creativecloud/buy/nonprofits.html",
    eligibility: "Registered nonprofit; verified via TechSoup or Adobe direct",
    notes: "TechSoup membership may be needed for SA orgs.",
  },
  {
    id: "figma-npo",
    name: "Figma for Nonprofits",
    category: "design",
    offer: "Free Professional plan for verified nonprofits",
    url: "https://www.figma.com/nonprofits/",
    eligibility: "Registered nonprofit/charity",
    notes: "Apply via in-product form; verification by Percent.",
  },

  // ── Advertising ──
  {
    id: "google-ad-grants",
    name: "Google Ad Grants",
    category: "ads",
    offer: "Up to $10,000/month in free Google Search ads",
    url: "https://www.google.com/grants/",
    eligibility: "Registered nonprofit with current valid status; non-discriminatory",
    notes: "Apply via Google for Nonprofits → Ad Grants. Requires active website + Google Analytics. Hardest part is keeping CTR above 5% to stay eligible.",
  },
  {
    id: "microsoft-ads-npo",
    name: "Microsoft Advertising for Nonprofits",
    category: "ads",
    offer: "$3,000/month in free Microsoft Search ads",
    url: "https://about.ads.microsoft.com/en/get-started/non-profit",
    eligibility: "Verified nonprofit",
    notes: "Complements Google Ad Grants — much less competition.",
  },
  {
    id: "meta-npo",
    name: "Meta for Nonprofits (Facebook/Instagram)",
    category: "ads",
    offer: "Ad credits, fundraising tools, free verified pages",
    url: "https://nonprofits.fb.com/",
    eligibility: "Verified nonprofit page",
    notes: "Ad credits intermittent; fundraising tools always-on.",
  },

  // ── Productivity & collaboration ──
  {
    id: "google-workspace-npo",
    name: "Google Workspace for Nonprofits",
    category: "productivity",
    offer: "Free Business Starter — Gmail, Drive, Docs, Meet under your domain",
    url: "https://www.google.com/nonprofits/",
    eligibility: "Verified nonprofit; verification by Percent",
    notes: "30GB/user. Upgrade paths discounted ~75%.",
  },
  {
    id: "ms365-npo",
    name: "Microsoft 365 Business Premium (Nonprofit)",
    category: "productivity",
    offer: "Free for up to 10 users; discounted thereafter",
    url: "https://www.microsoft.com/en-us/nonprofits/microsoft-365",
    eligibility: "Verified nonprofit",
    notes: "Strong if you already use Teams/Outlook. Apply via Microsoft Nonprofit Hub.",
  },
  {
    id: "slack-npo",
    name: "Slack for Nonprofits",
    category: "productivity",
    offer: "85% off Pro and Business+ plans for verified nonprofits",
    url: "https://slack.com/help/articles/204368833",
    eligibility: "Registered NPO/charity",
    notes: "Apply via in-product form after creating workspace.",
  },
  {
    id: "notion-npo",
    name: "Notion for Nonprofits",
    category: "productivity",
    offer: "Free Plus plan for small nonprofits (≤10 users)",
    url: "https://www.notion.com/help/notion-for-nonprofits",
    eligibility: "Registered NPO; verified via in-product form",
    notes: "Useful for internal knowledge base + light project management.",
  },
  {
    id: "asana-npo",
    name: "Asana for Nonprofits",
    category: "productivity",
    offer: "50% off Premium / Business plans",
    url: "https://asana.com/nonprofits",
    eligibility: "Registered NPO",
    notes: "Decent option if you already use Asana; not the cheapest project tool.",
  },

  // ── Cloud & infrastructure ──
  {
    id: "aws-npo",
    name: "AWS for Nonprofits — Imagine Grant + Credits",
    category: "infrastructure",
    offer: "$5,000 in AWS credits for first-time nonprofits; Imagine Grant up to $150K for select orgs",
    url: "https://aws.amazon.com/government-education/nonprofits/",
    eligibility: "Verified nonprofit; Imagine Grant is competitive",
    notes: "Apply via AWS Nonprofit Credit Program; refresh annually.",
  },
  {
    id: "azure-npo",
    name: "Microsoft Azure for Nonprofits",
    category: "infrastructure",
    offer: "$2,000/year in Azure credits for verified nonprofits",
    url: "https://www.microsoft.com/en-us/nonprofits/azure",
    eligibility: "Verified via Microsoft Nonprofit Hub",
    notes: "Stacks with M365 nonprofit benefit.",
  },
  {
    id: "gcp-npo",
    name: "Google Cloud for Nonprofits",
    category: "infrastructure",
    offer: "$2,500/year in Google Cloud credits + additional credit for crisis response",
    url: "https://cloud.google.com/nonprofits",
    eligibility: "Verified nonprofit",
    notes: "Required if you use Looker/BigQuery for funder reporting.",
  },
  {
    id: "github-npo",
    name: "GitHub for Nonprofits",
    category: "infrastructure",
    offer: "Free GitHub Team for nonprofits + 50% off Enterprise",
    url: "https://github.com/nonprofit",
    eligibility: "Verified nonprofit",
    notes: "Useful if any internal tech work.",
  },
  {
    id: "twilio-org",
    name: "Twilio.org Impact Access",
    category: "infrastructure",
    offer: "$500 startup credit + reduced rates on SMS/voice for social impact orgs",
    url: "https://www.twilio.org/impact-access/",
    eligibility: "Nonprofit; social impact use case",
    notes: "Great for beneficiary SMS comms (cohort reminders, surveys).",
  },

  // ── Training & learning ──
  {
    id: "linkedin-learning-npo",
    name: "LinkedIn Learning for Nonprofits",
    category: "training",
    offer: "Discounted LinkedIn Learning licences via TechSoup",
    url: "https://www.techsoup.org/linkedin",
    eligibility: "TechSoup-verified nonprofit",
    notes: "Useful for upskilling staff and beneficiaries.",
  },
  {
    id: "coursera-impact",
    name: "Coursera Coaching Nonprofit Programme",
    category: "training",
    offer: "Free or sponsored Coursera licences for beneficiaries via Workforce Recovery programme",
    url: "https://www.coursera.org/social-impact",
    eligibility: "Through partnerships — apply via Coursera Social Impact team",
    notes: "Strong fit for youth employment NPOs.",
  },
];
