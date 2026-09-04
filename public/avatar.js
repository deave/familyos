// Renders a member's avatar as an inline SVG string. Every option is a named
// choice so the same avatar looks identical everywhere it appears.

export const PALETTE = {
  skin: {
    porcelain: '#f8e3d6',
    light: '#f1cfb3',
    tan: '#d9a679',
    olive: '#c68e5b',
    brown: '#8d5a3b',
    deep: '#5c3a27',
  },
  hairColor: {
    black: '#1f1a1a',
    brown: '#5b3a21',
    auburn: '#8f3b1b',
    blonde: '#e3b95c',
    silver: '#c9c9cf',
    blue: '#3b6fd6',
  },
  shirt: {
    blue: '#2a78d6',
    rose: '#e87ba4',
    green: '#1baf7a',
    yellow: '#eda100',
    violet: '#4a3aa7',
    charcoal: '#3a3a3a',
  },
  background: {
    sky: '#d7e9fb',
    peach: '#fde1d3',
    mint: '#d5f2e6',
    lavender: '#e4dff7',
    sand: '#f5ecd7',
    night: '#2a2f45',
  },
};

export const LABELS = {
  skin: 'Skin',
  hair: 'Hair',
  hairColor: 'Hair colour',
  eyes: 'Eyes',
  mouth: 'Mouth',
  accessory: 'Accessory',
  shirt: 'Top',
  background: 'Backdrop',
  personality: 'How I speak',
};

export const PERSONALITY_BLURBS = {
  warm: 'Gentle and affectionate. Softens the edges of everything.',
  playful: 'Light, teasing, a little cheeky. Makes hard things easier.',
  calm: 'Even and unhurried. Says what matters, then stops.',
  direct: 'Clear and to the point. No fluff, no guessing.',
};

const INK = '#2b2118';

function darken(hex, amount = 0.18) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.round(c * (1 - amount)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function hairBack(style, color) {
  switch (style) {
    case 'long':
      return `<path d="M52 92 C48 60 70 34 100 34 C130 34 152 60 148 92 L150 168 L50 168 Z" fill="${color}"/>`;
    case 'bob':
      return `<path d="M52 92 C48 58 70 34 100 34 C130 34 152 58 148 92 L148 138 C140 150 60 150 52 138 Z" fill="${color}"/>`;
    case 'curly':
      return `<g fill="${color}">
        <circle cx="58" cy="80" r="16"/><circle cx="142" cy="80" r="16"/>
        <circle cx="56" cy="104" r="14"/><circle cx="144" cy="104" r="14"/>
        <circle cx="62" cy="126" r="13"/><circle cx="138" cy="126" r="13"/>
        <circle cx="70" cy="52" r="15"/><circle cx="130" cy="52" r="15"/>
        <circle cx="100" cy="40" r="17"/><circle cx="85" cy="44" r="15"/><circle cx="115" cy="44" r="15"/>
      </g>`;
    default:
      return '';
  }
}

function hairFront(style, color) {
  const dark = darken(color, 0.12);
  switch (style) {
    case 'short':
      return `<path d="M54 92 C50 52 70 36 100 36 C130 36 150 52 146 92 C140 72 126 62 100 64 C74 62 60 72 54 92 Z" fill="${color}"/>`;
    case 'buzz':
      return `<path d="M56 84 C56 52 74 40 100 40 C126 40 144 52 144 84 C136 66 120 58 100 58 C80 58 64 66 56 84 Z" fill="${color}" opacity="0.9"/>`;
    case 'long':
      return `<path d="M52 92 C50 52 70 36 100 36 C130 36 150 52 148 92 C142 66 128 58 108 62 C104 70 96 70 92 62 C72 58 58 66 52 92 Z" fill="${dark}"/>`;
    case 'bob':
      return `<path d="M52 92 C50 52 70 36 100 36 C130 36 150 52 148 92 C142 66 128 58 112 62 C100 74 84 60 70 66 C62 72 56 80 52 92 Z" fill="${dark}"/>`;
    case 'curly':
      return `<g fill="${dark}"><circle cx="76" cy="56" r="12"/><circle cx="100" cy="48" r="13"/><circle cx="124" cy="56" r="12"/></g>`;
    case 'bun':
      return `<circle cx="100" cy="36" r="18" fill="${color}"/>
        <path d="M54 92 C50 52 70 38 100 38 C130 38 150 52 146 92 C140 72 126 62 100 64 C74 62 60 72 54 92 Z" fill="${dark}"/>`;
    case 'bald':
      return `<ellipse cx="100" cy="46" rx="26" ry="8" fill="#ffffff" opacity="0.18"/>`;
    default:
      return '';
  }
}

function eyes(style) {
  const e = `fill="${INK}"`;
  const round = (x) => `<circle cx="${x}" cy="96" r="5" ${e}/><circle cx="${x + 2}" cy="94" r="1.6" fill="#fff"/>`;
  const happy = (x) => `<path d="M${x - 7} 98 q7 -9 14 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  const sleepy = (x) => `<path d="M${x - 6} 95 q6 6 12 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  switch (style) {
    case 'happy':
      return happy(80) + happy(120);
    case 'wink':
      return round(80) + happy(120);
    case 'sleepy':
      return sleepy(80) + sleepy(120);
    default:
      return round(80) + round(120);
  }
}

