import { z } from 'zod';
import { ROLES, type Role } from './roles';

z.config(z.locales.ko());

// 사이트 데이터의 단일 기준.
// - 사이트 빌드: src/data/*.json 을 이 스키마로 검사한다. 어긋나면 빌드 실패 → 배포된 사이트는 이전 상태 유지.
// - 로컬 어드민: 이 스키마를 JSON Schema로 바꿔서 입력 양식을 자동으로 만든다.
//   .meta({ title }) 이 어드민의 칸 이름, widget 이 입력 방식이다.

const t = (title: string, extra: Record<string, unknown> = {}) => ({ title, ...extra });

const text = (title: string, extra: Record<string, unknown> = {}) =>
  z.string().meta(t(title, extra));
const opt = (title: string, extra: Record<string, unknown> = {}) =>
  text(title, extra).optional();
const image = (title: string) => z.string().meta(t(title, { widget: 'image' })).optional();
const link = (title: string) => z.string().meta(t(title, { widget: 'url' })).optional();

const socials = z
  .object({
    x: link('X (트위터)'),
    instagram: link('인스타그램'),
    youtube: link('유튜브'),
    chzzk: link('치지직'),
    soop: link('SOOP'),
  })
  .default({})
  .meta(t('SNS'));

// ─────────────────────────────── 팀 정보
export const team = z
  .object({
    name: text('팀명 (영문)'),
    nameKo: opt('팀명 (한글)'),
    shortName: text('약칭', { help: '3~4자. 스코어·일정에 쓰인다.' }),
    logo: image('로고 (없으면 번개 마크 + 팀명 글자)'),
    league: text('리그'),
    city: text('연고'),
    founded: text('창단 연도'),
    slogan: opt('슬로건'),
    notice: z
      .object({
        enabled: z.boolean().default(false).meta(t('상단 공지 띠 표시')),
        text: z.string().default('').meta(t('공지 문구')),
        href: link('공지 링크'),
      })
      .default({ enabled: false, text: '' })
      .meta(t('공지 띠')),
    season: z
      .object({
        label: text('시즌 이름', { help: '예: 2026 LCK' }),
        standing: z.number().int().optional().meta(t('순위')),
        wins: z.number().int().default(0).meta(t('승')),
        losses: z.number().int().default(0).meta(t('패')),
        extraLabel: opt('추가 지표 이름', { help: '예: 월드챔피언십' }),
        extraValue: opt('추가 지표 값', { help: '예: 1회' }),
      })
      .meta(t('시즌 기록')),
    theme: z
      .object({
        mode: z
          .enum(['dark', 'light'])
          .default('dark')
          .meta(t('기본 테마', { labels: { dark: '다크', light: '라이트' }, help: '방문자는 오른쪽 위 버튼으로 바꿀 수 있다.' })),
        accent: z.string().default('#FFD400').meta(t('포인트 색 (팀 컬러)', { widget: 'color' })),
        paper: z
          .string()
          .default('#D6D8E2')
          .meta(t('사진 판 색', { widget: 'color', help: '사진이 로딩되기 전·여백에 보이는 색. 촬영 배경색과 비슷하게.' })),
      })
      .default({ mode: 'dark', accent: '#FFD400', paper: '#D6D8E2' })
      .meta(t('색')),
    sections: z
      .object({
        champions: z.boolean().default(true).meta(t('챔피언 풀')),
        results: z.boolean().default(true).meta(t('전적 + MVP 투표')),
        schedule: z.boolean().default(true).meta(t('일정')),
        gallery: z.boolean().default(true).meta(t('미디어')),
        partners: z.boolean().default(true).meta(t('파트너')),
        sponsorship: z.boolean().default(true).meta(t('스폰서십 패키지')),
        mediakit: z.boolean().default(true).meta(t('미디어 킷')),
        store: z.boolean().default(true).meta(t('굿즈 스토어')),
      })
      .default({
        champions: true,
        results: true,
        schedule: true,
        gallery: true,
        partners: true,
        sponsorship: true,
        mediakit: true,
        store: true,
      })
      .meta(t('섹션 표시')),
    socials,
    contactEmail: opt('문의 이메일'),
    ddragonVersion: z
      .string()
      .default('16.19.1')
      .meta(t('챔피언 이미지 버전', { help: 'Riot Data Dragon 버전' })),
    disclaimer: z
      .string()
      .default('')
      .meta(t('하단 고지문', { widget: 'textarea' })),
  })
  .meta(t('팀 정보'));

