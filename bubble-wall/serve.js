/* =========================================================
   时间备忘录 · 本地静态服务器
   用途：让同一 Wi-Fi 下的手机也能打开这个网页
   用法：双击「启动-手机访问.cmd」，或在本目录执行 node serve.js
   停止：在这个窗口按 Ctrl + C
   ========================================================= */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const PORTS = [8088, 8089, 8090, 8091, 8080, 3000];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

/** 找出本机在局域网里的 IPv4 地址 */
function lanAddresses() {
  const list = [];
  const nets = os.networkInterfaces();

  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      // 跳过虚拟机 / 热点这类大概率连不上的网卡
      if (/^(169\.254\.)/.test(net.address)) continue;
      list.push({ address: net.address, name });
    }
  }
  // 家用网段优先排在前面
  list.sort((a, b) => {
    const score = (ip) => (/^192\.168\./.test(ip) ? 0 : /^10\./.test(ip) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
    return score(a.address) - score(b.address);
  });
  return list;
}

function send(res, code, type, body) {
  res.writeHead(code, {
    'Content-Type': type,
    // 不缓存：避免出现“新脚本配旧页面”的版本错乱
    'Cache-Control': 'no-store, must-revalidate',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch (_) {
    urlPath = '/';
  }

  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  const safePath = path.normalize(urlPath).replace(/^([/\\]|\.\.[/\\])+/, '');
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    send(res, 403, 'text/plain; charset=utf-8', '403 不允许访问这个路径');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, 'text/plain; charset=utf-8', '404 找不到：' + urlPath);
      return;
    }
    send(res, 200, MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream', data);
  });
});

function printReady(port) {
  const addrs = lanAddresses();
  const line = '='.repeat(54);

  console.log('');
  console.log(line);
  console.log('  时间备忘录 已经启动');
  console.log(line);
  console.log('');
  console.log('  电脑上打开：  http://localhost:' + port);
  console.log('');

  if (addrs.length) {
    console.log('  手机上打开（手机和电脑要连同一个 Wi-Fi）：');
    addrs.forEach((a) => {
      console.log('      http://' + a.address + ':' + port + '     [' + a.name + ']');
    });
    console.log('');
    console.log('  一般第一个就是你的 Wi-Fi 地址，直接在手机浏览器里输入它。');
  } else {
    console.log('  没找到局域网地址：电脑可能没连 Wi-Fi / 网络。');
  }

  console.log('');
  console.log('  · 关掉这个黑窗口（或按 Ctrl + C）就停止服务');
  console.log('  · 如果手机打不开，多半是 Windows 防火墙拦了：');
  console.log('    弹出提示时选「允许访问」，或去防火墙里放行 Node.js');
  console.log(line);
  console.log('');
}

let index = 0;

function listen() {
  const port = PORTS[index];

  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && index < PORTS.length - 1) {
      index += 1;
      listen();
      return;
    }
    console.error('启动失败：' + err.message);
    process.exit(1);
  });

  server.listen(port, '0.0.0.0', () => printReady(port));
}

listen();

process.on('SIGINT', () => {
  console.log('\n已停止。');
  process.exit(0);
});
