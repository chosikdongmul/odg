// @ts-check
import { defineConfig } from 'astro/config';
import localAdmin from './integrations/local-admin.mjs';

// 배포 주소가 정해지면 site·base 두 줄만 바꾼다.
// 예) https://chosikdongmul.github.io/<저장소이름>/  →  base: '/<저장소이름>'
// 커스텀 도메인을 쓰면 base: '/'
export default defineConfig({
  site: 'https://chosikdongmul.github.io',
  base: '/odg',
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
  integrations: [localAdmin()],
});