// ─────────────────────────────── 선수 · 스태프
const roleKeys = Object.keys(ROLES) as [Role, ...Role[]];
const roleLabels = Object.fromEntries(roleKeys.map((k) => [k, ROLES[k].ko]));

export const person = z.object({
  id: text('주소용 ID', { help: '영문 소문자. 팝업 주소(#id)와 투표에 쓰인다. 한번 정하면 바꾸지 말 것.' }).regex(
    /^[a-z0-9-]+$/,
    '영문 소문자·숫자·하이픈만',
  ),
  visible: z.boolean().default(true).meta(t('사이트에 표시')),
  role: z.enum(roleKeys).meta(t('포지션/직책', { labels: roleLabels })),
  nickname: text('닉네임'),
  nameKo: text('실명'),
  nameEn: opt('실명 (영문)'),
  number: z.number().int().optional().meta(t('등번호')),
  birthYear: z.number().int().optional().meta(t('출생 연도')),
  nationality: z.string().default('KR').meta(t('국적')),
  joined: opt('합류', { help: '예: 2026' }),
  photo: image('사진 1 — 정면 (카드·투표·메인 화면용)'),
  photoSide: image('사진 2 — 45도 (선수 팝업용, 없으면 사진 1)'),
  focusY: z
    .number()
    .min(0)
    .max(100)
    .default(20)
    .meta(t('얼굴 위치 (%)', { help: '사진 위에서부터 얼굴까지. 동그란 얼굴 사진·투표 썸네일을 자를 때 기준.' })),
  quote: opt('한마디', { widget: 'textarea' }),
  stats: z
    .object({
      games: z.number().optional().meta(t('경기 수')),
      winRate: z.number().optional().meta(t('승률 %')),
      kda: z.number().optional().meta(t('KDA')),
      kills: z.number().optional().meta(t('평균 킬')),
      deaths: z.number().optional().meta(t('평균 데스')),
      assists: z.number().optional().meta(t('평균 어시스트')),
      cs: z.number().optional().meta(t('분당 CS')),
    })
    .default({})
    .meta(t('시즌 스탯 (선수)')),
  champions: z
    .array(
      z.object({
        name: text('챔피언', { widget: 'champion' }),
        games: z.number().int().default(0).meta(t('경기')),
        wins: z.number().int().default(0).meta(t('승')),
      }),
    )
    .default([])
    .meta(t('주 챔피언 (선수)')),
  career: z
    .array(z.object({ period: text('기간'), team: text('팀'), role: opt('역할') }))
    .default([])
    .meta(t('경력')),
  awards: z
    .array(z.object({ year: text('연도'), title: text('수상') }))
    .default([])
    .meta(t('수상')),
  socials,
});
export const people = z.array(person).meta(t('선수 · 스태프', { itemTitle: 'nickname' }));

