# AI Meeting Memory Assistant Design Reference

This project adapts the Notion entry from `VoltAgent/awesome-design-md` for a meeting-memory workspace UI.

Source:
- `VoltAgent/awesome-design-md`
- `design-md/notion/DESIGN.md`
- https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/notion/DESIGN.md

## Direction

The product is not a landing page. It is a focused workspace for turning raw meeting transcripts into structured memory. The visual system borrows Notion-like editorial geometry, deep navy workspace framing, white document surfaces, 8px rectangular buttons, 12px cards, and pastel semantic panels.

## Tokens

Colors:
- Primary CTA: `#5645d4`
- Primary pressed: `#4534b3`
- Hero/navy band: `#0a1530`
- Canvas: `#ffffff`
- Surface: `#f6f5f4`
- Hairline: `#e5e3df`
- Hairline strong: `#c8c4be`
- Ink: `#1a1a1a`
- Charcoal: `#37352f`
- Slate: `#5d5b54`
- Steel: `#787671`
- Peach: `#ffe8d4`
- Rose: `#fde0ec`
- Mint: `#d9f3e1`
- Lavender: `#e6e0f5`
- Sky: `#dcecfa`
- Yellow emphasis: `#f9e79f`

Typography:
- Font stack: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- Headings: 600-650 weight, tight line height, zero letter spacing
- Body: 14-16px, 1.45-1.6 line height
- Button labels: 14px, 600 weight

Geometry:
- Buttons and inputs: 8px radius
- Cards and panels: 12px radius
- Tags and status badges: full radius
- Inputs: 44px minimum height
- Sidebar: 284px desktop width

## Product Mapping

Notion `workspace-mockup-card` becomes the top meeting-memory flow preview.

Pastel cards map to meeting extraction categories:
- Mint: decisions
- Sky: action items
- Peach: risks
- Rose: open questions
- Lavender: long-term memory
- Yellow: one-sentence summary and executive summary

Deep navy is reserved for the primary workspace header and brand mark. Purple is reserved for primary actions and API-ready status.

## Interaction Model

The first screen is the usable product surface:
- New meeting form
- Prompt-generated structured result
- Save to memory library
- Searchable historical records
- Single-meeting follow-up Q&A

The UI avoids a marketing-first homepage and keeps controls visible, dense, and repeatable for actual work.