function mouth(style) {
  switch (style) {
    case 'grin':
      return `<path d="M84 118 q16 18 32 0 Z" fill="${INK}"/><path d="M88 119 q12 6 24 0 Z" fill="#fff"/>`;
    case 'neutral':
      return `<path d="M88 122 h24" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
    case 'oh':
      return `<ellipse cx="100" cy="123" rx="6" ry="8" fill="${INK}"/>`;
    default:
      return `<path d="M86 118 q14 14 28 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  }
}

function accessory(style) {
  switch (style) {
    case 'glasses':
      return `<g fill="none" stroke="${INK}" stroke-width="2.5">
        <circle cx="80" cy="96" r="12"/><circle cx="120" cy="96" r="12"/>
        <path d="M92 96 h16 M68 94 l-8 -4 M132 94 l8 -4"/></g>`;
    case 'earrings':
      return `<circle cx="52" cy="118" r="3.5" fill="#eda100"/><circle cx="148" cy="118" r="3.5" fill="#eda100"/>`;
    case 'flower':
      return `<g transform="translate(140 60)">
        <circle cx="0" cy="-7" r="5" fill="#e87ba4"/><circle cx="7" cy="0" r="5" fill="#e87ba4"/>
        <circle cx="0" cy="7" r="5" fill="#e87ba4"/><circle cx="-7" cy="0" r="5" fill="#e87ba4"/>
        <circle cx="0" cy="0" r="3.5" fill="#eda100"/></g>`;
    case 'cap':
      return `<path d="M54 74 C58 44 82 30 100 30 C118 30 142 44 146 74 Z" fill="${darken('#2a78d6', 0.1)}"/>
        <path d="M50 74 h100 a4 4 0 0 1 0 8 h-100 a4 4 0 0 1 0 -8 Z" fill="#1c5cab"/>
        <path d="M146 76 h30 a6 6 0 0 1 0 10 h-30 Z" fill="#1c5cab"/>`;
    default:
      return '';
  }
}

/**
 * @param {object} a avatar options
 * @param {{size?: number, mood?: string, className?: string}} opts
 */
export function renderAvatar(a, { size = 96, className = '' } = {}) {
  const skin = PALETTE.skin[a.skin] || PALETTE.skin.light;
  const hair = PALETTE.hairColor[a.hairColor] || PALETTE.hairColor.brown;
  const shirt = PALETTE.shirt[a.shirt] || PALETTE.shirt.blue;
  const bg = PALETTE.background[a.background] || PALETTE.background.sky;
  const cheeks = a.skin === 'deep' || a.skin === 'brown' ? 'rgba(255,255,255,0.14)' : 'rgba(232,123,164,0.35)';

  return `<svg class="avatar ${className}" width="${size}" height="${size}" viewBox="0 0 200 200" role="img" aria-label="avatar">
    <defs><clipPath id="avclip"><circle cx="100" cy="100" r="98"/></clipPath></defs>
    <circle cx="100" cy="100" r="98" fill="${bg}"/>
    <g clip-path="url(#avclip)">
      ${hairBack(a.hair, hair)}
      <path d="M40 200 C40 160 62 146 100 146 C138 146 160 160 160 200 Z" fill="${shirt}"/>
      <rect x="86" y="128" width="28" height="28" rx="8" fill="${darken(skin, 0.1)}"/>
      <ellipse cx="52" cy="104" rx="9" ry="12" fill="${skin}"/>
      <ellipse cx="148" cy="104" rx="9" ry="12" fill="${skin}"/>
      <ellipse cx="100" cy="96" rx="48" ry="56" fill="${skin}"/>
      <circle cx="70" cy="112" r="7" fill="${cheeks}"/>
      <circle cx="130" cy="112" r="7" fill="${cheeks}"/>
      ${eyes(a.eyes)}
      <path d="M70 82 q10 -6 20 0 M110 82 q10 -6 20 0" stroke="${darken(hair, 0.1)}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.85"/>
      ${mouth(a.mouth)}
      ${hairFront(a.hair, hair)}
      ${accessory(a.accessory)}
    </g>
  </svg>`;
}
