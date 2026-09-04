// Default state for a fresh install. Everything here is editable from the portal.

const now = Date.now();
const daysAgo = (n, hour = 10) => {
  const d = new Date(now - n * 86400000);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

export function createSeed() {
  return {
    version: 1,
    members: {
      david: {
        id: 'david',
        name: 'David',
        role: 'partner',
        avatar: {
          skin: 'tan',
          hair: 'short',
          hairColor: 'brown',
          eyes: 'round',
          mouth: 'smile',
          accessory: 'none',
          shirt: 'blue',
          background: 'sky',
          personality: 'calm',
        },
      },
      partner: {
        id: 'partner',
        name: 'Love',
        role: 'partner',
        avatar: {
          skin: 'light',
          hair: 'long',
          hairColor: 'auburn',
          eyes: 'happy',
          mouth: 'grin',
          accessory: 'earrings',
          shirt: 'rose',
          background: 'peach',
          personality: 'warm',
        },
      },
    },
    messages: [
      {
        id: 'm-welcome',
        from: 'david',
        to: 'partner',
        kind: 'feeling',
        soft: false,
        text: 'I built this so our avatars can say the things we forget to. Look around — it is yours.',
        createdAt: daysAgo(0, 9),
        readAt: null,
        reaction: null,
      },
    ],
    finances: {
      currency: 'CZK',
      monthlyBudget: 60000,
      balance: 184500,
      transactions: [
        { id: 't1', date: daysAgo(1), label: 'Groceries', category: 'Food', amount: 2140 },
        { id: 't2', date: daysAgo(2), label: 'Electricity', category: 'Home', amount: 3200 },
        { id: 't3', date: daysAgo(3), label: 'Dinner out', category: 'Fun', amount: 1450 },
        { id: 't4', date: daysAgo(5), label: 'Fuel', category: 'Transport', amount: 1800 },
        { id: 't5', date: daysAgo(6), label: 'Groceries', category: 'Food', amount: 1890 },
        { id: 't6', date: daysAgo(8), label: 'Kids shoes', category: 'Kids', amount: 2600 },
        { id: 't7', date: daysAgo(10), label: 'Rent', category: 'Home', amount: 22000 },
        { id: 't8', date: daysAgo(12), label: 'Pharmacy', category: 'Health', amount: 640 },
      ],
    },
    work: {
      headline: 'Where my work is heading',
      projects: [
        {
          id: 'w1',
          title: 'FamilyOS portal',
          status: 'active',
          progress: 35,
          heading: 'A calm place where we both see the same picture.',
          nextStep: 'Finish the finance dashboard, then the avatar studio.',
          updates: [
            { id: 'wu1', text: 'First version of the portal is live.', createdAt: daysAgo(0, 8) },
          ],
        },
      ],
    },
    goals: [
      {
        id: 'g1',
        title: 'Emergency fund',
        category: 'Money',
        unit: 'CZK',
        target: 300000,
        current: 184500,
        note: 'Six months of expenses, so we never have to panic.',
      },
      {
        id: 'g2',
        title: 'Weekend away, just us',
        category: 'Together',
        unit: 'CZK',
        target: 15000,
        current: 4000,
        note: 'No laptops. No kids. One weekend.',
      },
      {
        id: 'g3',
        title: 'Evening walks this month',
        category: 'Health',
        unit: 'walks',
        target: 12,
        current: 3,
        note: '',
      },
    ],
  };
}
