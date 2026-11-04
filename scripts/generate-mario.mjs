// Builds an animated 8-bit platformer SVG from a GitHub contribution calendar.
// Usage:
//   GITHUB_TOKEN=xxx node scripts/generate-mario.mjs <github-login> [outDir]
//   node scripts/generate-mario.mjs --mock [outDir]      (random data, for local preview)
// Zero dependencies — needs Node 18+ (global fetch).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const MOCK = args.includes("--mock");
const positional = args.filter((a) => !a.startsWith("--"));
const LOGIN = MOCK ? "player-one" : positional[0];
const OUT_DIR = (MOCK ? positional[0] : positional[1]) || "dist";

if (!LOGIN) {
  console.error("Usage: node scripts/generate-mario.mjs <github-login> [outDir]");
  process.exit(1);
}

// ---------- data ----------

const LEVELS = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

async function fetchCalendar(login) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN env var is required");
  const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{
    totalContributions weeks{contributionDays{contributionCount contributionLevel date weekday}}}}}}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "mario-contrib" },
    body: JSON.stringify({ query, variables: { login } }),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const cal = json.data.user.contributionsCollection.contributionCalendar;
  return {
    total: cal.totalContributions,
    weeks: cal.weeks.map((w) =>
      w.contributionDays.map((d) => ({
        count: d.contributionCount,
        level: LEVELS[d.contributionLevel] ?? 0,
        date: d.date,
        weekday: d.weekday,
      }))
    ),
  };
}

function mockCalendar() {
  const weeks = [];
  let total = 0;
  const start = new Date();
  start.setDate(start.getDate() - 52 * 7 - start.getDay());
  for (let w = 0; w < 53; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      if (date > new Date()) break;
      const r = Math.random();
      const count = r < 0.35 ? 0 : Math.floor(r * r * 14);
      total += count;
      const level = count === 0 ? 0 : count < 3 ? 1 : count < 6 ? 2 : count < 9 ? 3 : 4;
      days.push({ count, level, date: date.toISOString().slice(0, 10), weekday: d });
    }
    weeks.push(days);
  }
  return { total, weeks };
}

function currentStreak(weeks) {
  const days = weeks.flat();
  let i = days.length - 1;
  if (i >= 0 && days[i].count === 0) i--; // today not counted yet is fine
  let streak = 0;
  for (; i >= 0 && days[i].count > 0; i--) streak++;
  return streak;
}

// ---------- art ----------

// Original 12x16 pixel hero (two run frames). Swap these to change the character.
// R cap/shirt, S skin, H hair, K eye/boots, B overalls, Y buttons, W gloves
const HERO_FRAMES = [
  [
    "...RRRRRR...",
    "..RRRRRRRR..",
    "..RRRRRRRRRR",
    "..HSSSSKSS..",
    "..HSSSSKSS..",
    "..HSSSSSSSS.",
    "...SSSSSS...",
    "..RRBRRBRR..",
    ".RRRBBBBRRR.",
    ".WRBBYBBYRW.",
    ".WWBBBBBBWW.",
    "...BBBBBB...",
    "...BBB.BBB..",
    "..DDD...DDD.",
    ".DDDD...DDDD",
    "............",
  ],
  [
    "...RRRRRR...",
    "..RRRRRRRR..",
    "..RRRRRRRRRR",
    "..HSSSSKSS..",
    "..HSSSSKSS..",
    "..HSSSSSSSS.",
    "...SSSSSS...",
    "...RRBRRB...",
    "..RRRBBBBR..",
    "..WRBYBBYW..",
    "..WWBBBBBW..",
    "....BBBBB...",
    "....BBBB....",
    "....DDDD....",
    "...DDDDD....",
    "............",
  ],
];

const HERO_COLORS = { R: "#e52521", S: "#fbd0a0", H: "#6b3a12", K: "#1b1b1b", B: "#2a4bd7", Y: "#ffd23f", W: "#ffffff", D: "#7a3b10" };

