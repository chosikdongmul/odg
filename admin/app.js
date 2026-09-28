// 로컬 어드민 화면.
// 입력 양식은 src/lib/schema.ts 에서 자동으로 만들어진다 (서버가 JSON Schema로 바꿔서 보내준다).
// 저장 → 서버가 스키마로 검사 → 통과하면 src/data/<탭>.json 에 기록.

const $ = (s, el = document) => el.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') el.value = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid);
  return el;
};

const TAB_INFO = {
  team: { anchor: '#top', hint: '팀명, 시즌 기록, 공지 띠, 색, 섹션 켜고 끄기' },
  texts: { anchor: '#top', hint: '사이트에 보이는 고정 문구 전부. 칸을 비우면 원래 문구로 돌아간다' },
  people: { anchor: '#roster', hint: '선수 5명 + 스태프. 카드를 누르면 펼쳐진다. 순서는 포지션 순으로 자동 정렬' },
  matches: { anchor: '#results', hint: '일정과 결과를 한 곳에서. 경기가 끝나면 상태를 "종료"로 바꾸고 세트 스코어 입력' },
  banners: { anchor: '#top', hint: '메인 화면에서 롤링되는 영상/이미지. 위에서부터 순서대로. 없으면 어두운 기본 화면' },
  gallery: { anchor: '#media', hint: '사진 또는 유튜브 링크. 첫 번째 항목이 크게 나온다' },
  partners: { anchor: '#partners', hint: '로고가 없으면 이름이 글자로 표시된다' },
  sponsorship: { anchor: '#partners', hint: '파트너 섹션 아래의 스폰서십 패키지' },
  mediakit: { anchor: '#mediakit', hint: '파일을 올리면 다운로드 버튼이 생긴다. 없으면 "준비 중"' },
  store: { anchor: '#store', hint: '상품 이미지가 없으면 번개 마크로 대체된다' },
};