// ─────────────────────────────── 경기 (일정 + 결과)
export const match = z.object({
  id: text('ID', { widget: 'auto' }),
  date: text('일시 (KST)', { widget: 'datetime' }),
  league: text('대회'),
  stage: opt('단계', { help: '예: 1라운드, 플레이오프' }),
  opponent: text('상대 팀'),
  opponentShort: opt('상대 약칭'),
  format: z.enum(['bo1', 'bo3', 'bo5']).default('bo3').meta(t('방식', { labels: { bo1: '단판', bo3: '3판 2선', bo5: '5판 3선' } })),
  status: z
    .enum(['scheduled', 'live', 'finished'])
    .default('scheduled')
    .meta(t('상태', { labels: { scheduled: '예정', live: '진행 중', finished: '종료' } })),
  scoreUs: z.number().int().optional().meta(t('우리 세트')),
  scoreThem: z.number().int().optional().meta(t('상대 세트')),
  broadcast: link('중계 링크'),
  vod: link('다시보기 링크'),
  vote: z
    .object({
      enabled: z.boolean().default(false).meta(t('MVP 투표 열기')),
      counts: z
        .array(
          z.object({
            person: text('선수', { widget: 'person' }),
            votes: z.number().int().default(0).meta(t('기본 득표')),
          }),
        )
        .default([])
        .meta(t('득표 (가짜 집계)')),
      growth: z
        .boolean()
        .default(true)
        .meta(t('자연 증가', { help: '경기 후 72시간 동안 득표가 조금씩 늘어나 보이게 한다. 모든 방문자에게 같은 숫자.' })),
    })
    .default({ enabled: false, counts: [], growth: true })
    .meta(t('팬 MVP 투표')),
});
export const matches = z.array(match).meta(t('경기', { itemTitle: 'opponent', itemSub: 'date' }));

// ─────────────────────────────── 메인 배너 (롤링)
export const banners = z
  .array(
    z.object({
      video: z
        .string()
        .optional()
        .meta(t('영상 (mp4)', { widget: 'video', help: '소리 없이 자동 재생. 20MB 이하 권장, 100MB 넘으면 GitHub에 못 올린다.' })),
      segment: z
        .number()
        .min(0)
        .default(10)
        .meta(t('영상 한 번에 보여줄 시간 (초)', { help: '이 시간만큼 재생하고 다음 배너로. 다음 차례엔 멈춘 곳부터 이어서. 0 = 끝까지' })),
      image: image('이미지 (영상이 있으면 로딩 중 첫 화면)'),
      label: opt('관리용 이름', { help: '사이트에는 안 보인다' }),
      href: link('클릭 시 이동 (선택)'),
    }),
  )
  .meta(t('메인 배너', { itemTitle: 'label' }));

// ─────────────────────────────── 미디어
export const gallery = z
  .array(
    z.object({
      image: image('이미지'),
      youtube: link('유튜브 링크 (영상일 때)'),
      title: text('제목'),
      date: opt('날짜', { widget: 'date' }),
    }),
  )
  .meta(t('미디어', { itemTitle: 'title' }));

// ─────────────────────────────── 파트너
export const partners = z
  .array(
    z.object({
      name: text('이름'),
      logo: image('로고 (SVG/PNG 권장)'),
      tier: z
        .enum(['title', 'main', 'official'])
        .default('official')
        .meta(t('등급', { labels: { title: '타이틀', main: '메인', official: '오피셜' } })),
      href: link('링크'),
    }),
  )
  .meta(t('파트너', { itemTitle: 'name' }));

// ─────────────────────────────── 스폰서십 패키지
export const sponsorship = z
  .object({
    intro: z.string().default('').meta(t('소개 문구', { widget: 'textarea' })),
    tiers: z
      .array(
        z.object({
          name: text('티어 이름'),
          price: z.string().default('문의 시 협의').meta(t('가격 표기')),
          highlight: z.boolean().default(false).meta(t('강조')),
          benefits: z.array(z.string().meta(t('혜택'))).default([]).meta(t('혜택 목록')),
        }),
      )
      .default([])
      .meta(t('티어', { itemTitle: 'name' })),
  })
  .meta(t('스폰서십'));

// ─────────────────────────────── 미디어 킷
export const mediakit = z
  .array(
    z.object({
      title: text('항목'),
      description: opt('설명'),
      file: z.string().optional().meta(t('파일', { widget: 'file' })),
    }),
  )
  .meta(t('미디어 킷', { itemTitle: 'title' }));

