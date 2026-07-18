# ADR-001 — Version 1 is a static site in pure HTML5/CSS3/vanilla ES6+

**Status:** Accepted (founder decision, 2026-07-19)

## Context
RichenQuest's website is the lead-generation and credibility front of a Zoho-centered platform.
The audience is 66–80% mobile, largely mid-range Android devices in Bihar, eastern India, and
Nepal (2026-07-17 strategy research). SEO is the primary growth channel. The founder explicitly
excluded Astro, React, Next.js, Eleventy, and all other frameworks for Version 1.

## Decision
Version 1 ships as a fully static multi-page site written in HTML5, CSS3, and vanilla ES6+
JavaScript. No client-side framework, no runtime npm dependencies. Content is carried by HTML,
not JavaScript (progressive enhancement).

## Consequences
- Fastest possible pages on weak devices/networks; zero server attack surface; trivially
  cacheable on Catalyst hosting.
- SEO-safe: crawlers get complete HTML.
- Third-party weight (Zoho SalesIQ/Forms embeds) becomes the dominant performance risk →
  all embeds load lazily behind user intent (facade pattern), enforced via shared components.
- Reusable components require a build-time assembly step → ADR-002.
- Framework adoption later (e.g., for the student portal) is a separate app decision, not a
  rewrite of this site (File 09 §11).
