const http = require('http');

function check(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (r) => {
      let body = '';
      r.on('data', (c) => (body += c));
      r.on('end', () =>
        resolve({
          url,
          status: r.statusCode,
          ct: r.headers['content-type'] || '',
          length: body.length,
          hasRoot: body.includes('id="root"'),
          hasMain: body.includes('/src/main.tsx'),
          snippet: body.slice(0, 200),
        })
      );
    });
    req.on('error', (e) => resolve({ url, error: e.message }));
  });
}

(async () => {
  for (const u of [
    'http://127.0.0.1:5173/',
    'http://127.0.0.1:5173/login',
    'http://127.0.0.1:5173/src/main.tsx',
  ]) {
    console.log(JSON.stringify(await check(u), null, 2));
  }
})();