// ─────────────────────────────── 굿즈
export const store = z
  .object({
    url: link('공식 스토어 주소'),
    items: z
      .array(
        z.object({
          name: text('상품명'),
          description: opt('설명'),
          price: z.number().int().meta(t('가격 (원)')),
          image: image('상품 이미지'),
          badge: z
            .enum(['', 'new', 'soldout'])
            .default('')
            .meta(t('표시', { labels: { '': '없음', new: 'NEW', soldout: 'SOLD OUT' } })),
          href: link('상품 링크'),
        }),
      )
      .default([])
      .meta(t('상품', { itemTitle: 'name' })),
  })
  .meta(t('굿즈 스토어'));

// ─────────────────────────────── 화면 문구
// 사이트에 고정으로 박혀 있던 글자를 전부 여기로 뺐다. [어드민 칸 이름, 기본 문구]
type Fields = Record<string, [label: string, def: string]>;
const group = <F extends Fields>(title: string, fields: F) =>
  z
    .object(
      Object.fromEntries(
        Object.entries(fields).map(([k, [label, def]]) => [k, z.string().default(def).meta(t(label, { placeholder: def, ...(def.length > 60 ? { widget: 'textarea' } : {}) }))]),
      ) as { [K in keyof F]: z.ZodDefault<z.ZodString> },
    )
    .prefault({} as never)
    .meta(t(title));

const roleText = (ko: string, en: string) =>
  z
    .object({
      ko: z.string().default(ko).meta(t('한글', { placeholder: ko })),
      en: z.string().default(en).meta(t('영문', { placeholder: en })),
    })
    .prefault({})
    .meta(t(ko));

export const texts = z
  .object({
    nav: group('상단 메뉴', {
      roster: ['선수단', 'Roster'],
      results: ['전적', 'Results'],
      schedule: ['일정', 'Schedule'],
      media: ['미디어', 'Media'],
      partners: ['파트너', 'Partners'],
      store: ['스토어', 'Store'],
    }),
    roles: z
      .object({
        top: roleText('탑', 'TOP'),
        jungle: roleText('정글', 'JUNGLE'),
        mid: roleText('미드', 'MID'),
        bot: roleText('원거리 딜러', 'BOT'),
        support: roleText('서포터', 'SUPPORT'),
        'head-coach': roleText('감독', 'HEAD COACH'),
        coach: roleText('코치', 'COACH'),
        analyst: roleText('애널리스트', 'ANALYST'),
      })
      .prefault({})
      .meta(t('포지션 · 직책 이름', { help: '한글은 선수 카드·팝업, 영문은 메인 화면 스태프 줄에 쓰인다' })),
    season: group('시즌 기록 줄', { rank: ['순위', '순위'], rankUnit: ['순위 단위', '위'], record: ['전적', '전적'], winRate: ['승률', '승률'] }),
    roster: group('로스터', {
      label: ['작은 라벨', 'Roster'],
      title: ['제목', '선수단'],
      staff: ['스태프 소제목', 'Coaching Staff'],
    }),
    profile: group('선수 팝업', {
      age: ['나이', '나이'],
      nation: ['국적', '국적'],
      joined: ['합류', '합류'],
      stats: ['시즌 기록 제목', '시즌 기록'],
      champions: ['주 챔피언 제목', '주 챔피언'],
      career: ['커리어 제목', '커리어'],
      awards: ['수상 제목', '수상'],
      games: ['경기', '경기'],
      winRate: ['승률', '승률'],
      kda: ['KDA', 'KDA'],
      kills: ['킬', '킬'],
      deaths: ['데스', '데스'],
      assists: ['어시스트', '어시스트'],
      cs: ['분당 CS', 'CS/분'],
    }),
    champions: group('챔피언 풀', { label: ['작은 라벨', 'Champion Pool'], title: ['제목', '팀 챔피언 풀'] }),
    results: group('전적 · 투표', {
      label: ['작은 라벨', 'Results'],
      title: ['제목', '최근 경기'],
      empty: ['경기 없을 때', '아직 치른 경기가 없습니다.'],
      win: ['승 표시', 'W'],
      loss: ['패 표시', 'L'],
      voteTitle: ['투표 제목', 'Fan MVP Vote'],
      votePrompt: ['투표 전 안내', 'MVP를 골라주세요'],
      voteDone: ['투표 후 안내', '투표 완료'],
      voteUnit: ['표 단위', '표'],
    }),
    schedule: group('일정', {
      label: ['작은 라벨', 'Schedule'],
      title: ['제목', '경기 일정'],
      aside: ['오른쪽 문구', 'All times KST'],
      next: ['다음 경기 표시', 'Next Match'],
      live: ['생중계 중 표시', '● LIVE'],
      watch: ['중계 버튼', '중계 채널'],
      watchLive: ['생중계 버튼', '생중계 보기'],
      empty: ['일정 없을 때', '다음 일정이 곧 공개됩니다.'],
      timezone: ['시간대 표기', 'KST'],
    }),
    media: group('미디어', { label: ['작은 라벨', 'Media'], title: ['제목', '미디어'], aside: ['오른쪽 문구', 'Photos · Videos'] }),
    partners: group('파트너 · 스폰서십', {
      label: ['작은 라벨', 'Partners'],
      title: ['제목', '파트너'],
      tierTitle: ['타이틀 등급 표기', 'Title Partner'],
      tierMain: ['메인 등급 표기', 'Main Partner'],
      tierOfficial: ['오피셜 등급 표기', 'Official Partner'],
      sponsorLabel: ['스폰서십 작은 라벨', 'Sponsorship'],
      sponsorTitle: ['스폰서십 제목', '파트너십 패키지'],
      contact: ['문의 버튼', '파트너십 문의'],
    }),
    mediakit: group('미디어 킷', {
      label: ['작은 라벨', 'Media Kit'],
      title: ['제목', '미디어 킷'],
      aside: ['오른쪽 문구', '언론 · 크리에이터용'],
      download: ['다운로드 버튼', '다운로드 ↓'],
      soon: ['파일 없을 때', '준비 중'],
    }),
    store: group('굿즈 스토어', {
      label: ['작은 라벨', 'Store'],
      title: ['제목', '팬 굿즈'],
      all: ['스토어 버튼', '공식 스토어 전체보기'],
      new: ['NEW 표시', 'NEW'],
      soldout: ['품절 표시', 'SOLD OUT'],
    }),
    footer: group('하단', {
      rights: ['저작권 문구', 'All rights reserved.'],
      riot: [
        '라이엇 고지문 ({team} = 팀명)',
        "{team} isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.",
      ],
    }),
    notFound: group('없는 페이지(404)', { message: ['안내 문구', '페이지를 찾을 수 없어요.'], home: ['버튼', '홈으로'] }),
  })
  .meta(t('화면 문구'));
