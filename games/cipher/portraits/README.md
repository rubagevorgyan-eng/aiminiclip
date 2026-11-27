# Cipher portraits: drop original artwork here

Status: **no final artwork supplied yet.** The game shows generated placeholder silhouettes for every slot.

Naming (one folder per family, two-digit slot numbers starting at 01):

| Family | Folder | Files | Look |
|---|---|---|---|
| Crimson agents | `crimson/` | `crimson-01.webp` … `crimson-16.webp` | crimson-tinted |
| Cobalt agents | `cobalt/` | `cobalt-01.webp` … `cobalt-16.webp` | cobalt-tinted |
| Civilians | `civilian/` | `civilian-01.webp` … `civilian-12.webp` | desaturated beige/gray |
| Assassins | `assassin/` | `assassin-01.webp` … `assassin-08.webp` | dark, mysterious |
| Duet agents | `duet/` | `duet-01.webp` … `duet-16.webp` | forest-green |

68 portraits total. `.avif` is also accepted (same name, `.avif` extension).

Art direction: original 1940s–60s espionage / film-noir illustrations, cinematic lighting, printed-illustration texture, distinct fictional faces, outfits and silhouettes. Framing is head and shoulders, centered, square, eyes at about 40% height. Only original or properly licensed art; no scraped or copyrighted images.

Export: square 384×384, WebP quality ~78 (or AVIF ~55), under 40 KB each. For example: `cwebp -q 78 -resize 384 384 in.png -o crimson-01.webp`.

After adding files: `npm run art` regenerates `src/art/portraits.manifest.json`, which validates names, formats, sizes and counts. Missing slots keep their placeholder.
