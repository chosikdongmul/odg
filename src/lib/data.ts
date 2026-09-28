import type { ImageMetadata } from 'astro';
import { z } from 'zod';
import * as S from './schema';
import { ROLES } from './roles';

import teamRaw from '../data/team.json';
import peopleRaw from '../data/people.json';
import matchesRaw from '../data/matches.json';
import bannersRaw from '../data/banners.json';
import galleryRaw from '../data/gallery.json';
import partnersRaw from '../data/partners.json';
import sponsorshipRaw from '../data/sponsorship.json';
import mediakitRaw from '../data/mediakit.json';
import storeRaw from '../data/store.json';
import textsRaw from '../data/texts.json';

// 어드민이 쓴 JSON을 여기서 한 번 검사한다. 틀리면 어느 파일 어느 칸인지 알려주고 빌드를 멈춘다.
function parse<T extends z.ZodType>(file: string, schema: T, raw: unknown): z.output<T> {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const where = r.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`src/data/${file}.json 형식 오류\n${where}`);
  }
  return r.data;
}

export const team = parse('team', S.team, teamRaw);
const allPeople = parse('people', S.people, peopleRaw);
const allMatches = parse('matches', S.matches, matchesRaw);
export const banners = parse('banners', S.banners, bannersRaw);
export const gallery = parse('gallery', S.gallery, galleryRaw);
export const partners = parse('partners', S.partners, partnersRaw);
export const sponsorship = parse('sponsorship', S.sponsorship, sponsorshipRaw);
export const mediakit = parse('mediakit', S.mediakit, mediakitRaw);
export const store = parse('store', S.store, storeRaw);
export const tx = parse('texts', S.texts, textsRaw);
export const roleKo = (r: keyof typeof tx.roles) => tx.roles[r].ko;
export const roleEn = (r: keyof typeof tx.roles) => tx.roles[r].en;

// ─── 이미지: JSON에는 "uploads/파일명" 만 적고, 여기서 실제 이미지로 연결한다.
const assets = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/uploads/*.{jpg,jpeg,png,webp,avif,gif,svg}',
  { eager: true },
);
export function img(path?: string): ImageMetadata | undefined {
  if (!path) return undefined;
  const hit = assets[`/src/assets/${path.replace(/^\/+/, '')}`];
  if (!hit) throw new Error(`이미지를 찾을 수 없음: src/assets/${path}`);
  return hit.default;
}

// ─── 링크: base 경로(/team-site 등) 붙이기
export const withBase = (p: string) =>
  /^(https?:|mailto:|#)/.test(p) ? p : `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${p.replace(/^\//, '')}`;

// ─── 사람
export type Person = S.Person;
const visible = allPeople.filter((p) => p.visible);
const byRole = (a: Person, b: Person) =>
  Object.keys(ROLES).indexOf(a.role) - Object.keys(ROLES).indexOf(b.role);
export const players = visible.filter((p) => ROLES[p.role].kind === 'player').sort(byRole);
export const staff = visible.filter((p) => ROLES[p.role].kind === 'staff').sort(byRole);
export const people = [...players, ...staff];
export const personById = new Map(allPeople.map((p) => [p.id, p]));

// ─── 경기: 날짜는 KST로 입력받는다.
export const kst = (s: string) => {
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(s)) return new Date(s);
  return new Date(`${/T\d\d:\d\d$/.test(s) ? `${s}:00` : s}+09:00`);
};
const matchesSorted = allMatches
  .map((m) => ({ ...m, when: kst(m.date) }))
  .sort((a, b) => a.when.valueOf() - b.when.valueOf());
export type MatchX = (typeof matchesSorted)[number];
export const upcoming = matchesSorted.filter((m) => m.status !== 'finished');
export const results = matchesSorted.filter((m) => m.status === 'finished').reverse();
export const voteMatch = results.find((m) => m.vote.enabled && m.vote.counts.length > 0);

export const record = (() => {
  const { wins, losses } = team.season;
  const games = wins + losses;
  return { wins, losses, rate: games ? Math.round((wins / games) * 1000) / 10 : 0 };
})();

// ─── 팀 챔피언 풀 = 선수들 주 챔피언 합산
export const championPool = (() => {
  const pool = new Map<string, { name: string; games: number; wins: number }>();
  for (const p of players)
    for (const c of p.champions) {
      const cur = pool.get(c.name) ?? { name: c.name, games: 0, wins: 0 };
      cur.games += c.games;
      cur.wins += c.wins;
      pool.set(c.name, cur);
    }
  return [...pool.values()].sort((a, b) => b.games - a.games);
})();

// 챔피언 한글 이름 (빌드할 때 한 번 받아온다. 인터넷이 없으면 영문 ID 그대로)
const champNames: Record<string, string> = await fetch(
  `https://ddragon.leagueoflegends.com/cdn/${team.ddragonVersion}/data/ko_KR/champion.json`,
)
  .then((r) => r.json())
  .then((j: { data: Record<string, { id: string; name: string }> }) =>
    Object.fromEntries(Object.values(j.data).map((c) => [c.id, c.name])),
  )
  .catch(() => ({}));
export const champName = (id: string) => champNames[id] ?? id;

export const champIcon = (id: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${team.ddragonVersion}/img/champion/${id}.png`;

// ─── 표기
const fmtDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' });
const fmtTime = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
const fmtDow = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' });
export const md = (d: Date) => fmtDate.format(d).replace(/\s/g, '').replace(/\.$/, '');
export const hm = (d: Date) => fmtTime.format(d);
export const dow = (d: Date) => fmtDow.format(d);
export const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;
export const pad2 = (n?: number) => (n == null ? '' : String(n).padStart(2, '0'));

export const faviconFor = (accent: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><rect width="36" height="36" fill="#0c0c0d"/><path d="M20 4 9 20h7l-3 12 13-17h-7l4-11z" fill="${accent}"/></svg>`,
  )}`;
