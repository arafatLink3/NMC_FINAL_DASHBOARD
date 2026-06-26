const http = require('http');
const fs = require('fs');

const outFile = 'C:\\Test_NMC_Dashboard\\web-check-out.txt';
fs.writeFileSync(outFile, '');
function log(s) { fs.appendFileSync(outFile, s + '\n'); }

function check(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (r) => {
      let body = '';
      r.on('data', (c) => (body += c));
      r.on('end', () => {
        const result = {
          url,
          status: r.statusCode,
          ct: r.headers['content-type'] || '',
          length: body.length,
          hasRoot: body.includes('id="root"'),
          hasMain: body.includes('/src/main.tsx'),
        };
        log(JSON.stringify(result, null, 2));
        resolve();
      });
    });
    req.on('error', (e) => {
      log('ERROR ' + url + ': ' + e.message);
      resolve();
    });
  });
}

(async () => {
  log('checking...');
  await check('http://127.0.0.1:5173/');
  await check('http://127.0.0.1:5173/login');
  log('DONE');
})();