const THEMES = {
  day: {
    sky: ["#5c94fc", "#8fb8ff"],
    text: "#ffffff",
    textShadow: "#1b1b1b",
    empty: "rgba(255,255,255,0.18)",
    emptyStroke: "rgba(255,255,255,0.35)",
    ground: "#c84c0c",
    groundLine: "#7a2c06",
    groundTop: "#f0a060",
    hill: "#4caf50",
    hillDark: "#2e7d32",
    cloud: "#ffffff",
    pipe: "#43b047",
    pipeDark: "#1f6e24",
    pipeLight: "#9be36b",
    stars: false,
  },
  night: {
    sky: ["#0b1026", "#1f2a5a"],
    text: "#ffffff",
    textShadow: "#000000",
    empty: "rgba(255,255,255,0.06)",
    emptyStroke: "rgba(255,255,255,0.16)",
    ground: "#5a2a10",
    groundLine: "#2a1206",
    groundTop: "#8a4a20",
    hill: "#1d4d2a",
    hillDark: "#12331b",
    cloud: "#3a4680",
    pipe: "#2e7d32",
    pipeDark: "#134016",
    pipeLight: "#5fb85f",
    stars: true,
  },
};

const BLOCK = {
  1: { base: "#a0522d", line: "#5a2a10", hi: "#d2884f" }, // brick
  2: { base: "#d2691e", line: "#7a3b10", hi: "#f2a05c" }, // light brick
  3: { base: "#f8b800", line: "#a05000", hi: "#ffe48a", q: "#a05000" }, // ? block
  4: { base: "#ffd23f", line: "#c84c0c", hi: "#fff6c2", q: "#c84c0c" }, // shiny ? block
};

// ---------- layout ----------

const CELL = 12;
const PITCH = 14;
const SIDE = 52;
const HUD_H = 30;
const GRID_Y = HUD_H + 22;
const SCALE = 2;
const HERO_W = 12 * SCALE;
const HERO_H = 16 * SCALE;
const GROUND_Y = GRID_Y + 7 * PITCH + 88;
const HEIGHT = GROUND_Y + 32;

const STEP = 0.2; // seconds per week column
const PAUSE = 2.4; // seconds at the end before restarting

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
const pct = (t, total) => `${((t / total) * 100).toFixed(3)}%`;

function heroFrame(rows, id) {
  let rects = "";
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== ".") rects += `<rect x="${x * SCALE}" y="${y * SCALE}" width="${SCALE}" height="${SCALE}" fill="${HERO_COLORS[ch]}"/>`;
    })
  );
  return `<g id="${id}">${rects}</g>`;
}

function blockSymbols(t) {
  const c = CELL;
  let out = `<symbol id="b0" viewBox="0 0 ${c} ${c}"><rect x="0.5" y="0.5" width="${c - 1}" height="${c - 1}" rx="2" fill="${t.empty}" stroke="${t.emptyStroke}"/></symbol>`;
  for (const lvl of [1, 2]) {
    const b = BLOCK[lvl];
    out += `<symbol id="b${lvl}" viewBox="0 0 ${c} ${c}">
      <rect width="${c}" height="${c}" fill="${b.base}"/>
      <rect width="${c}" height="1" fill="${b.hi}"/>
      <path d="M0 4h${c}M0 8h${c}M6 0v4M3 4v4M9 4v4M6 8v4" stroke="${b.line}" stroke-width="1"/>
      <rect x="0" y="${c - 1}" width="${c}" height="1" fill="${b.line}"/></symbol>`;
  }
  for (const lvl of [3, 4]) {
    const b = BLOCK[lvl];
    out += `<symbol id="b${lvl}" viewBox="0 0 ${c} ${c}">
      <rect width="${c}" height="${c}" rx="1" fill="${b.base}"/>
      <rect x="0.5" y="0.5" width="${c - 1}" height="${c - 1}" rx="1" fill="none" stroke="${b.line}"/>
      <rect x="1" y="1" width="${c - 2}" height="1" fill="${b.hi}"/>
      <rect x="2" y="2" width="1" height="1" fill="${b.line}"/><rect x="${c - 3}" y="2" width="1" height="1" fill="${b.line}"/>
      <rect x="2" y="${c - 3}" width="1" height="1" fill="${b.line}"/><rect x="${c - 3}" y="${c - 3}" width="1" height="1" fill="${b.line}"/>
      <path d="M4.5 4.2q0-1.4 1.5-1.4t1.5 1.4q0 .9-1 1.4t-.5 1.2M6 8.6v.6" stroke="${b.q}" stroke-width="1.2" fill="none" stroke-linecap="square"/></symbol>`;
  }
  return out;
}

