# CAD screenshot gallery

Place screenshots in profile-specific folders:

```text
src/client/cad_screenshots/
├── 2_4_Oeffnungselemnt_Vertikal/
│   ├── 01-full-section.png
│   ├── 02-bottom-detail.png
│   └── 03-glazing-detail.jpg
└── 2_6_Oeffnungselement_Vertikal/
    └── 01-full-section.png
```

Supported extensions:

- `.png`
- `.jpg`
- `.jpeg`
- `.webp`

The server exposes:

```text
GET /api/cad-screenshots?profile=<profile-name>
```

The website displays a `CAD Section Reference` button for the current profile.
The button is disabled when that profile has no screenshots.

Files are sorted naturally by filename, so numeric prefixes can control gallery
order. The gallery is hidden in screenshot capture mode and AR mode.
