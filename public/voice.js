// How an avatar phrases things. The recipient's avatar "delivers" the sender's
// note, so every intro is spoken by the reader's own avatar, in its own voice.
// Templates use {s} for the sender's name and {r} for the reader's name.

const INTROS = {
  warm: {
    feeling: ['{s} asked me to tell you how things feel right now.', '{s} has something from the heart for you.'],
    plan: ['{s} has been thinking about what comes next and wanted you in on it.', 'A little plan from {s}, for the two of you.'],
    work: ['{s} wanted you to see where the work is heading.', 'Here is what {s} has been building.'],
    money: ['{s} wanted to share something about our money, gently.', 'A money note from {s} — nothing to worry about, just so you know.'],
    thanks: ['{s} wanted to say thank you, properly.', '{s} noticed something you did and wanted you to know it mattered.'],
    request: ['{s} has a small ask, and hoped you would hear it kindly.', 'Something {s} would love your help with:'],
    reply: ['{s} wrote back.', 'A reply from {s}, carried over by me.'],
  },
  playful: {
    feeling: ['Psst. {s} has feelings and I have been asked to deliver them.', 'Incoming from the heart of {s}:'],
    plan: ['{s} has a plan. It might even be a good one.', 'Scheming alert — {s} says:'],
    work: ['Progress report from the {s} department:', '{s} has been busy. Here is the proof.'],
    money: ['Money talk from {s}. Deep breath, it is fine.', '{s} peeked at the numbers and wanted you to peek too.'],
    thanks: ['{s} is being sweet again. Brace yourself.', 'Gold star from {s}:'],
    request: ['{s} would like a favour and sent me to ask nicely.', 'Tiny request from {s}. Puppy eyes included.'],
    reply: ['{s} replied. Told you they would.', 'Reply from {s}, hot off the press.'],
  },
  calm: {
    feeling: ['{s} wants you to know how things feel.', 'From {s}, about how they are doing:'],
    plan: ['{s} has a plan to share.', 'Something {s} is thinking of doing next:'],
    work: ['An update on the work, from {s}.', '{s} on where the work is heading:'],
    money: ['A note about money, from {s}.', '{s} wanted you to see this about our money:'],
    thanks: ['{s} wanted to thank you.', 'From {s}, with gratitude:'],
    request: ['{s} has a request.', '{s} is asking for something:'],
    reply: ['{s} replied.', 'A reply from {s}:'],
  },
  direct: {
    feeling: ['{s} says:', 'How {s} feels, in their words:'],
    plan: ['The plan, from {s}:', '{s} wants to do this:'],
    work: ['Work status from {s}:', 'What {s} is doing:'],
    money: ['Money, from {s}:', '{s} on the money:'],
    thanks: ['{s} says thanks:', 'Credit where due, from {s}:'],
    request: ['{s} needs:', 'Ask from {s}:'],
    reply: ['{s} replied:', 'Reply from {s}:'],
  },
};

const SOFT_PREFACE = {
  warm: '{s} found this hard to say out loud, so I am saying it for them — softly.',
  playful: 'This one was tricky for {s} to say face to face, so you get me instead. Lucky you.',
  calm: '{s} asked me to carry this one, because it was hard to say directly.',
  direct: '{s} could not say this in person. Here it is anyway.',
};

const REACTION_LABELS = {
  heart: 'loved it',
  thumbs: 'is on board',
  hug: 'sends a hug',
  talk: 'wants to talk about it',
};

const KIND_LABELS = {
  feeling: 'A feeling',
  plan: 'A plan',
  work: 'About work',
  money: 'About money',
  thanks: 'A thank you',
  request: 'A request',
  reply: 'A reply',
};

const KIND_ICONS = {
  feeling: '💛',
  plan: '🗺️',
  work: '🛠️',
  money: '💰',
  thanks: '🙏',
  request: '🤲',
  reply: '↩️',
};

