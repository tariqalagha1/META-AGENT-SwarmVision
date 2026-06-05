# VISUAL_REVIEW.md

## Screenshots
- Reference image: `C:\Users\admin\Downloads\ChatGPT Image Jun 5, 2026, 09_07_56 AM.png`
- Observe 1440 full: `C:\tmp\swarmvision-visual-review\observe-1440-full.png`
- Observe 1440 map: `C:\tmp\swarmvision-visual-review\observe-1440-map.png`
- Observe 1440 telemetry: `C:\tmp\swarmvision-visual-review\observe-1440-telemetry.png`
- Observe 1920 full: `C:\tmp\swarmvision-visual-review\observe-1920-full.png`
- Visualize 1440 full: `C:\tmp\swarmvision-visual-review\visualize-1440-full.png`
- Visualize 1920 full: `C:\tmp\swarmvision-visual-review\visualize-1920-full.png`
- Command 1440 full: `C:\tmp\swarmvision-visual-review\command-1440-full.png`
- Command 1920 full: `C:\tmp\swarmvision-visual-review\command-1920-full.png`

## Scoring
- Command Center Feel: `6/10`
- Similarity: `5/10`
- Professional Quality: `7/10`
- Visual Density: `4/10`
- Executive Dashboard Feel: `5/10`
- Overall: `54/100`

## Heatmap Observations
- High attention: top command bar, left swarm rail, right telemetry rail in Observe mode.
- Medium attention: graph controls and upper map header.
- Low attention: the lower two-thirds of the Observe map area because the live graph content is visually sparse.
- Very low attention: most of Visualize mode because the shell is present but the center is largely empty.
- Uneven attention: Command mode concentrates all value in a shallow band across the top half, leaving a large dead field below.

## GOOD
- The shell hierarchy is readable. The user can quickly understand top navigation, left context, center workspace, right telemetry, and bottom dock.
- The dark theme is controlled and restrained. It avoids noisy sci-fi excess and already feels more operational than entertainment-oriented.
- The Observe layout is the strongest mode. It is the only screen that consistently reads like a command center.
- Border treatment and subtle glow are disciplined. The UI stays closer to enterprise observability than game HUD styling.
- Typography weight and panel framing are reasonably clean at both `1440px` and `1920px`.

## BAD
- The center map does not dominate enough compared with the reference. The reference uses the map as the unmistakable focal point; the current Observe screen still feels like a graph tool inside a dashboard.
- Visualize mode collapses into a mostly empty staging screen. Compared to the reference, it loses command-center energy and creates too much negative space.
- Command mode has strong styling but weak spatial composition. It reads like a themed admin panel rather than an active operations surface.
- The right telemetry rail is long and repetitive. It stacks many similarly weighted cards, which weakens rhythm and makes the eye skim rather than focus.
- The shell chrome is good, but the content density is not yet coordinated across modes.

## TOO EMPTY
- Visualize mode is the clearest example. The central canvas area is mostly unused, so the screen feels unfinished rather than intentionally calm.
- The lower map area in Observe mode often contains large unused regions when graph activity is sparse.
- Command mode leaves too much empty black space under the achievement and mission sections.

## TOO BUSY
- The right telemetry rail in Observe mode is close to over-stacked. The number of panels is high, but the hierarchy inside that stack is not strong enough yet.
- The top portions of Observe combine shell controls, run state, graph controls, trace chips, and rail chrome in a compressed band. It is still readable, but it is near the threshold where polish could slip into clutter.

## TOO GAME-LIKE
- The left ecosystem visual in Observe mode leans game-like because of the neon agent columns and glow treatment. It is attractive, but it nudges the screen toward simulation UI more than executive command center.
- Command mode’s achievement framing and XP treatment also lean gamified rather than operational.

## TOO CORPORATE
- Visualize mode swings the other direction. Its empty centered shell and flat content rhythm feel more like a quiet enterprise dashboard than an active tactical viewer.
- Some telemetry cards in Observe are so uniform that they start to feel generic rather than mission-critical.

## Reference Comparison
- Layout hierarchy: the reference is stronger because its map clearly owns the page. The current Observe screen splits authority more evenly between map and side rails.
- Panel density: the reference achieves denser composition without feeling cluttered. The current UI is split between dense side rails and underfilled centers.
- Visual rhythm: the reference has a tighter cadence of control clusters, map framing, and telemetry blocks. The current rhythm is solid in Observe and weak in Visualize and Command.
- Shell composition: the current shell structure is directionally correct, especially in Observe. The difference is that the reference feels fully orchestrated around the center surface.
- Command-center feeling: present in Observe, partial in Command, mostly absent in Visualize.
- Map dominance: below target.
- Telemetry balance: the reference uses fewer, more assertive right-side groupings. The current right rail is heavier and more repetitive.
- Dark theme quality: good.
- Glow quality: good restraint, but the reference has better spatial lighting and perceived depth.
- Professional polish: promising, but inconsistent across modes.

## Recommendations
- Make the center surface feel more active and more structurally important in every mode.
- Reduce repeated card treatment on the right rail and introduce stronger tiering between critical and secondary telemetry.
- Compress or simplify upper control density so the map frame can breathe.
- Treat Visualize as a real command-center workspace, not a placeholder shell.
- Recompose Command mode vertically so the screen does not collapse into a short top strip.

## Top 10 UI Improvements
- Immediate: Increase center-surface dominance in Observe so the map visually outweighs both rails.
- Immediate: Give Visualize mode a stronger center composition even when no subview is selected.
- Immediate: Break the right telemetry rail into clearer priority tiers instead of a long uniform stack.
- Immediate: Reduce dead vertical space in Command mode.
- Immediate: Strengthen visual separation between shell chrome and content chrome.
- Later: Refine the ecosystem rail so it feels more tactical and less simulation-like.
- Later: Introduce stronger large-screen rhythm at `1920px`, where the interface currently spreads out too gently.
- Later: Add more deliberate focal lighting and surface depth to the center zone.
- Never: Copy the reference’s exact game-like content framing or UI widgets.
- Never: Increase glow intensity to the point where readability suffers or the UI becomes cyberpunk-styled.

## Final Assessment
- The current implementation is on the right path for shell direction and theme restraint.
- Observe mode is credible as a tactical observability viewer.
- Visualize and Command are not yet visually aligned with the reference’s command-center confidence.
- The biggest gap is not color or decoration. It is composition, density balance, and center-stage authority.

## Capture Notes
- Dedicated map and telemetry crops are only meaningfully available in Observe mode in the current implementation.
- Visualize and Command currently behave more like single-surface layouts, so their full-page captures are the most honest representation of the present UX.
