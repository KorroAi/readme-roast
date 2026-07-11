# Changelog

## 1.0.1 (2026-07-11)

### Added
- `--help` flag for displaying all available options
- `--version` flag for version display
- Detailed `--compare` mode subsection with head-to-head verdict format
- Detailed `--output` mode subsection with file saving behavior
- Invalid flag handling rules with priority resolution
- "Established project" tier (100–1000 stars) in platform-aware intensity

### Fixed
- Badge color mapping now aligns exactly with scoring rubric
- Platform-aware intensity now covers all repo sizes (no gap between 100–1000 stars)
- Reworded "Twitter" references to "social media" for broader relevance
- Fixed ASCII card generation wording ("offer to generate" → "generate")
- Improved parallel structure in humor philosophy paragraph

## 1.0.0 (2026-07-11)

- Initial release
- 5 roast personas: Gordon Ramsay, David Attenborough, Noir Detective, McKinsey Consultant, The Brutalist
- Honesty Score (0-100) with color-coded scale
- Full alternate README generation with 8 required sections
- Shareable one-liner optimized for social media screenshots
- Embeddable Honesty Certified badge (shields.io)
- Self-roast mode (`--self`)
- Badge-only mode for CI pipelines (`--badge-only`)
- Platform-aware intensity (solo dev vs corporate)
- Mandatory humor quality gate
- Edge case handling: missing README, empty README, non-English README, monorepos