function pick(list, seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

function fill(t, vars) {
  return t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

export function kindLabel(kind) {
  return KIND_LABELS[kind] || 'A note';
}
export function kindIcon(kind) {
  return KIND_ICONS[kind] || '💬';
}
export function reactionLabel(r) {
  return REACTION_LABELS[r] || '';
}

/** Lines the reader's avatar says while handing over a message. */
export function deliver(message, sender, reader) {
  const p = reader.avatar.personality || 'calm';
  const vars = { s: sender.name, r: reader.name };
  const lines = [];
  if (message.soft) lines.push(fill(SOFT_PREFACE[p] || SOFT_PREFACE.calm, vars));
  const table = INTROS[p] || INTROS.calm;
  lines.push(fill(pick(table[message.kind] || table.feeling, message.id), vars));
  return lines;
}

/** Sample line for the avatar studio, so you can hear a personality before choosing it. */
export function sample(personality, name, otherName) {
  const table = INTROS[personality] || INTROS.calm;
  return fill(table.feeling[0], { s: otherName, r: name });
}

function timeOfDay(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'night';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

/**
 * The opening line on the home screen. Personality picks the tone; the facts
 * (unread notes, budget pace, goals) come from the summary object.
 */
export function greeting(reader, other, summary) {
  const p = reader.avatar.personality || 'calm';
  const tod = timeOfDay();
  const hello = {
    warm: { morning: `Good morning, ${reader.name}.`, afternoon: `Hello, ${reader.name}.`, evening: `Good evening, ${reader.name}.`, night: `Still up, ${reader.name}? I am here.` },
    playful: { morning: `Morning, ${reader.name}! Coffee first, then me.`, afternoon: `Afternoon, ${reader.name}.`, evening: `Evening, ${reader.name}.`, night: `It is late, ${reader.name}. I will be quick.` },
    calm: { morning: `Good morning, ${reader.name}.`, afternoon: `Good afternoon, ${reader.name}.`, evening: `Good evening, ${reader.name}.`, night: `Hello, ${reader.name}.` },
    direct: { morning: `Morning, ${reader.name}.`, afternoon: `Hi, ${reader.name}.`, evening: `Evening, ${reader.name}.`, night: `Hi, ${reader.name}.` },
  }[p][tod];

  const parts = [hello];

  const n = summary.unread;
  if (n > 0) {
    parts.push(
      {
        warm: n === 1 ? `${other.name} left you a note — I have it ready for you.` : `${other.name} left you ${n} notes. Take them one at a time.`,
        playful: n === 1 ? `${other.name} sent one note. Just one. Restrained.` : `${other.name} sent ${n} notes. Someone is chatty.`,
        calm: n === 1 ? `There is one new note from ${other.name}.` : `There are ${n} new notes from ${other.name}.`,
        direct: n === 1 ? `1 new note from ${other.name}.` : `${n} new notes from ${other.name}.`,
      }[p]
    );
  } else {
    parts.push(
      {
        warm: `Nothing new from ${other.name} today — but that just means all is quiet, not that you are forgotten.`,
        playful: `No new notes from ${other.name}. I have poked them. Sort of.`,
        calm: `No new notes from ${other.name}.`,
        direct: `No new notes.`,
      }[p]
    );
  }

  if (summary.budget > 0) {
    const pct = Math.round(summary.spentPct);
    const money = {
      onTrack: {
        warm: `Money-wise we are at ${pct}% of the month's budget with ${summary.daysLeft} days to go. We are doing fine.`,
        playful: `Budget: ${pct}% gone, ${summary.daysLeft} days left. Look at us, being adults.`,
        calm: `Spending is at ${pct}% of the budget, with ${summary.daysLeft} days left. On track.`,
        direct: `Budget ${pct}% used, ${summary.daysLeft} days left. On track.`,
      },
      ahead: {
        warm: `We have spent ${pct}% of the month's budget a little faster than usual, with ${summary.daysLeft} days to go. Worth a glance, nothing more.`,
        playful: `We are ${pct}% through the budget with ${summary.daysLeft} days left. Slightly spicy. Maybe skip the third takeaway.`,
        calm: `Spending is running ahead of pace: ${pct}% of the budget used with ${summary.daysLeft} days left.`,
        direct: `Budget ${pct}% used, ${summary.daysLeft} days left. Ahead of pace.`,
      },
      over: {
        warm: `We have gone past this month's budget. It happens — the numbers are on the money page whenever you want to look together.`,
        playful: `Budget: over. Oops. The money page has the receipts, and I have no judgement.`,
        calm: `This month's budget is used up. The money page shows where it went.`,
        direct: `Budget exceeded. Details on the money page.`,
      },
    };
    const key = summary.spentPct >= 100 ? 'over' : summary.spentPct > summary.pacePct + 10 ? 'ahead' : 'onTrack';
    parts.push(money[key][p]);
  }

  return parts;
}
