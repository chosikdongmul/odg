export const ROLES = {
  top: { label: 'TOP', ko: '탑', kind: 'player' },
  jungle: { label: 'JUNGLE', ko: '정글', kind: 'player' },
  mid: { label: 'MID', ko: '미드', kind: 'player' },
  bot: { label: 'BOT', ko: '원거리 딜러', kind: 'player' },
  support: { label: 'SUPPORT', ko: '서포터', kind: 'player' },
  'head-coach': { label: 'HEAD COACH', ko: '감독', kind: 'staff' },
  coach: { label: 'COACH', ko: '코치', kind: 'staff' },
  analyst: { label: 'ANALYST', ko: '애널리스트', kind: 'staff' },
} as const;

export type Role = keyof typeof ROLES;
