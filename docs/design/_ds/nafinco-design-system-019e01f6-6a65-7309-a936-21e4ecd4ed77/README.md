# Nafinco Design System

> *Voor de apotheker doen we alles* — for the pharmacist, we do everything.

Nafinco is a Dutch B2B services company that supports independent community pharmacists (zelfstandige apothekers) across the Netherlands with three core offers: **Inkoop** (purchasing), **Digitaal** (digital tools), and **Kapitaal** (capital — buying, selling, financing pharmacies). They sit between the wholesalers and the pharmacy owner, fighting for the independent operator's margin and time.

This is a **brand-driven** system. Every design decision points back to one feeling: *we have your back, we'll go through fire for you*.

---

## Brand voice

- **Personal, never corporate.** Use "we" and "u" / "jij". The brand is a teammate, not a vendor.
- **Dutch-first.** Dutch headlines and copy. English only when an international audience is explicit.
- **One promise per surface.** Every billboard, brochure, page is anchored by ONE punchline — never a wall of bullets.
- **Wordplay is welcome.** "ApoTHEEker", "Door het vuur", "Altijd tijd voor de apoTHEEker". The brand teases out hidden second meanings inside Dutch pharmacy words by colouring a substring teal.
- **Concrete, not aspirational.** "Wij garanderen de scherpste inkoopdeals" beats "We empower healthcare". Numbers, names, and verbs win.

---

## Visual foundations

### The four signatures
Every Nafinco piece has at least three of these four:

1. **The hero gradient** — a radial sky-cyan-to-deep-teal "blue room" behind portraits or large display type. (`var(--naf-hero-gradient)`)
2. **The orange dot.** Every primary headline ends with a tiny orange period. It's the punctuation that makes the brand feel human.
3. **The orange brush-mark underline** under the punchline word. Skewed, slightly hand-drawn. (`.naf-mark`)
4. **The stepped pixel motif** — light-teal staircase shapes echoing the logo "n", scattered as corner ornaments behind sections.

### Color
Teal does the talking. Orange punctuates. Cream warms. Black grounds. White breathes.
- **Teal 700 `#3D8296`** — primary headline, brand color, link.
- **Orange 500 `#FF7C47`** — primary CTA only. Pill-shaped buttons, the dot, the underline. Use sparingly — one orange surface per screen.
- **Cream 100 `#FDE8C8`** — circular halo behind icons on white service cards. The warm note.
- **Teal 100 `#DFF0F5`** — section bands.
- **Black `#0A0A0A`** — body copy, secondary headlines on white.

### Typography
**Figtree** for everything — a friendly geometric sans with rounded terminals.
- **Display (UPPERCASE Black 88-120 px)** for billboards and brochure covers. Two colors split across lines (white over photo, black over teal panel) creates the signature "type peeking out" effect.
- **H1 (Bold 48 px, sentence case, teal)** for web heroes. Always end with the orange dot.
- **Body (Regular 18 px, ink)** — comfortable, never tight.
- **Wordplay highlight** — colour a Dutch substring (`thee`, `vuur`, `tijd`) inside a longer word in mid-teal `#67B2C9` to reveal a hidden second meaning. Once per piece.

**Source Serif 4** *italic* — pull-quotes only. Never a headline.

### Logo
A pure wordmark — **NAFINCO** set in Figtree Black, uppercase, +0.05 em tracking. No symbol, no monogram. Default colour is black on white; teal-on-white, white-on-black, and white-over-gradient are the sanctioned variants. Minimum size is 18 px; maintain at least 1× cap-height clear space on every side.

### Illustrations
A 58-piece flat-vector library (`assets/illustrations/`) covering pharmacy people, medication, delivery, digital flows, and service-quality icons. All teal-and-orange. The `-WIT` variants are white-on-teal, sized for the hero gradient. The `-GROEN` and `-GEEL` variants are green/yellow swap-ins for service-quality scoring.

---

## How to use this system

```html
<link rel="stylesheet" href="tokens.css"/>
```

Then build with the token classes (`.naf-h1`, `.naf-card`, `.naf-btn--primary`) or the raw CSS variables. Every page should feel like the homepage — one big teal-gradient hero, a band of three white service cards with cream halos, then alternating light-teal and white sections with a stepped motif tucked in a corner.

### Anatomy of a Nafinco page
1. **Hero** — full-bleed gradient + sentence-case white H1 ending in the orange dot + one orange CTA.
2. **Service cards** — three white cards floating into a teal band, each with a cream halo icon, teal H3, body copy, and an orange pill button.
3. **Story band** — pale teal-100 section with a teal H1 and one large editorial photo. A serif italic pull-quote with a black left rule.
4. **Stepped motif corners** — light teal blocks at 40-60% opacity, never centered, never on text.
5. **Footer** — teal-700 background, white logo, white nav, orange CTA at the end.

### Don'ts
- Don't add a second orange surface — keep it the rare punctuation.
- Don't use the wordplay trick more than once per piece.
- Don't put the stepped motif on top of body text.
- Don't use Figtree at semibold for headlines — go full Bold or Black, never the in-between.
- Don't drift into a different blue. Teal-700 is the brand. Pure brand-blue or navy is not Nafinco.

---

## Files

- `tokens.css` — all variables, type classes, button + card primitives.
- `logo.html` — logo lockups across backgrounds.
- `colors.html` — palette + suggested usage ratio.
- `type.html` — type scale, billboard headline, hero, wordplay.
- `components.html` — buttons, cards, hero, nav, quote, stepped motif.
- `illustrations.html` — full 58-icon library, grouped by topic.
- `assets/logo/` — primary logo + mark SVGs.
- `assets/illustrations/` — 58 flat illustrations, brand-recolored.
- `assets/reference/` — original brand reference images (website, billboard, brochure, mug).
