# 2_4 default and bottom glass correction

Based on the latest v4 files.

Changes:
- `2_4_Oeffnungselemnt_Vertikal` is now the default profile in the UI,
  URL fallback, and initial page load.
- Bottom glazing inset uses the same CAD Y mapping as the actual bottom
  profile geometry:
    - top/side: `globalMaxY - y`
    - bottom: `y - globalMinY`
- Top, side, depth, thickness, screenshot, AR, and material logic remain unchanged.

This targets the remaining bottom-only glass gap without globally enlarging
the pane or disturbing the correctly fitted top and side edges.
