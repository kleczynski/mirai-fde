# Mirai — master prompt for Figma Make

Use the following prompt to create the first interactive design prototype for Mirai.

---

You are the lead product designer, motion designer, and creative frontend engineer for **Mirai**, a voice-first AI interview experience.

Create a polished, responsive, interactive web prototype in Figma Make. This is not a conventional SaaS landing page and not a chatbot. The experience should feel like entering a calm, intelligent space where a focused conversation is about to begin.

## Product idea

Mirai conducts a spoken interview with the visitor. The AI has no face, body, avatar, gender, or simulated human appearance. Its presence is created through voice, timing, spatial sound, light, material, and restrained motion.

The name **Mirai** comes from the Japanese word **未来**, meaning “future” or, more literally, “what has not yet come.” The Latin spelling also contains “AI” at its end: MirAI. Treat this as a quiet discovery within the identity, not as a loud AI gimmick.

The central brand thought is:

> The future is not shown. It emerges through conversation.

## Creative direction: The Unfinished Signal

Design one distinctive non-human 3D presence called **The Unfinished Signal**.

It must not be a sphere, orb, face, head, humanoid, robot, mascot, waveform, equalizer, brain, portal, or particle cloud. Instead, imagine a tall, asymmetrical, translucent membrane suspended in space — somewhere between folded optical glass, a thin sheet of liquid metal, and a piece of fabric held by an invisible field.

The form is never completely closed or symmetrical. One side feels latent and unfinished; another appears to be arriving into the present. This expresses the two-part meaning of 未来: “not yet” and “to come.”

The object should feel quiet, precise, tactile, and unfamiliar rather than spectacular. Its surface may refract a very small amount of color, distort the background gently, and reveal thin internal lines when active. Avoid sci-fi HUD styling.

## Brand behavior

Mirai should feel:

- attentive, calm, intelligent, and warm without pretending to be human;
- futuristic through behavior and material, not through neon decoration;
- premium but not luxurious;
- Japanese in its respect for negative space, rhythm, asymmetry, and restraint — never through visual clichés;
- trustworthy enough for a meaningful interview.

Do not use cherry blossoms, torii gates, red sun motifs, bamboo, anime references, pseudo-Japanese patterns, neon Tokyo imagery, or decorative kanji. The characters **未来** may appear only once as a small semantic signature or in the identity exploration, with a proper Japanese font.

## Wordmark

Create a lowercase **mirai** wordmark. Keep it optically simple and confident. Do not permanently color or bold the final “ai.” During the opening motion only, allow the final two letters to lag behind by a fraction of a second or become briefly visible through a different refractive layer. The AI reading should be discovered through motion rather than advertised typographically.

## Color system

Use a quiet mineral palette and define it as reusable variables/tokens:

- `Future White` — `#F3F6F4`, primary background;
- `Deep Ink` — `#15201D`, primary text and controls;
- `Mist Glass` — `#D9E2DE`, quiet surfaces and dividers;
- `Patina` — `#6F918B`, structural accent;
- `Listening Light` — `#C4E7DE`, active listening state;
- `Arrival` — `#D49374`, rare warm signal for start/end moments.

Do not use purple-to-blue AI gradients, acid green, pure black backgrounds, heavy shadows, glassmorphism cards, or decorative gradient blobs. Ensure accessible contrast for all functional text and controls.

## Typography

Use **Geologica Variable** for Latin and Polish text, with **Noto Sans JP** only for Japanese characters. Use one restrained type family hierarchy rather than mixing display serif and sans-serif fonts.

- Sentence case everywhere.
- Large headings should be confident but not oversized beyond usability.
- Keep body lines below approximately 70 characters.
- Avoid all-caps eyebrow labels, excessive letter spacing, monospace metadata, and highlighted single words in headlines.
- Polish diacritics must render correctly.

## Required responsive screens

Design and prototype these connected states for desktop at 1440 px and mobile at 390 px.

### 1. Landing / invitation

Use a full viewport with generous negative space.

- Minimal navigation: Mirai wordmark on the left; “Jak to działa” and “Prywatność” on the right.
- Main Polish headline: **„Rozmowa, która prowadzi dalej.”**
- Supporting copy: **„Mirai przeprowadzi z Tobą spokojny wywiad głosowy. Słucha, dopytuje i podąża za tym, co naprawdę mówisz.”**
- Primary action: **„Rozpocznij rozmowę”**.
- Secondary quiet action: **„Najpierw dowiedz się więcej”**.
- Place The Unfinished Signal asymmetrically in the composition. It is the only expressive visual element.
- Include one concise trust line near the primary action: **„Rozmawiasz z AI. Przed rozpoczęciem wyjaśnimy, jak wykorzystamy Twoje odpowiedzi.”**

Do not add feature-card grids, customer logos, fake statistics, testimonials, pricing, or a generic multi-section marketing template. The first prototype should focus on the invitation and transition into the interview.

### 2. Before the interview

Create a calm preparation state, not a modal floating over the landing page.