const api = async (url, opts = {}) => {
  const res = await fetch(url, { ...opts, headers: { 'x-admin': '1', ...(opts.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
};

let boot;
const state = { data: {}, saved: {}, tab: 'team', open: new Set(), champs: new Map() };

// ─── 경로 유틸
const getIn = (obj, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setIn(obj, path, value) {
  let o = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (o[k] == null || typeof o[k] !== 'object') o[k] = typeof path[i + 1] === 'number' ? [] : {};
    o = o[k];
  }
  const last = path.at(-1);
  if (value === undefined) {
    if (Array.isArray(o)) o[last] = undefined;
    else delete o[last];
  } else o[last] = value;
}
const pkey = (path) => path.join('.');

// ─── 기본값 만들기 (목록에 새 항목 추가할 때)
function blank(schema) {
  if ('default' in schema) return structuredClone(schema.default);
  if (schema.enum) return schema.enum[0];
  switch (schema.type) {
    case 'object': {
      const o = {};
      for (const [k, s] of Object.entries(schema.properties ?? {})) {
        if (s.widget === 'auto') o[k] = `${s.prefix ?? 'x'}-${Date.now().toString(36)}`;
        else if ((schema.required ?? []).includes(k) || 'default' in s) o[k] = blank(s);
      }
      return o;
    }
    case 'array':
      return [];
    case 'boolean':
      return false;
    case 'number':
    case 'integer':
      return 0;
    default:
      return '';
  }
}

const dirty = (key) => JSON.stringify(state.data[key]) !== state.saved[key];

// ─── 화면 그리기
function renderTabs() {
  const nav = $('#tabs');
  nav.replaceChildren(
    ...Object.entries(boot.schemas).map(([key, s]) =>
      h(
        'button',
        {
          type: 'button',
          class: [key === state.tab && 'on', dirty(key) && 'dirty'].filter(Boolean).join(' '),
          onclick: () => switchTab(key),
        },
        s.title ?? key,
        h('span', { class: 'dot', 'aria-label': dirty(key) ? '저장 안 됨' : null }),
      ),
    ),
  );
  const d = dirty(state.tab);
  $('#save').disabled = !d;
  $('#revert').disabled = !d;
  $('#team-name').textContent = state.data.team?.name ?? '어드민';
}

function switchTab(key) {
  state.tab = key;
  $('#errors').hidden = true;
  renderPanel();
  renderTabs();
  $('#panel').scrollTop = 0;
  const anchor = TAB_INFO[key]?.anchor ?? '';
  const frame = $('#frame');
  try {
    frame.contentWindow.location.hash = anchor;
  } catch {
    frame.src = previewUrl(anchor);
  }
}

function renderPanel() {
  const key = state.tab;
  const schema = boot.schemas[key];
  $('#panel-title').textContent = schema.title ?? key;
  $('#panel-hint').textContent = TAB_INFO[key]?.hint ?? '';
  const panel = $('#panel');
  const y = panel.scrollTop;
  panel.replaceChildren(field(schema, [key], { top: true }));
  panel.scrollTop = y;
}

const changed = () => renderTabs();
const rerender = () => {
  renderPanel();
  renderTabs();
};

function label(schema, name, required) {
  return [
    schema.title ?? name,
    required && !('default' in schema) ? h('span', { class: 'req', title: '필수' }, '*') : null,
  ];
}
const help = (schema) => (schema.help ? h('p', { class: 'help' }, schema.help) : null);

// path[0] = 탭 키, 나머지는 state.data[탭] 안의 경로
const read = (path) => getIn(state.data, path);
const write = (path, v) => {
  setIn(state.data, path, v);
  changed();
};

function field(schema, path, opts = {}) {
  const name = String(path.at(-1));
  const value = read(path);
  const req = opts.required;
  const w = schema.widget;

  if (w === 'auto') return h('input', { type: 'hidden', value: value ?? '' });

  if (schema.type === 'object') {
    const props = Object.entries(schema.properties ?? {});
    const simple = props.filter(([, s]) => !['object', 'array'].includes(s.type) && !['image', 'video', 'textarea', 'file'].includes(s.widget));
    const complex = props.filter((p) => !simple.includes(p));
    const kids = [
      simple.length ? h('div', { class: 'grid2' }, simple.map(([k, s]) => field(s, [...path, k], { required: (schema.required ?? []).includes(k) }))) : null,
      complex.map(([k, s]) => field(s, [...path, k], { required: (schema.required ?? []).includes(k) })),
    ];
    if (opts.top || opts.bare) return h('div', {}, kids);
    return h('fieldset', { dataset: { path: pkey(path.slice(1)) } }, h('legend', {}, schema.title ?? name), help(schema), kids);
  }

  if (schema.type === 'array') return arrayField(schema, path, opts);

  const wrap = (control, extra = {}) =>
    h('div', { class: 'f', dataset: { path: pkey(path.slice(1)) }, ...extra }, h('label', {}, label(schema, name, req)), control, help(schema));

  if (schema.type === 'boolean')
    return h(
      'div',
      { class: 'f', dataset: { path: pkey(path.slice(1)) } },
      h(
        'label',
        { class: 'switch' },
        h('input', { type: 'checkbox', checked: !!value, onchange: (e) => write(path, e.target.checked) }),
        schema.title ?? name,
      ),
      help(schema),
    );

  if (schema.type === 'number' || schema.type === 'integer')
    return wrap(
      h('input', {
        type: 'number',
        step: schema.type === 'integer' ? '1' : 'any',
        min: schema.minimum,
        max: schema.maximum,
        value: value ?? '',
        oninput: (e) => write(path, e.target.value === '' ? undefined : Number(e.target.value)),
      }),
    );

  if (schema.enum) {
    const labels = schema.labels ?? {};
    return wrap(
      h(
        'select',
        { onchange: (e) => (write(path, e.target.value), opts.onStructural?.()) },
        schema.enum.map((v) => h('option', { value: v, selected: v === value }, labels[v] ?? (v || '없음'))),
      ),
    );
  }

  const str = (v) => write(path, v === '' && !req ? undefined : v);

  switch (w) {
    case 'image':
    case 'video':
    case 'file':
      return h('div', { class: 'f', dataset: { path: pkey(path.slice(1)) } }, h('span', { class: 'lbl' }, label(schema, name, req)), uploadField(path, w), help(schema));
    case 'textarea':
      return wrap(h('textarea', { value: value ?? '', placeholder: schema.placeholder ?? '', oninput: (e) => str(e.target.value) }));
    case 'color': {
      const txt = h('input', { type: 'text', value: value ?? '', oninput: (e) => (str(e.target.value), (pick.value = e.target.value)) });
      const pick = h('input', { type: 'color', value: value ?? '#000000', oninput: (e) => (str(e.target.value), (txt.value = e.target.value)) });
      return wrap(h('div', { class: 'color' }, pick, txt));
    }
    case 'date':
      return wrap(h('input', { type: 'date', value: value ?? '', oninput: (e) => str(e.target.value) }));
    case 'datetime':
      return wrap(h('input', { type: 'datetime-local', value: value ?? '', oninput: (e) => str(e.target.value) }));
    case 'champion': {
      const icon = h('img', { alt: '', src: champIcon(value) });
      return wrap(
        h(
          'div',
          { class: 'champ' },
          icon,
          h('input', {
            type: 'text',
            list: 'champ-list',
            value: value ?? '',
            placeholder: '챔피언 이름 (한글로 검색)',
            oninput: (e) => {
              // 한글 이름으로 고르면 영문 ID로 바꿔 저장
              const v = e.target.value;
              const id = state.champs.get(v) ?? v;
              if (id !== v) e.target.value = id;
              str(id);
              icon.src = champIcon(id);
            },
          }),
        ),
      );
    }
    case 'person': {
      const people = state.data.people ?? [];
      return wrap(
        h(
          'select',
          { onchange: (e) => str(e.target.value) },
          h('option', { value: '' }, '— 선택 —'),
          people.map((p) => h('option', { value: p.id, selected: p.id === value }, `${p.nickname} (${p.id})`)),
        ),
      );
    }
    default:
      return wrap(
        h('input', {
          type: 'text',
          value: value ?? '',
          pattern: schema.pattern,
          placeholder: schema.placeholder ?? (w === 'url' ? 'https://…' : ''),
          oninput: (e) => str(e.target.value),
        }),
      );
  }
}

function champIcon(id) {
  const v = state.data.team?.ddragonVersion ?? '16.19.1';
  return id ? `https://ddragon.leagueoflegends.com/cdn/${v}/img/champion/${id}.png` : '';
}

function uploadField(path, kind) {
  const value = read(path);
  const accept = { image: 'image/*,.svg', video: 'video/mp4,video/webm,video/quicktime' }[kind] ?? '';
  const input = h('input', { type: 'file', accept, hidden: true, onchange: (e) => e.target.files[0] && upload(e.target.files[0]) });
  const box = h(
    'div',
    { class: 'img' },
    kind === 'image'
      ? h('div', { class: 'thumb' }, value ? h('img', { src: `/admin/file/${value}`, alt: '' }) : '사진 없음')
      : kind === 'video'
        ? h('div', { class: 'thumb wide' }, value ? h('video', { src: `/admin/file/${value}`, muted: true, loop: true, autoplay: true, playsInline: true }) : '영상 없음')
        : null,
    h(
      'div',
      { class: 'side-col' },
      value ? h('code', {}, value) : h('span', { class: 'help' }, kind === 'file' ? '파일 없음' : '여기로 끌어다 놓거나 버튼을 누르세요'),
      h(
        'div',
        { class: 'row' },
        h('button', { type: 'button', class: 'btn small', onclick: () => input.click() }, value ? '바꾸기' : { image: '사진 올리기', video: '영상 올리기' }[kind] ?? '파일 올리기'),
        value ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => (write(path, undefined), rerender()) }, '비우기') : null,
      ),
    ),
    input,
  );
  async function upload(file) {
    const mb = file.size / 1048576;
    if (kind === 'video' && mb > 95) return toast(`영상이 ${Math.round(mb)}MB 입니다. GitHub 한도(100MB) 때문에 20MB 이하로 줄여주세요.`, 'err');
    box.querySelector('.side-col').prepend(h('span', { class: 'help' }, `올리는 중… ${file.name} (${mb.toFixed(1)}MB)`));
    const r = await api(`/admin/api/upload?kind=${kind}&name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
    if (!r.ok) return toast(r.body.error ?? '업로드 실패', 'err');
    write(path, r.body.path);
    rerender();
    toast(kind === 'video' && mb > 30 ? `올렸습니다. ${Math.round(mb)}MB라 사이트 로딩이 느릴 수 있어요 (20MB 이하 권장).` : '올렸습니다. 저장을 눌러야 사이트에 반영됩니다.');
  }
  box.addEventListener('dragover', (e) => (e.preventDefault(), box.classList.add('drag')));
  box.addEventListener('dragleave', () => box.classList.remove('drag'));
  box.addEventListener('drop', (e) => {
    e.preventDefault();
    box.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (f) upload(f);
  });
  return box;
}

function itemTitle(schema, item, i) {
  if (typeof item !== 'object' || item == null) return `${i + 1}`;
  const main = item[schema.itemTitle] || item.nickname || item.name || item.title || item.opponent || `${i + 1}번째`;
  const sub = schema.itemSub ? item[schema.itemSub] : item.role ? (schema.items?.properties?.role?.labels?.[item.role] ?? item.role) : '';
  return [main, sub ? h('small', {}, String(sub).replace('T', ' ')) : null];
}

function arrayField(schema, path, opts) {
  const list = read(path) ?? [];
  const items = schema.items ?? {};
  const isObj = items.type === 'object';
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    write(path, list);
    rerender();
  };
  const add = () => {
    const arr = read(path) ?? [];
    arr.push(blank(items));
    write(path, arr);
    state.open.add(pkey([...path, arr.length - 1]));
    rerender();
  };

  // 칸이 몇 개 안 되는 단순 목록(경력, 득표, 챔피언…)은 접지 않고 한 줄씩 보여준다
  const props = Object.entries(items.properties ?? {});
  const compact =
    isObj &&
    props.length <= 4 &&
    props.every(([, s]) => !['object', 'array'].includes(s.type) && !['image', 'video', 'file', 'textarea'].includes(s.widget));
  if (compact) {
    const rows = h(
      'div',
      { class: 'list' },
      list.map((_, i) =>
        h(
          'div',
          { class: 'crow', style: `--n:${props.length}`, dataset: { path: pkey([...path, i].slice(1)) } },
          props.map(([k, s]) => field(s, [...path, i, k], { required: (items.required ?? []).includes(k) })),
          h(
            'span',
            { class: 'tools' },
            h('button', { type: 'button', title: '위로', onclick: () => move(i, -1) }, '↑'),
            h('button', { type: 'button', title: '아래로', onclick: () => move(i, 1) }, '↓'),
            h('button', { type: 'button', class: 'del', title: '삭제', onclick: () => (list.splice(i, 1), write(path, list), rerender()) }, '✕'),
          ),
        ),
      ),
      h('button', { type: 'button', class: 'btn small ghost add', onclick: add }, '+ 추가'),
    );
    return h('fieldset', { dataset: { path: pkey(path.slice(1)) } }, h('legend', {}, schema.title ?? path.at(-1)), help(schema), rows);
  }

  const body = isObj
    ? h(
        'div',
        { class: 'list' },
        list.map((item, i) => {
          const p = [...path, i];
          const k = pkey(p);
          const open = state.open.has(k);
          const thumb = item?.photo || item?.image || item?.logo;
          const node = h(
            'div',
            {
              class: ['item', open && 'open', item?.visible === false && 'hidden-item'].filter(Boolean).join(' '),
              dataset: { path: pkey(p.slice(1)) },
            },
            h(
              'header',
              {
                onclick: (e) => {
                  if (e.target.closest('.tools')) return;
                  state.open.has(k) ? state.open.delete(k) : state.open.add(k);
                  node.classList.toggle('open');
                },
              },
              h('span', { class: 'caret' }, '▶'),
              thumb && /\.(jpe?g|png|webp|avif|gif|svg)$/i.test(thumb) ? h('img', { class: 'mini', src: `/admin/file/${thumb}`, alt: '' }) : null,
              h('span', { class: 'ttl' }, itemTitle(schema, item, i)),
              item?.visible === false ? h('span', { class: 'badge-hidden', title: '「사이트에 표시」가 꺼져 있음' }, '사이트에 안 보임') : null,
              h(
                'span',
                { class: 'tools' },
                h('button', { type: 'button', title: '위로', onclick: () => move(i, -1) }, '↑'),
                h('button', { type: 'button', title: '아래로', onclick: () => move(i, 1) }, '↓'),
                h(
                  'button',
                  {
                    type: 'button',
                    title: '복제',
                    onclick: () => {
                      const copy = structuredClone(item);
                      const idSchema = items.properties?.id;
                      if (idSchema?.widget === 'auto') copy.id = `${idSchema.prefix ?? 'x'}-${Date.now().toString(36)}`;
                      else if ('id' in copy) copy.id = `${copy.id}-copy`;
                      list.splice(i + 1, 0, copy);
                      write(path, list);
                      rerender();
                    },
                  },
                  '⧉',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'del',
                    title: '삭제',
                    onclick: () => {
                      if (!confirm(`"${[itemTitle(schema, item, i)].flat()[0]}" 항목을 삭제할까요? (저장 전에는 되돌리기 가능)`)) return;
                      list.splice(i, 1);
                      write(path, list);
                      rerender();
                    },
                  },
                  '✕',
                ),
              ),
            ),
            h('div', { class: 'body' }, field(items, p, { bare: true, onStructural: rerender })),
          );
          return node;
        }),
        h('button', { type: 'button', class: 'btn small ghost add', onclick: add }, `+ ${schema.title && !opts.top ? schema.title : '항목'} 추가`),
      )
    : h(
        'div',
        { class: 'strlist' },
        list.map((v, i) =>
          h(
            'div',
            { class: 'row' },
            h('input', { type: 'text', value: v ?? '', oninput: (e) => ((list[i] = e.target.value), write(path, list)) }),
            h('button', { type: 'button', class: 'btn small ghost', onclick: () => (list.splice(i, 1), write(path, list), rerender()) }, '✕'),
          ),
        ),
        h('button', { type: 'button', class: 'btn small ghost', onclick: add }, '+ 추가'),
      );

  if (opts.top) {
    const extra =
      state.tab === 'matches'
        ? h(
            'p',
            { style: 'margin-bottom:12px' },
            h(
              'button',
              {
                type: 'button',
                class: 'btn small ghost',
                onclick: () => {
                  list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
                  write(path, list);
                  rerender();
                },
              },
              '날짜순 정렬',
            ),
          )
        : null;
    return h('div', {}, extra, body);
  }
  return h('fieldset', { dataset: { path: pkey(path.slice(1)) } }, h('legend', {}, schema.title ?? path.at(-1)), help(schema), body);
}

// ─── 저장
function titleForPath(key, path) {
  let s = boot.schemas[key];
  const out = [];
  for (const [idx, seg] of path.entries()) {
    if (s?.type === 'array') {
      const item = getIn(state.data[key], path.slice(0, idx + 1));
      const n = Number(seg) + 1;
      const t = item && typeof item === 'object' ? [itemTitle(s, item, Number(seg))].flat()[0] : null;
      out.push(typeof t === 'string' ? t : `${n}번째`);
      s = s.items;
    } else if (s?.type === 'object') {
      s = s.properties?.[seg];
      out.push(s?.title ?? seg);
    } else out.push(seg);
  }
  return out.join(' › ') || '전체';
}

// 빈 칸 정리: 선택 항목의 빈 문자열은 지운다
function clean(v) {
  if (Array.isArray(v)) return v.filter((x) => x !== undefined).map(clean);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = clean(x);
    return o;
  }
  return v;
}

async function save() {
  const key = state.tab;
  if (!dirty(key)) return;
  const body = clean(state.data[key]);
  if (key === 'people' && Array.isArray(body) && body.length && body.every((p) => p.visible === false)) {
    if (!confirm('모든 선수·스태프의 「사이트에 표시」가 꺼져 있습니다.\n이대로 저장하면 사이트에 아무도 안 나옵니다. 저장할까요?')) return;
  }
  const r = await api(`/admin/api/data/${key}`, { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  document.querySelectorAll('.bad').forEach((el) => el.classList.remove('bad'));
  if (!r.ok) {
    const issues = r.body.issues ?? [{ path: [], message: r.body.error ?? '저장 실패' }];
    const box = $('#errors');
    box.hidden = false;
    box.replaceChildren(
      h('strong', {}, '저장하지 못했습니다. 아래 칸을 고쳐주세요.'),
      h('ul', {}, issues.map((i) => h('li', {}, `${titleForPath(key, i.path)} — ${i.message}`))),
    );
    // 문제 칸이 들어있는 카드를 펼치고 빨갛게
    for (const i of issues)
      for (let n = 1; n <= i.path.length; n++) {
        const sub = i.path.slice(0, n);
        if (/^\d+$/.test(sub.at(-1))) state.open.add(pkey([key, ...sub.map((s) => (/^\d+$/.test(s) ? Number(s) : s))]));
      }
    renderPanel();
    for (const i of issues) {
      const el = document.querySelector(`[data-path="${CSS.escape(i.path.join('.'))}"]`);
      el?.classList.add('bad');
    }
    document.querySelector('.bad')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return toast('저장 실패 — 빨간 칸을 확인하세요', 'err');
  }
  state.data[key] = body;
  state.saved[key] = JSON.stringify(body);
  $('#errors').hidden = true;
  renderTabs();
  toast('저장했습니다 · 미리보기에 반영 중');
  setTimeout(() => reloadFrame(), 600);
  refreshGit();
}

function revert() {
  const key = state.tab;
  if (!confirm('저장하지 않은 변경을 모두 버릴까요?')) return;
  state.data[key] = JSON.parse(state.saved[key]);
  $('#errors').hidden = true;
  rerender();
}

// ─── 미리보기
const previewUrl = (hash = '') => `${boot.base.replace(/\/$/, '')}/${hash}`;
function reloadFrame() {
  const f = $('#frame');
  try {
    f.contentWindow.location.reload();
  } catch {
    f.src = f.src;
  }
}

// ─── GitHub
async function refreshGit() {
  const r = await api('/admin/api/git');
  const g = r.body;
  const st = $('#git-state');
  if (!g.remote) st.innerHTML = 'GitHub 저장소가 아직 연결되지 않았습니다.<br>저장은 이 컴퓨터에만 됩니다.';
  else if (g.changes.length) st.innerHTML = `올리지 않은 변경 <b>${g.changes.length}개</b>`;
  else st.textContent = '공개 사이트와 같은 상태';
  $('#publish').disabled = !g.remote || !g.changes.length;
  $('#git-last').textContent = g.last ? `마지막 올림: ${g.last}` : '';
  state.git = g;
}

async function publish() {
  if (Object.keys(boot.schemas).some(dirty) && !confirm('저장하지 않은 탭이 있습니다. 저장한 내용만 올라갑니다. 계속할까요?')) return;
  const dlg = $('#publish-dlg');
  $('#publish-files').replaceChildren(...state.git.changes.map((c) => h('li', {}, c)));
  $('#publish-msg').value = '';
  dlg.showModal();
  dlg.addEventListener(
    'close',
    async () => {
      if (dlg.returnValue !== 'ok') return;
      toast('GitHub에 올리는 중…');
      const r = await api('/admin/api/publish', {
        method: 'POST',
        body: JSON.stringify({ message: $('#publish-msg').value }),
        headers: { 'content-type': 'application/json' },
      });
      if (!r.ok) return toast(r.body.error ?? '올리기 실패', 'err');
      toast('올렸습니다. 1~2분 뒤 공개 사이트에 반영됩니다.');
      refreshGit();
    },
    { once: true },
  );
}

// ─── 알림
let toastTimer;
function toast(msg, kind = 'ok') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), kind === 'err' ? 5000 : 2600);
}

// ─── 시작
async function start() {
  const r = await api('/admin/api/boot');
  if (!r.ok) return toast(r.body.error ?? '어드민을 불러오지 못했습니다', 'err');
  boot = r.body;
  for (const [k, v] of Object.entries(boot.data)) {
    state.data[k] = v;
    state.saved[k] = JSON.stringify(v);
  }
  const frame = $('#frame');
  frame.src = previewUrl(TAB_INFO[state.tab].anchor);
  $('#open-site').href = previewUrl();
  document.querySelectorAll('[data-size]').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('[data-size]').forEach((x) => x.classList.toggle('on', x === b));
      $('.frame-wrap').classList.toggle('mobile', b.dataset.size === 'mobile');
    }),
  );
  $('#save').addEventListener('click', save);
  $('#revert').addEventListener('click', revert);
  $('#publish').addEventListener('click', publish);
  addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  });
  addEventListener('beforeunload', (e) => {
    if (Object.keys(boot.schemas).some(dirty)) e.preventDefault();
  });
  rerender();
  refreshGit();

  // 챔피언 목록 (한글 이름 → 영문 ID)
  try {
    const v = state.data.team?.ddragonVersion ?? '16.19.1';
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/ko_KR/champion.json`);
    const json = await res.json();
    const list = $('#champ-list');
    for (const c of Object.values(json.data)) {
      state.champs.set(c.name, c.id);
      list.append(h('option', { value: c.name }, c.id));
    }
  } catch {}
}
start();
