// 로컬 전용 어드민.
// - `npm run dev` / `npm run admin` 으로 띄운 개발 서버에서만 /admin 이 존재한다.
// - 빌드(배포)에는 포함되지 않는다 → 공개 사이트에는 어드민이 없다.
// - 저장 = src/data/<파일>.json 에 바로 쓰기. 사이트 미리보기는 자동 새로고침된다.
// - "GitHub에 올리기" = git add/commit/push. 푸시 후 1~2분이면 공개 사이트에 반영된다.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ADMIN_DIR = path.join(ROOT, 'admin');
const DATA_DIR = path.join(ROOT, 'src', 'data');
const UPLOAD_DIR = path.join(ROOT, 'src', 'assets', 'uploads');
const DOWNLOAD_DIR = path.join(ROOT, 'public', 'downloads');
const MEDIA_DIR = path.join(ROOT, 'public', 'media');
const TRACKED = ['src/data', 'src/assets/uploads', 'public/downloads', 'public/media'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.statusCode = status;
  res.setHeader('content-type', type);
  res.setHeader('cache-control', 'no-store');
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

const readBody = (req, limit = 100 * 1024 * 1024) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) reject(new Error('파일이 너무 큽니다 (100MB 초과)'));
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const slug = (name) =>
  name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'file';

// JSON 안의 "uploads/..." 경로가 실제로 있는지 확인 (없는 사진을 가리키면 배포 빌드가 깨진다)
function missingUploads(value, at = []) {
  const out = [];
  if (typeof value === 'string') {
    if (/^uploads\//.test(value) && !existsSync(path.join(ROOT, 'src', 'assets', value)))
      out.push({ path: at, message: `사진 파일이 없습니다: ${value}` });
    if (/^(media|downloads)\//.test(value) && !existsSync(path.join(ROOT, 'public', value)))
      out.push({ path: at, message: `파일이 없습니다: ${value}` });
  } else if (Array.isArray(value)) value.forEach((v, i) => out.push(...missingUploads(v, [...at, String(i)])));
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) out.push(...missingUploads(v, [...at, k]));
  return out;
}

async function git(...args) {
  const { stdout } = await run('git', args, { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

function openBrowser(url) {
  const cmd =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  execFile(cmd[0], cmd[1], () => {});
}

let base = '/';

export default function localAdmin() {
  return {
    name: 'local-admin',
    hooks: {
      'astro:config:done': ({ config }) => {
        base = config.base;
      },
      'astro:server:start': ({ address, logger }) => {
        const url = `http://localhost:${address.port}/admin`;
        logger.info(`어드민: ${url}`);
        if (process.env.npm_lifecycle_event === 'admin') openBrowser(url);
      },
      'astro:config:setup': ({ updateConfig, logger, command }) => {
        if (command !== 'dev') return; // 빌드에는 어드민을 넣지 않는다
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'local-admin',
                enforce: 'post',
                // Astro는 자기 미들웨어(base 경로 검사 등)를 스택 맨 앞에 끼워 넣는다.
                // 그보다 나중에 실행되는 post 훅에서 어드민을 다시 맨 앞에 넣어 /admin 이 404가 되지 않게 한다.
                configureServer: (server) => () => {
                  server.middlewares.stack.unshift({ route: '', handle: adminHandler(server, logger) });
                },
              },
            ],
          },
        });
      },
    },
  };
}

