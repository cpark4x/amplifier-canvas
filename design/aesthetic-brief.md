# Aesthetic Brief (v2 — Maru-Anchored)

> Generated from 22 references. Primary anchor: Maru Coffee. Previous brief archived.
> The user rejected the v1 storyboard as too heavy, too much chrome, bad sidebar, bad colors, bad fonts.
> This brief corrects course toward a quieter, warmer, more invisible design system.

## Palette
Extracted colors: #F9F9F7 #F2F0EB #2A2A2A #A8A098 #8A5A35 #3ECF8E

- Primary surface: #F9F9F7 — warm paper white. The dominant background for everything. Not pure #FFFFFF. Not cool gray. A warm, slightly creamy off-white that feels like unbleached cotton paper. This is the single most important color decision.
- Secondary surface: #F2F0EB — warm stone. For the sidebar, for panel backgrounds, for hover states. A subtle tone shift from the primary surface — NOT a dark charcoal sidebar. The sidebar should feel like a slightly different paper, not a different room.
- Primary text: #2A2A2A — warm charcoal. Not pure black. This specific warmth avoids the harshness of #000000 on the warm white background.
- Secondary text: #A8A098 — warm gray. For timestamps, metadata, file sizes, secondary labels. Muted but warm, not cool blue-gray.
- Content accent: #8A5A35 — warm umber. Extremely sparing — for rare moments where the interface needs a touch of earthiness. Think: a visited-link color, a category label, an active section indicator. Never a background color.
- Status: #3ECF8E — emerald green. The ONE functional color. Used exclusively for active session indicators and success states. This is the only saturated color in the entire system.

What's NOT in this palette: violet, blue, red, orange, cyan, gradients. The shell is monochromatic and warm. Period.

## Typography
- Style: clean geometric sans-serif (not humanist — too soft). Something in the family of Helvetica Neue, Inter, Suisse, Aktiv Grotesk. Precise, not friendly.
- Case treatment matters more than size: UPPERCASE with wide letter-spacing for navigation, labels, section headers. Sentence case for body content. This is how Maru creates hierarchy without size variation.
- Weight character: regular (400) for most things. Medium (500) for interactive elements. Semibold (600) for primary headings only. Bold (700+) is almost never used. The hierarchy is QUIET — not shouty.
- Tracking (letter-spacing): wide on uppercase elements (0.08-0.12em). Normal on body text. This wide tracking on navigation and labels is a signature of the Maru aesthetic.
- Serif: available for editorial/content section headers (like Maru's "Notes" heading). A refined serif for section breaks only — not navigation, not buttons, not metadata. Think of it as a section divider that also carries meaning.
- Density: open. Generous line-height (1.6-1.7 for body). Comfortable reading measure. The text should feel like it has room to breathe, not like it's been packed into a UI widget.

## Composition Character
- Spatial rhythm: two-pane — sidebar + content area — BUT the sidebar is warm stone (#F2F0EB) not dark charcoal. The differentiation is a subtle temperature/shade shift, not a dramatic light/dark split.
- Sidebar treatment: narrow (~220-240px). Same warm family as the content area. Items separated by space and alignment, not by divider lines. Active item indicated by a small dot or subtle background shift — not a bold colored bar.
- Content area: expansive, airy. Content floats on the warm white surface. Sections separated by generous vertical space, not by horizontal rules or card containers.
- Containers: BORDERLESS. This is the core principle. No card borders. No container outlines. No section dividers. Items are defined by their content, their alignment, and the space around them. If you need to group things, use a subtle background tone shift (#F2F0EB) — never a border.
- Elevation: flat. Zero shadows on content elements. Shadows reserved ONLY for truly floating overlays (modals, command palette). There should be at most 2 elements on any screen that have a shadow.
- Edge treatment: minimal border-radius. 2-4px maximum for inputs and interactive elements. No rounded cards, no pill-shaped containers. Squared-off feels more architectural and precise, matching the Maru direction.
- Grid: content items (sessions, files) in a clean grid with consistent dimensions and generous gutters. Items defined by image/content + text below — like Maru's product grid. No card chrome wrapping them.

## Mood Keywords
natural, invisible, warm, precise, quiet, monochromatic, architectural, breathable

## Reference Summary
The direction is Maru Coffee translated into a developer workspace. Maru proves that a digital interface can feel warm, natural, and modern simultaneously by making the UI framework invisible — a transparent container that lets content be the hero. The shell is monochromatic (warm paper white + charcoal), flat (zero shadows), and borderless (space defines structure, not lines). Typography does all the hierarchy work through case treatment and letter-spacing rather than size or color. The only non-neutral color in the system is functional: emerald green for active status. Everything else is warm whites, warm grays, and warm charcoal.

Linear remains the structural reference for information density — Canvas needs to show session lists, file trees, and status data, which requires tighter spacing than a coffee shop website. The challenge is achieving Linear's information density within Maru's visual philosophy: dense data, but presented in a borderless, flat, monochromatic, warmly-toned system.

Craft.do confirms the tonal direction — warm, organic, document-focused. Cursor confirms the warm off-white can work in a code-adjacent tool.

## Anti-Slop Notes
- NO DARK SIDEBAR. The previous brief had a #1C1C1C dark charcoal sidebar. The user hated it. The sidebar is warm stone (#F2F0EB) — a subtle shift from the content area, not a different color universe.
- NO VIOLET. The previous brief used #635BFF violet as an accent. Drop it entirely. The accent palette is near-monochromatic warm tones + one functional green. No purple, no blue.
- NO CARD BORDERS. No container outlines. No section dividers. No border-left accents. If you find yourself reaching for a border, use space instead. If that's not enough, use a subtle background tone shift. Borders are the #1 thing to eliminate.
- NO SHADOWS on content elements. The previous storyboard likely had shadows on cards. Remove them all. Flat. Shadows exist only on modals and floating overlays.
- NO BOLD FONT WEIGHTS for UI chrome. The previous output probably used 700-800 weight headings. Dial back to 500-600 max. The hierarchy should be quiet — uppercase + tracking, not size + boldness.
- NO LARGE BORDER RADIUS. The warm/natural direction is NOT the same as "friendly/rounded." Maru uses minimal radius. Keep it architectural: 2-4px max. Pill shapes only for tag chips.
- NO SATURATED COLORS in the interface chrome. The only saturated color allowed is #3ECF8E for active session status. Everything else: warm white, warm stone, charcoal, warm gray. That's it.
- The warm off-white (#F9F9F7) is a SPECIFIC tone. Do not substitute #FFFFFF (too cold) or #F5F5F5 (too gray). Test by placing charcoal text on it — it should feel like ink on warm paper.
- DO NOT make the UI busy to compensate for the quiet palette. The quiet IS the design. Resist the urge to add visual interest through borders, icons, colors, or decoration. The interest comes from the content and the typography.
- Consistent item dimensions in grids. Every session card, every file item, every project entry should have the same height within its list. Variable-height cards break the calm rhythm.

## For /storyboard
> A warm, near-monochromatic workspace on paper white (#F9F9F7). Sidebar is warm stone (#F2F0EB), not dark. Charcoal text (#2A2A2A), not black. BORDERLESS everything — no card borders, no shadows, no section dividers. Space and alignment define structure. Typography hierarchy through uppercase + wide tracking on labels, not through size or color. One functional color only: emerald (#3ECF8E) for active status. The UI framework should be invisible — a quiet, architectural container that lets session data, file content, and project status be the only things you notice. Primary reference: Maru Coffee. Density reference: Linear. Tonal reference: Craft.do.
