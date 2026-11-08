# 철사 퍼즐 소스

`철사 퍼즐.html`(저장소 맨 위)을 만드는 원본 코드입니다.

- `src/app.js`: 단계 모양, 물리, 터치 조작
- `src/template.html`: 화면 구성과 스타일

다시 만들기:

```bash
npm install
node build.mjs "../철사 퍼즐.html"
```

three.js r160(MIT)과 Rapier 3D compat 0.12.0(Apache 2.0)을 HTML 하나에 함께 넣습니다.