export type Texts = z.infer<typeof texts>;

// 어드민 탭 순서 = 이 객체 순서. 키 = src/data/<키>.json
export const files = {
  team,
  texts,
  people,
  matches,
  banners,
  gallery,
  partners,
  sponsorship,
  mediakit,
  store,
} as const;
export type FileKey = keyof typeof files;

export type Team = z.infer<typeof team>;
export type Person = z.infer<typeof person>;
export type Match = z.infer<typeof match>;

// ─── 어드민용 (로컬 dev 서버에서만 호출됨)
export function adminSchemas() {
  return Object.fromEntries(
    Object.entries(files).map(([k, s]) => [k, z.toJSONSchema(s, { io: 'input', unrepresentable: 'any' })]),
  );
}
// 어드민에 보여줄 때 빈 칸을 기본값으로 채운다 (형식이 틀린 파일이면 그대로)
export function withDefaults(key: string, data: unknown) {
  const r = files[key as FileKey]?.safeParse(data);
  return r?.success ? r.data : data;
}
export function validate(key: string, data: unknown) {
  const schema = files[key as FileKey];
  if (!schema) return { ok: false as const, issues: [{ path: [], message: `알 수 없는 파일: ${key}` }] };
  const r = schema.safeParse(data);
  if (r.success) return { ok: true as const };
  return {
    ok: false as const,
    issues: r.error.issues.map((i) => ({ path: i.path.map(String), message: i.message })),
  };
}