function cloud(x, y, s, color) {
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="${color}">
    <rect x="8" y="8" width="40" height="12" rx="6"/><circle cx="20" cy="9" r="8"/><circle cx="33" cy="6" r="10"/><circle cx="44" cy="11" r="6"/></g>`;
}

function pipe(x, t) {
  const h = 40;
  const y = GROUND_Y - h;
  return `<g>
    <rect x="${x + 3}" y="${y + 10}" width="30" height="${h - 10}" fill="${t.pipe}" stroke="${t.pipeDark}" stroke-width="2"/>
    <rect x="${x + 7}" y="${y + 12}" width="4" height="${h - 14}" fill="${t.pipeLight}"/>
    <rect x="${x}" y="${y}" width="36" height="12" fill="${t.pipe}" stroke="${t.pipeDark}" stroke-width="2"/>
    <rect x="${x + 4}" y="${y + 2}" width="4" height="8" fill="${t.pipeLight}"/></g>`;
}

function stars(width) {
  let s = "";
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 40; i++) {
    const x = Math.round(rnd() * width);
    const y = Math.round(rnd() * (GROUND_Y - 60));
    const d = (rnd() * 3).toFixed(2);
    s += `<rect class="star" style="animation-delay:${d}s" x="${x}" y="${y}" width="2" height="2" fill="#fff"/>`;
  }
  const my = GRID_Y + 7 * PITCH + 34;
  return s + `<circle cx="${width * 0.33}" cy="${my}" r="12" fill="#fff7c2"/><circle cx="${width * 0.33 + 6}" cy="${my - 4}" r="11" fill="#1a2350"/>`;
}

// ---------- svg ----------

function render(cal, login, themeName) {
  const t = THEMES[themeName];
  const weeks = cal.weeks;
  const W = weeks.length;
  const WIDTH = SIDE * 2 + W * PITCH - (PITCH - CELL);
  const RUN = W * STEP;
  const DUR = RUN + PAUSE;
  const heroRestY = GROUND_Y - HERO_H;
  const JUMP = heroRestY - (GRID_Y + 7 * PITCH - (PITCH - CELL)); // head taps the bottom row
  const colCenter = (i) => SIDE + i * PITCH + CELL / 2;
  const active = weeks.map((w) => w.some((d) => d.count > 0));
  const coins = weeks.reduce((n, w) => n + w.filter((d) => d.count > 0).length, 0);
  const streak = currentStreak(weeks);

  // hero horizontal run (linear) + fade at the end
  const x0 = colCenter(0) - HERO_W / 2;
  const x1 = colCenter(W - 1) - HERO_W / 2;
  const heroX = `@keyframes hx{0%{transform:translateX(${x0}px);opacity:0}1.5%{opacity:1}${pct(RUN, DUR)}{transform:translateX(${x1}px);opacity:1}${pct(RUN + PAUSE * 0.6, DUR)}{opacity:0}100%{transform:translateX(${x1}px);opacity:0}}`;

  // hero vertical: jump under every active column, peak exactly at its center time
  let ky = `0%{transform:translateY(0)}`;
  weeks.forEach((_, i) => {
    if (!active[i]) return;
    const s = i * STEP, m = s + STEP / 2, e = s + STEP;
    ky += `${pct(s, DUR)}{transform:translateY(0);animation-timing-function:cubic-bezier(.2,.6,.4,1)}`;
    ky += `${pct(m, DUR)}{transform:translateY(-${JUMP}px);animation-timing-function:cubic-bezier(.6,0,.8,.4)}`;
    ky += `${pct(e, DUR)}{transform:translateY(0)}`;
  });
  ky += `100%{transform:translateY(0)}`;
  const heroY = `@keyframes hy{${ky}}`;

  const bumpLen = 0.24;
  const bump = `@keyframes bump{0%{transform:translateY(0)}${pct(bumpLen / 2, DUR)}{transform:translateY(-5px)}${pct(bumpLen, DUR)}{transform:translateY(0)}100%{transform:translateY(0)}}`;
  const coinLen = 0.6;
  const coin = `@keyframes coin{0%{transform:translateY(0) scaleX(1);opacity:1}${pct(coinLen / 2, DUR)}{transform:translateY(-22px) scaleX(.2);opacity:1}${pct(coinLen, DUR)}{transform:translateY(-14px) scaleX(1);opacity:0}100%{opacity:0}}`;

  const css = `
    ${heroX}${heroY}${bump}${coin}
    @keyframes run{0%,49.9%{opacity:1}50%,100%{opacity:0}}
    @keyframes run2{0%,49.9%{opacity:0}50%,100%{opacity:1}}
    @keyframes drift{from{transform:translateX(0)}to{transform:translateX(-${WIDTH + 120}px)}}
    @keyframes twinkle{0%,100%{opacity:.9}50%{opacity:.2}}
    .hx{animation:hx ${DUR}s linear infinite}
    .hy{animation:hy ${DUR}s infinite}
    .f1{animation:run .24s steps(1) infinite}
    .f2{animation:run2 .24s steps(1) infinite}
    .col{animation:bump ${DUR}s linear infinite;transform-box:fill-box}
    .coin{opacity:0;animation:coin ${DUR}s ease-out infinite;transform-box:fill-box;transform-origin:center}
    .cloud{animation:drift 90s linear infinite}
    .star{animation:twinkle 3s ease-in-out infinite}
    .hud{font:bold 13px 'Press Start 2P','Courier New',monospace;fill:${t.text};letter-spacing:1px}
    .hud-s{font:bold 13px 'Press Start 2P','Courier New',monospace;fill:${t.textShadow};letter-spacing:1px}`;

  // grid
  let grid = "";
  let coinEls = "";
  weeks.forEach((days, i) => {
    const delay = (i * STEP + STEP / 2).toFixed(3);
    let cells = "";
    days.forEach((d) => {
      const x = SIDE + i * PITCH;
      const y = GRID_Y + d.weekday * PITCH;
      cells += `<use href="#b${d.level}" x="${x}" y="${y}" width="${CELL}" height="${CELL}"><title>${d.date}: ${d.count} contribution${d.count === 1 ? "" : "s"}</title></use>`;
    });
    grid += active[i] ? `<g class="col" style="animation-delay:${delay}s">${cells}</g>` : `<g>${cells}</g>`;
    if (active[i]) {
      const top = Math.min(...days.filter((d) => d.count > 0).map((d) => d.weekday));
      const cy = GRID_Y + top * PITCH - 4;
      coinEls += `<g class="coin" style="animation-delay:${delay}s"><ellipse cx="${colCenter(i)}" cy="${cy}" rx="4" ry="6" fill="#ffd23f" stroke="#a05000"/><rect x="${colCenter(i) - 0.5}" y="${cy - 3}" width="1" height="6" fill="#a05000"/></g>`;
    }
  });

  const hudY = 22;
  const hudText = (x, str, anchor = "start") =>
    `<text class="hud-s" x="${x + 2}" y="${hudY + 2}" text-anchor="${anchor}">${esc(str)}</text><text class="hud" x="${x}" y="${hudY}" text-anchor="${anchor}">${esc(str)}</text>`;
  const year = (weeks.at(-1)?.at(-1)?.date || new Date().toISOString()).slice(0, 4);

  const hills = `<ellipse cx="${WIDTH * 0.18}" cy="${GROUND_Y}" rx="70" ry="38" fill="${t.hill}" stroke="${t.hillDark}" stroke-width="2"/>
    <ellipse cx="${WIDTH * 0.62}" cy="${GROUND_Y}" rx="48" ry="26" fill="${t.hill}" stroke="${t.hillDark}" stroke-width="2"/>
    <ellipse cx="${WIDTH * 0.86}" cy="${GROUND_Y}" rx="60" ry="32" fill="${t.hill}" stroke="${t.hillDark}" stroke-width="2"/>`;

  const clouds = `<g class="cloud">${cloud(WIDTH * 0.1, GRID_Y + 7 * PITCH + 10, 0.8, t.cloud)}${cloud(WIDTH * 0.45, GRID_Y + 7 * PITCH + 26, 0.6, t.cloud)}${cloud(WIDTH * 0.8, GRID_Y + 7 * PITCH + 6, 0.9, t.cloud)}${cloud(WIDTH * 1.15, GRID_Y + 7 * PITCH + 20, 0.7, t.cloud)}${cloud(WIDTH * 1.5, GRID_Y + 7 * PITCH + 12, 0.8, t.cloud)}</g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${esc(login)}: ${cal.total} contributions in the last year">
<title>${esc(login)} — ${cal.total} contributions in the last year</title>
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.sky[0]}"/><stop offset="1" stop-color="${t.sky[1]}"/></linearGradient>
  <pattern id="ground" width="16" height="16" patternUnits="userSpaceOnUse" y="${GROUND_Y}">
    <rect width="16" height="16" fill="${t.ground}"/>
    <path d="M0 .5h16M0 8.5h16M8 0v8M0 8v8" stroke="${t.groundLine}" stroke-width="1"/>
    <rect x="1" y="1" width="6" height="1" fill="${t.groundTop}"/><rect x="9" y="9" width="6" height="1" fill="${t.groundTop}"/>
  </pattern>
  ${blockSymbols(t)}
  ${heroFrame(HERO_FRAMES[0], "hero1")}
  ${heroFrame(HERO_FRAMES[1], "hero2")}
