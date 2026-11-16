# Ryōan-ji 龍安寺

The dry garden of Ryōan-ji in Kyoto, in the browser. It is a bed of raked white gravel 25 m by 10 m, with fifteen stones set in moss in five groups. Wherever you sit on the veranda, at least one stone is hidden behind the others, so you never see the whole garden at once.

You sit on the veranda and look. You can get up, walk along the boards and sit down somewhere else. You can take up the rake and draw new lines in the gravel. The light follows the day, or the real sun over Kyoto at this moment.

## Running it

Open `index.html` in a browser. It's plain HTML, CSS and JavaScript, with no build step, no server and nothing to install.

It also works as-is on GitHub Pages: in *Settings → Pages*, set the source to the `main` branch, root folder.

## In the garden

| | |
|---|---|
| Look | Drag, or `↑` `↓` |
| Move along the veranda | `←` `→`, `A` `D`, or scroll. You rise to walk and sit again when you stop. On touch screens, hold the arrows at the screen edges. |
| Rake | `R`, then drag across the gravel. The rake won't cross the moss. `N` rakes the whole garden anew. |
| Count the stones | `C` marks every stone visible from where you are and counts them, usually 十四 (fourteen). |
| Light | `L` cycles through dawn, morning, midday, afternoon, dusk, night, and *Kyoto, now*. |
| Sound | `M` |
| Full screen | `F` |

URL parameters are handy for sharing a particular view: `?x=12.6&yaw=-10&pitch=-9&light=dusk&season=sakura`. Here `x` is metres along the veranda from the east end, `yaw` and `pitch` are in degrees, and `season` is one of `sakura`, `summer`, `early-autumn`, `koyo` or `winter`. Without it, the season follows today's date in Kyoto.

## The hidden stone

The stones follow the real garden's 5-2-3-2-3 grouping from left to right. Their positions and sizes are an artistic approximation, not a survey. The arrangement was tuned, and is checked, so that the garden keeps its defining property. From any point on the veranda, seated or standing, at least one stone is completely hidden:

```sh
node tools/verify-occlusion.mjs                                # full sweep, about three minutes
node tools/verify-occlusion.mjs --quick --detail --step=0.1    # faster, shows which stone hides where
```

This is the only part of the project that needs Node.js, and it uses nothing beyond Node itself.

The verifier builds exactly the meshes the browser draws. It sweeps the eye along the veranda every 5 cm, at three eye heights (seated, half-risen and standing) and three distances from the edge. From each point it casts a ray to every above-ground vertex of every stone, pushed 8 mm outwards. A stone counts as hidden only if none of those rays gets through. With the current layout a single stone is hidden from most of the veranda, and two are hidden where one hiding place hands over to the next. If you move a stone in `src/layout.js`, run the verifier again.

In the browser, *Count* measures visibility differently. It draws the stones from your eye in flat ID colours and counts the IDs that survive the depth test.

## How it's made

The scripts are loaded in order by `index.html`. Each one registers what it provides on a shared `RJ` object, and later scripts take what they need from it. Plain scripts rather than ES modules are what let the page open from disk: browsers refuse to load modules from `file://` addresses.

- `src/layout.js` holds the garden's dimensions, the veranda and the fifteen stones.
- `src/stones.js` builds the procedural stone meshes: a noise-displaced icosphere with random planar cuts and weathered vertex colours. It is plain JavaScript, so the verifier can use it too.
- `src/islands.js` builds the moss beds, one per group, with outlines derived from the stones' footprints.
- `src/gravel.js` holds the gravel. A 3200 × 1280 heightmap (128 px per metre) is rendered as a bump map. The traditional pattern has concentric rings around each group, lines following the garden's edge and long east–west lines elsewhere, and it is computed per pixel. Raking stamps a five-tine profile along the smoothed path of the rake head.
- `src/scene.js` builds the earthen walls with tiled caps, the veranda, eaves and hall, the trees (coloured by season), the pebble gutters and the sky.
- `src/sun.js` gives the solar position for Ryōan-ji (35.03° N, 135.72° E) and the colour of light by solar elevation.
- `src/audio.js` makes the sound procedurally, with nothing downloaded: wind, the scrape of the rake, and now and then a distant temple bell.
- `vendor/three.min.js` is [three.js](https://threejs.org) r187 (MIT, see `vendor/three.LICENSE`) as a single script that defines a global `THREE`. It was made from the npm package with `esbuild three.module.js --bundle --minify --format=iife --global-name=THREE --legal-comments=inline`, and only needs remaking to upgrade three.js.

## Possible next steps

- Keep the rake pattern between visits.
- Better foliage, such as leaf cards with alpha, or impostors.
- Weather: rain darkening the gravel, snow, falling leaves in autumn.
- A walk around the corner of the hall to the *tsukubai* water basin.