function adminHandler(server, logger) {
  const schemaMod = () => server.ssrLoadModule('/src/lib/schema.ts');

  return async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const p = url.pathname;
    if (p !== '/admin' && !p.startsWith('/admin/')) return next();

    try {
      // 쓰기 요청은 어드민 화면에서 보낸 것만 (다른 사이트가 몰래 부르는 것 차단)
      if (req.method !== 'GET' && req.headers['x-admin'] !== '1') return send(res, 403, { error: 'forbidden' });

      // ─── 화면
      if (req.method === 'GET' && (p === '/admin' || p === '/admin/'))
        return send(res, 200, await readFile(path.join(ADMIN_DIR, 'index.html')), MIME['.html']);
      if (req.method === 'GET' && /^\/admin\/(app\.js|app\.css)$/.test(p)) {
        const f = path.join(ADMIN_DIR, path.basename(p));
        return send(res, 200, await readFile(f), MIME[path.extname(f)]);
      }
      // 업로드된 사진·영상 미리보기
      if (req.method === 'GET' && p.startsWith('/admin/file/')) {
        const rel = decodeURIComponent(p.slice('/admin/file/'.length));
        const baseDir = /^(media|downloads)\//.test(rel) ? path.join(ROOT, 'public') : path.join(ROOT, 'src', 'assets');
        const f = path.resolve(baseDir, rel);
        if (!f.startsWith(baseDir) || !existsSync(f)) return send(res, 404, 'not found', 'text/plain');
        return send(res, 200, await readFile(f), MIME[path.extname(f).toLowerCase()] ?? 'application/octet-stream');
      }

      // ─── API
      if (req.method === 'GET' && p === '/admin/api/boot') {
        const mod = await schemaMod();
        const schemas = mod.adminSchemas();
        const data = {};
        for (const key of Object.keys(schemas)) {
          const file = path.join(DATA_DIR, `${key}.json`);
          const raw = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : {};
          data[key] = mod.withDefaults(key, raw);
        }
        return send(res, 200, { base, schemas, data });
      }

      const save = p.match(/^\/admin\/api\/data\/([a-z]+)$/);
      if (req.method === 'PUT' && save) {
        const key = save[1];
        const body = JSON.parse((await readBody(req)).toString('utf8'));
        const mod = await schemaMod();
        const v = mod.validate(key, body);
        const issues = v.ok ? missingUploads(body) : v.issues;
        if (issues.length) return send(res, 422, { ok: false, issues });
        await writeFile(path.join(DATA_DIR, `${key}.json`), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
        logger.info(`저장: src/data/${key}.json`);
        return send(res, 200, { ok: true });
      }

      if (req.method === 'POST' && p === '/admin/api/upload') {
        const name = url.searchParams.get('name') ?? 'file';
        const kind = url.searchParams.get('kind') ?? 'image';
        const buf = await readBody(req);
        const ext = path.extname(name).toLowerCase();
        const hash = createHash('sha1').update(buf).digest('hex').slice(0, 6);
        const stem = slug(path.basename(name, path.extname(name)));

        if (kind === 'video') {
          if (!['.mp4', '.webm', '.mov'].includes(ext)) return send(res, 400, { error: 'mp4 · webm · mov 영상만 올릴 수 있습니다' });
          if (buf.length > 95 * 1024 * 1024)
            return send(res, 400, { error: `영상이 너무 큽니다 (${Math.round(buf.length / 1048576)}MB). GitHub는 100MB 넘는 파일을 받지 않습니다. 20MB 이하로 줄여주세요.` });
          await mkdir(MEDIA_DIR, { recursive: true });
          const out = `${stem}-${hash}${ext}`;
          await writeFile(path.join(MEDIA_DIR, out), buf);
          logger.info(`영상 업로드: public/media/${out} (${Math.round(buf.length / 1048576)}MB)`);
          return send(res, 200, { path: `media/${out}`, size: buf.length });
        }

        if (kind === 'file') {
          await mkdir(DOWNLOAD_DIR, { recursive: true });
          const out = `${stem}-${hash}${ext}`;
          await writeFile(path.join(DOWNLOAD_DIR, out), buf);
          return send(res, 200, { path: `downloads/${out}` });
        }

        await mkdir(UPLOAD_DIR, { recursive: true });
        if (ext === '.svg') {
          const out = `${stem}-${hash}.svg`;
          await writeFile(path.join(UPLOAD_DIR, out), buf);
          return send(res, 200, { path: `uploads/${out}` });
        }
        // 원본이 수십 MB여도 저장소가 무거워지지 않게 긴 변 2800px로 줄여 저장한다.
        // 화면 크기별 최적화(AVIF/WebP)는 빌드 때 따로 된다.
        const sharp = (await import('sharp')).default;
        const img = sharp(buf, { failOn: 'none' }).rotate();
        const meta = await img.metadata();
        const alpha = meta.hasAlpha && ext !== '.jpg' && ext !== '.jpeg';
        const outExt = alpha ? '.png' : '.jpg';
        const out = `${stem}-${hash}${outExt}`;
        const pipeline = img.resize({ width: 2800, height: 2800, fit: 'inside', withoutEnlargement: true });
        await (alpha ? pipeline.png({ compressionLevel: 9 }) : pipeline.jpeg({ quality: 88, mozjpeg: true })).toFile(
          path.join(UPLOAD_DIR, out),
        );
        logger.info(`업로드: src/assets/uploads/${out}`);
        return send(res, 200, { path: `uploads/${out}` });
      }

      if (req.method === 'GET' && p === '/admin/api/git') {
        let remote = '';
        let changes = [];
        let last = '';
        try {
          remote = await git('remote', 'get-url', 'origin');
        } catch {}
        try {
          const st = await git('status', '--porcelain', '--', ...TRACKED);
          changes = st ? st.split('\n').map((l) => l.slice(3)) : [];
        } catch {}
        try {
          last = await git('log', '-1', '--format=%cr · %s');
        } catch {}
        return send(res, 200, { remote, changes, last });
      }

      if (req.method === 'POST' && p === '/admin/api/publish') {
        const { message } = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        const log = [];
        try {
          await git('remote', 'get-url', 'origin');
        } catch {
          return send(res, 400, { ok: false, error: 'GitHub 저장소가 아직 연결되지 않았습니다. (git remote origin 없음)' });
        }
        await git('add', '-A', '--', ...TRACKED);
        const staged = await git('diff', '--cached', '--name-only');
        if (staged) {
          log.push(await git('commit', '-m', message?.trim() || '사이트 내용 업데이트 (어드민)'));
        }
        try {
          const { stderr } = await run('git', ['push', '-u', 'origin', 'HEAD'], { cwd: ROOT });
          log.push(stderr.trim());
        } catch (e) {
          return send(res, 500, { ok: false, error: `푸시 실패: ${e.stderr || e.message}`, log });
        }
        logger.info('GitHub에 올림');
        return send(res, 200, { ok: true, log });
      }

      return send(res, 404, { error: 'not found' });
    } catch (e) {
      logger.error(String(e?.stack ?? e));
      return send(res, 500, { ok: false, error: String(e?.message ?? e) });
    }
  };
}