</defs>
<style>${css}</style>
<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky)"/>
${t.stars ? stars(WIDTH) : ""}
${clouds}
${hills}
${pipe(6, t)}${pipe(WIDTH - 42, t)}
${hudText(SIDE, login.toUpperCase())}
${hudText(WIDTH * 0.42, `SCORE ${String(cal.total).padStart(6, "0")}`, "middle")}
${hudText(WIDTH * 0.66, `● x${String(coins).padStart(3, "0")}`, "middle")}
${hudText(WIDTH - SIDE, `STREAK ${streak}  ${year}`, "end")}
${coinEls}
${grid}
<g class="hx"><g class="hy" transform="translate(0 0)"><g transform="translate(0 ${heroRestY})">
  <use href="#hero1" class="f1"/><use href="#hero2" class="f2"/>
</g></g></g>
<rect x="0" y="${GROUND_Y}" width="${WIDTH}" height="${HEIGHT - GROUND_Y}" fill="url(#ground)"/>
</svg>`;
}

// ---------- main ----------

const cal = MOCK ? mockCalendar() : await fetchCalendar(LOGIN);
mkdirSync(OUT_DIR, { recursive: true });
for (const theme of Object.keys(THEMES)) {
  const file = join(OUT_DIR, `mario-contributions-${theme}.svg`);
  writeFileSync(file, render(cal, LOGIN, theme));
  console.log(`wrote ${file}`);
}
console.log(`${cal.total} contributions across ${cal.weeks.length} weeks`);
