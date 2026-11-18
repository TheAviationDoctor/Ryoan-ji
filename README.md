# Ryōan-ji 龍安寺

The dry garden of Ryōan-ji in Kyoto, in the browser. It is a bed of raked white gravel 25 m by 10 m, with fifteen stones set in moss in five groups. Wherever you sit on the veranda, at least one stone is hidden behind the others, so you never see the whole garden at once.

The opening screen shows the time in Kyoto. You begin seated on the veranda. You can get up, walk along the boards, step down onto the gravel and wander among the stones, then come back and sit somewhere else. Your steps crunch on the gravel but leave no trace. You can take up the rake and draw new lines as you walk. The light follows the day, or the real sun over Kyoto at this moment.

## Running it

Open `index.html` in a browser. It's plain HTML, CSS and JavaScript, with no build step, no server and nothing to install.

It also works as-is on GitHub Pages: in *Settings → Pages*, set the source to the `main` branch, root folder.

## In the garden

| | |
|---|---|
| Walk | `W` `A` `S` `D`. The moss beds are not to be walked on. On touch screens, use the pad at bottom left. |
| Look around | Move the mouse, a full 360°, with no clicking: the garden captures the pointer once you sit down. `Esc` frees it, and a click on the garden takes it back. `←` `→` turn and `↑` `↓` look up and down. On touch screens, drag. |
| Sit and stand | `C`. You can sit only on the veranda. Walking gets you up again. |
| Rake | `R` takes up the rake. Its head rests on the ground in front of you. Hold the mouse button or `Space` to lower it into the gravel, then walk or turn: each of its five tines cuts its own groove. It won't mark the moss. `N` rakes the whole garden anew. |
| Count the stones | `T` marks every stone visible from where you are and counts them. On the veranda that's usually 十四 (fourteen). |
| Light | `L` cycles through dawn, morning, midday, afternoon, dusk, night, and *Kyoto, now*. |
| Sound | `M` |
| Full screen | `F` |

URL parameters are handy for sharing a particular view: `?x=12.6&yaw=-10&pitch=-9&light=dusk&season=sakura`, or `?stand&x=11&z=-3&yaw=180` to stand on the gravel looking back at the hall. Here `x` is metres along the veranda from the east end, `z` is metres from the veranda edge (negative into the garden, the veranda is 0.55 to 3.6), `yaw` and `pitch` are in degrees, and `season` is one of `sakura`, `summer`, `early-autumn`, `koyo` or `winter`. Without it, the season follows today's date in Kyoto.

## The hidden stone

The stones follow the real garden's 5-2-3-2-3 grouping from left to right. Their positions and sizes are an artistic approximation, not a survey. The arrangement was tuned, and is checked, so that the garden keeps its defining property. From any point on the veranda, seated or standing, at least one stone is completely hidden:

```sh
node tools/verify-occlusion.mjs                                # full sweep, about three minutes
node tools/verify-occlusion.mjs --quick --detail --step=0.1    # faster, shows which stone hides where
```

This is the only part of the project that needs Node.js, and it uses nothing beyond Node itself.

The verifier builds exactly the meshes the browser draws. It sweeps the eye along the veranda every 5 cm, at three eye heights (seated, half-risen and standing) and three distances from the edge. From each point it casts a ray to every above-ground vertex of every stone, pushed 8 mm outwards. A stone counts as hidden only if none of those rays gets through. The property belongs to the veranda: walk out among the stones and you can see all fifteen. With the current layout a single stone is hidden from most of the veranda, and two are hidden where one hiding place hands over to the next. If you move a stone in `src/layout.js`, run the verifier again.

In the browser, *Count* measures visibility differently. It draws the stones from your eye in flat ID colours, in four directions, and counts the IDs that survive the depth test.

## How it's made

The scripts are loaded in order by `index.html`. Each one registers what it provides on a shared `RJ` object, and later scripts take what they need from it. Plain scripts rather than ES modules are what let the page open from disk: browsers refuse to load modules from `file://` addresses.

- `src/layout.js` holds the garden's dimensions, the veranda and the fifteen stones.
- `src/stones.js` builds the procedural stone meshes: a noise-displaced icosphere with random planar cuts and weathered vertex colours. It is plain JavaScript, so the verifier can use it too.
- `src/islands.js` builds the moss beds, one per group, with outlines derived from the stones' footprints.
- `src/gravel.js` holds the gravel. A 3200 × 1280 heightmap (128 px per metre) is rendered as a bump map. The traditional pattern has concentric rings around each group, lines following the garden's edge and long east–west lines elsewhere, and it is computed per pixel. The rake's head is held at a fixed reach in front of you, across your line of sight. Each of its five tines cuts a groove along its own path, so walking draws parallel lines and turning on the spot sweeps concentric arcs.
- `src/scene.js` builds the oil-stained earthen walls, the veranda, eaves and hall, the pebble gutters and the sky. The walls are capped with layered bark (*hiwada-buki*), not tile, as they were restored in 1977.
- `src/trees.js` grows the trees beyond the walls, after those around the real garden:
  - Japanese red pines with crooked, red-barked trunks and flat pads of needles.
  - Maples that turn red and gold in November, and are bare in winter.
  - Weeping cherries leaning over the wall near the south-west corner, in blossom from late March to mid-April. Sources agree they lean over the wall but don't say exactly where they stand, so their positions here are approximate.
  - A dense backdrop of evergreen oaks and tall cedars.

  Trunks and branches are geometry. The foliage is about 35,000 small cards drawn with leaves, needles or blossoms. They are lit as soft rounded crowns, sway slightly, and glow when the sun is behind them. The season follows today's date in Kyoto (`?season=` overrides it).
- `src/sun.js` gives the solar position for Ryōan-ji (35.03° N, 135.72° E) and the colour of light by solar elevation.
- `src/audio.js` makes the sound procedurally, with nothing downloaded: wind, footsteps (a granular crunch on gravel, a muffled knock on the boards), the scrape of the rake, and now and then a distant temple bell.
- `vendor/three.min.js` is [three.js](https://threejs.org) r187 (MIT, see `vendor/three.LICENSE`) as a single script that defines a global `THREE`. It was made from the npm package with `esbuild three.module.js --bundle --minify --format=iife --global-name=THREE --legal-comments=inline`, and only needs remaking to upgrade three.js.

## Possible next steps

- Keep the rake pattern between visits.
- Stone steps (*kutsunugi-ishi*) up to the veranda, which you now climb without one.
- Weather: rain darkening the gravel, snow, falling leaves in autumn.
- A walk around the corner of the hall to the *tsukubai* water basin.