- Heading: **„Zanim zaczniemy”**.
- Explain expected duration, microphone use, recording status, data use, and that the interviewer is AI.
- Show microphone readiness and a short input-level response.
- If consent is required, make it explicit and readable rather than hidden inside terms.
- Primary action: **„Rozpocznij wywiad”**.
- Secondary action: **„Wróć”**.
- The 3D form should become quieter and narrower in this state, as if waiting.

Assume permissions can be granted, but design clear visual states for: checking, ready, permission denied, connection problem, and retry.

### 3. Active voice interview

Transform the landing composition into a focused interview room without a hard page cut. The same 3D object must persist through the transition and become Mirai’s conversational presence.

- Show the current conversation status using plain Polish: **„Słucham”**, **„Zastanawiam się”**, **„Mówię”**, or **„Połączenie przerwane”**.
- Show Mirai’s current sentence as optional live captions near the form, no more than two or three lines.
- Do not display chat bubbles or a permanent transcript column.
- Provide a collapsed transcript control for accessibility and review.
- Bottom controls: microphone, captions, transcript, and **„Zakończ”**.
- Make destructive/end-call treatment clear without making it visually dominant.
- Do not use a user camera tile. This is voice-first.
- Keep progress non-judgmental. If needed, show only a quiet indication such as **„Rozmowa 2 z 4 tematów”**, never a score or completion percentage during the interview.

### 4. Conversation complete

- Let the 3D form settle into its simplest, nearly still shape.
- Heading: **„Dziękuję za rozmowę.”**
- Explain clearly what happens next with the recording or answers.
- Primary action should match the actual product outcome, using placeholder copy **„Zobacz podsumowanie”** only if a summary will truly exist.
- Include a way to report a technical issue.

## Motion language

Spend visual boldness on one continuous, orchestrated transformation rather than many small effects.

### Page entrance

The wordmark appears first. The Unfinished Signal then resolves from a nearly edge-on silhouette into a readable translucent form over 1.2–1.6 seconds. The headline follows as one composed reveal, not separate fade-up animations for every line.

### Interaction states

- **Idle:** almost still; a very slow 8–12 second material drift.
- **Listening:** the surface subtly opens toward the user; internal lines become clearer; use Listening Light sparingly.
- **Thinking:** one restrained refraction travels through the form from the incomplete side toward the arriving side. Do not use spinning loaders or random particles.
- **Speaking:** deformation follows phrase-level rhythm and vocal energy, not every audio sample. It should feel like breath and articulation, not an equalizer.
- **Interrupted:** the speaking motion yields immediately and smoothly into listening without snapping or flashing.
- **Complete:** the form releases tension and returns to a thin, calm silhouette.

Cursor or pointer movement may cause extremely subtle parallax on desktop. Do not make the object chase the cursor. On mobile, use device-independent ambient motion only.

Respect `prefers-reduced-motion`. In reduced-motion mode, replace deformation and parallax with subtle opacity and color-state changes while keeping all statuses understandable through text.

## 3D implementation guidance

Build the interactive form with React Three Fiber / Three.js if supported by the environment. Prefer one optimized custom geometry with a lightweight shader or refractive material. Avoid importing a stock 3D object.

- Keep the scene lightweight enough for a responsive landing page.
- Use progressive enhancement and provide a graceful static/CSS fallback.
- Avoid excessive bloom, chromatic aberration, noise, and post-processing.
- The form must remain legible on average laptop displays and mid-range mobile devices.
- Pause or reduce rendering when the page is not visible.
- Separate visual state from the future voice-agent logic using named states: `idle`, `listening`, `thinking`, `speaking`, `interrupted`, `error`, `complete`.

Use realistic mocked state transitions in the prototype so the interaction can be reviewed without connecting a live voice model yet.

## Component and design-system requirements

Create reusable components and variables rather than a flat collection of frames:

- wordmark/navigation;
- primary and secondary actions;
- conversation control button with accessible labels and focus states;
- status indicator variants;
- live captions;
- transcript drawer;
- consent/readiness rows;
- inline error and retry state;
- The Unfinished Signal state controller.

Define color, typography, spacing, radius, and motion tokens. Use restrained radii based on function; do not give every element the same rounded rectangle. Avoid unnecessary cards and shadows.

## Accessibility and trust

- Meet WCAG AA contrast where applicable.
- Provide visible keyboard focus.
- Make every control keyboard accessible.
- Never rely on 3D motion or color alone to communicate state.
- Include captions and an optional transcript.
- Make AI identity, recording, privacy, and consent explicit before the interview begins.
- Do not use manipulative urgency or human impersonation.

## Final quality check

Before presenting the result, critique it against these questions:

1. Could this page belong to any generic AI startup? If yes, make it more specifically Mirai.
2. Is the central object a disguised glowing orb, waveform, portal, or particle cloud? If yes, redesign it.
3. Does the Japanese influence come from restraint, asymmetry, interval, and meaning rather than decoration? If not, remove the cliché.
4. Does the transition from invitation to interview feel like one continuous experience?
5. Can a user understand whether Mirai is listening, thinking, or speaking without interpreting abstract animation?
6. Is the interface still clear with reduced motion and without the 3D canvas?
7. Are the Polish copy, diacritics, button labels, and error states complete?

Present the desktop and mobile landing states, the full interview flow, the interactive motion prototype, the reusable components, and a compact token reference.

---

