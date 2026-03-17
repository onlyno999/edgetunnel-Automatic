// 相关环境变量(都是可选的)
// SUB_PATH | subpath  订阅路径
// PROXYIP  | proxyip  代理IP
// UUID     | uuid     UUID
// DISABLE_TROJAN | 是否关闭Trojan, 设置为true时关闭，false开启，默认开启 

import { connect } from 'cloudflare:sockets';

let subPath = 'link';
let password = '123456';
let proxyIP = 'proxy.xxxxxxxx.tk:50001';
let yourUUID = '5dc15e15-f285-4a9d-959b-0e4fbdd77b63';
let disabletro = false;

let cfip = [
    'mfa.gov.ua#SG', 'saas.sin.fan#HK', 'store.ubi.com#JP','cf.130519.xyz#KR','cf.008500.xyz#HK', 
    'cf.090227.xyz#SG', 'cf.877774.xyz#HK','cdns.doon.eu.org#JP','sub.danfeng.eu.org#TW','cf.zhetengsha.eu.org#HK'
];

function closeSocketQuietly(socket) { 
    try { 
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING) {
            socket.close(); 
        }
    } catch (error) {} 
}

function formatIdentifier(arr, offset = 0) {
    const hex = [...arr.slice(offset, offset + 16)].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}`;
}

function base64ToArray(b64Str) {
    if (!b64Str) return { error: null };
    try { 
        const binaryString = atob(b64Str.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return { earlyData: bytes.buffer, error: null }; 
    } catch (error) { 
        return { error }; 
    }
}

function parsePryAddress(serverStr) {
    if (!serverStr) return null;
    serverStr = serverStr.trim();
    if (serverStr.startsWith('socks://') || serverStr.startsWith('socks5://')) {
        const urlStr = serverStr.replace(/^socks:\/\//, 'socks5://');
        try {
            const url = new URL(urlStr);
            return {
                type: 'socks5',
                host: url.hostname,
                port: parseInt(url.port) || 1080,
                username: url.username ? decodeURIComponent(url.username) : '',
                password: url.password ? decodeURIComponent(url.password) : ''
            };
        } catch (e) {
            return null;
        }
    }
    
    if (serverStr.startsWith('http://') || serverStr.startsWith('https://')) {
        try {
            const url = new URL(serverStr);
            return {
                type: 'http',
                host: url.hostname,
                port: parseInt(url.port) || (serverStr.startsWith('https://') ? 443 : 80),
                username: url.username ? decodeURIComponent(url.username) : '',
                password: url.password ? decodeURIComponent(url.password) : ''
            };
        } catch (e) {
            return null;
        }
    }
    
    if (serverStr.startsWith('[')) {
        const closeBracket = serverStr.indexOf(']');
        if (closeBracket > 0) {
            const host = serverStr.substring(1, closeBracket);
            const rest = serverStr.substring(closeBracket + 1);
            if (rest.startsWith(':')) {
                const port = parseInt(rest.substring(1), 10);
                if (!isNaN(port) && port > 0 && port <= 65535) {
                    return { type: 'direct', host, port };
                }
            }
            return { type: 'direct', host, port: 443 };
        }
    }

    const lastColonIndex = serverStr.lastIndexOf(':');
    
    if (lastColonIndex > 0) {
        const host = serverStr.substring(0, lastColonIndex);
        const portStr = serverStr.substring(lastColonIndex + 1);
        const port = parseInt(portStr, 10);
        
        if (!isNaN(port) && port > 0 && port <= 65535) {
            return { type: 'direct', host, port };
        }
    }
    
    return { type: 'direct', host: serverStr, port: 443 };
}

function isSpeedTestSite(hostname) {
    const speedTestDomains = ['speedtest.net','fast.com','speedtest.cn','speed.cloudflare.com', 'ovo.speedtestcustom.com'];
    if (speedTestDomains.includes(hostname)) {
        return true;
    }

    for (const domain of speedTestDomains) {
        if (hostname.endsWith('.' + domain) || hostname === domain) {
            return true;
        }
    }
    return false;
}

async function sha224(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  let H = [0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939,0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4];
  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const paddedLen = Math.ceil((msgLen + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[msgLen] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 4, bitLen, false);
  for (let chunk = 0; chunk < paddedLen; chunk += 64) {
    const W = new Uint32Array(64);
    
    for (let i = 0; i < 16; i++) {
      W[i] = view.getUint32(chunk + i * 4, false);
    }
    
    for (let i = 16; i < 64; i++) {
      const s0 = rightRotate(W[i - 15], 7) ^ rightRotate(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rightRotate(W[i - 2], 17) ^ rightRotate(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    
    let [a, b, c, d, e, f, g, h] = H;
    
    for (let i = 0; i < 64; i++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }
  
  const result = [];
  for (let i = 0; i < 7; i++) {
    result.push(
      ((H[i] >>> 24) & 0xff).toString(16).padStart(2, '0'),
      ((H[i] >>> 16) & 0xff).toString(16).padStart(2, '0'),
      ((H[i] >>> 8) & 0xff).toString(16).padStart(2, '0'),
      (H[i] & 0xff).toString(16).padStart(2, '0')
    );
  }
  return result.join('');
}

function rightRotate(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

export default {
    async fetch(request, env, ctx) {
        try {

            if (subPath === 'link' || subPath === '') {
                subPath = yourUUID;
            }

            if (env.PROXYIP || env.proxyip || env.proxyIP) {
                const servers = (env.PROXYIP || env.proxyip || env.proxyIP).split(',').map(s => s.trim());
                proxyIP = servers[0]; 
            }
            password = env.PASSWORD || env.PASSWD || env.password || password;
            subPath = env.SUB_PATH || env.subpath || subPath;
            yourUUID = env.UUID || env.uuid || yourUUID;
            disabletro = env.DISABLE_TROJAN || env.CLOSE_TROJAN || disabletro;
            
            const url = new URL(request.url);
            const pathname = url.pathname;
            
            // ===== SIMPLE 30-DAY LINK GENERATOR (NO UUID GENERATOR) =====
            if (pathname === '/30day') {
                const auth = url.searchParams.get('key');
                if (auth !== password) {
                    return new Response('Unauthorized', { status: 401 });
                }
                
                const days = parseInt(url.searchParams.get('days')) || 30;
                const expireTime = Date.now() + (days * 24 * 60 * 60 * 1000);
                const hash = await sha224(yourUUID + expireTime);
                const token = hash.substring(0, 16) + '_exp_' + expireTime;
                const link = `https://${url.hostname}/${subPath}?token=${token}`;
                
                return new Response(link, {
                    headers: { 'Content-Type': 'text/plain' }
                });
            }
            
            // ===== HOME PAGE =====
            if (pathname === '/') {
                return new Response(`<!DOCTYPE html>
<html>
<head>
    <title>Simple Link Generator</title>
    <style>
        body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; }
        input, select, button { padding: 10px; margin: 5px; width: 100%; }
        .link { background: #f0f0f0; padding: 15px; word-break: break-all; display: none; }
    </style>
</head>
<body>
    <h2>30-Day Link Generator</h2>
    <p>Your UUID: <strong>${yourUUID}</strong></p>
    <p>Permanent link: <a href="https://${url.hostname}/${subPath}">https://${url.hostname}/${subPath}</a></p>
    
    <hr>
    
    <input type="password" id="password" placeholder="Enter password">
    <select id="days">
        <option value="7">7 days</option>
        <option value="15">15 days</option>
        <option value="30" selected>30 days</option>
        <option value="60">60 days</option>
        <option value="90">90 days</option>
    </select>
    <button onclick="getLink()">Generate 30-Day Link</button>
    
    <div class="link" id="linkBox">
        <strong>Your 30-day link:</strong><br>
        <span id="link"></span><br>
        <button onclick="copyLink()">Copy to clipboard</button>
    </div>
    
    <script>
        async function getLink() {
            const password = document.getElementById('password').value;
            const days = document.getElementById('days').value;
            
            if (!password) {
                alert('Enter password');
                return;
            }
            
            const response = await fetch(\`/30day?key=\${encodeURIComponent(password)}&days=\${days}\`);
            if (response.ok) {
                const link = await response.text();
                document.getElementById('link').textContent = link;
                document.getElementById('linkBox').style.display = 'block';
            } else {
                alert('Error: ' + response.status);
            }
        }
        
        function copyLink() {
            const link = document.getElementById('link').textContent;
            navigator.clipboard.writeText(link);
            alert('Copied!');
        }
    </script>
</body>
</html>`, {
                    headers: { 'Content-Type': 'text/html' }
                });
            }
            
            let pathProxyIP = null;
            if (pathname.startsWith('/proxyip=')) {
                try {
                    pathProxyIP = decodeURIComponent(pathname.substring(9)).trim();
                } catch (e) {}

                if (pathProxyIP && !request.headers.get('Upgrade')) {
                    proxyIP = pathProxyIP;
                    return new Response(`set proxyIP to: ${proxyIP}\n\n`);
                }
            }

            if (request.headers.get('Upgrade') === 'websocket') {
                let wsPathProxyIP = null;
                if (pathname.startsWith('/proxyip=')) {
                    try {
                        wsPathProxyIP = decodeURIComponent(pathname.substring(9)).trim();
                    } catch (e) {}
                }
                
                const customProxyIP = wsPathProxyIP || url.searchParams.get('proxyip') || request.headers.get('proxyip');
                return await handleVlsRequest(request, customProxyIP);
            } else if (request.method === 'GET') {
                
                if (url.pathname.toLowerCase().includes(`/${subPath.toLowerCase()}`)) {
                    
                    // ===== EXPIRATION CHECK =====
                    const token = url.searchParams.get('token');
                    if (token && token.includes('_exp_')) {
                        try {
                            const [originalToken, expireTime] = token.split('_exp_');
                            if (Date.now() > parseInt(expireTime)) {
                                return new Response('❌ Link expired. Please generate a new one.', { 
                                    status: 403,
                                    headers: { 'Content-Type': 'text/plain' }
                                });
                            }
                            
                            // Verify token
                            const expectedHash = await sha224(yourUUID + expireTime);
                            if (originalToken !== expectedHash.substring(0, 16)) {
                                return new Response('Invalid token', { status: 403 });
                            }
                        } catch (e) {
                            console.log('Token check failed:', e);
                        }
                    }
                    // ===== END EXPIRATION CHECK =====
                    
                    const currentDomain = url.hostname;
                    const vlsHeader = 'v' + 'l' + 'e' + 's' + 's';
                    const troHeader = 't' + 'r' + 'o' + 'j' + 'a' + 'n';
                    
                    const vlsLinks = cfip.map(cdnItem => {
                        let host, port = 443, nodeName = '';
                        if (cdnItem.includes('#')) {
                            const parts = cdnItem.split('#');
                            cdnItem = parts[0];
                            nodeName = parts[1];
                        }

                        if (cdnItem.startsWith('[') && cdnItem.includes(']:')) {
                            const ipv6End = cdnItem.indexOf(']:');
                            host = cdnItem.substring(0, ipv6End + 1); 
                            const portStr = cdnItem.substring(ipv6End + 2); 
                            port = parseInt(portStr) || 443;
                        } else if (cdnItem.includes(':')) {
                            const parts = cdnItem.split(':');
                            host = parts[0];
                            port = parseInt(parts[1]) || 443;
                        } else {
                            host = cdnItem;
                        }
                        
                        const vlsNodeName = nodeName ? `${nodeName}-${vlsHeader}` : `Workers-${vlsHeader}`;
                        return `${vlsHeader}://${yourUUID}@${host}:${port}?encryption=none&security=tls&sni=${currentDomain}&fp=firefox&allowInsecure=0&type=ws&host=${currentDomain}&path=%2F%3Fed%3D2560#${vlsNodeName}`;
                    });
                    
                    let allLinks = [...vlsLinks];
                    if (!disabletro) {
                        const troLinks = cfip.map(cdnItem => {
                            let host, port = 443, nodeName = '';
                            if (cdnItem.includes('#')) {
                                const parts = cdnItem.split('#');
                                cdnItem = parts[0];
                                nodeName = parts[1];
                            }

                            if (cdnItem.startsWith('[') && cdnItem.includes(']:')) {
                                const ipv6End = cdnItem.indexOf(']:');
                                host = cdnItem.substring(0, ipv6End + 1); 
                                const portStr = cdnItem.substring(ipv6End + 2); 
                                port = parseInt(portStr) || 443;
                            } else if (cdnItem.includes(':')) {
                                const parts = cdnItem.split(':');
                                host = parts[0];
                                port = parseInt(parts[1]) || 443;
                            } else {
                                host = cdnItem;
                            }
                            
                            const troNodeName = nodeName ? `${nodeName}-${troHeader}` : `Workers-${troHeader}`;
                            return `${troHeader}://${yourUUID}@${host}:${port}?security=tls&sni=${currentDomain}&fp=firefox&allowInsecure=0&type=ws&host=${currentDomain}&path=%2F%3Fed%3D2560#${troNodeName}`;
                        });
                        allLinks = [...vlsLinks, ...troLinks];
                    }
                    const linksText = allLinks.join('\n');
                    const base64Content = btoa(unescape(encodeURIComponent(linksText)));
                    return new Response(base64Content, {
                        headers: { 
                            'Content-Type': 'text/plain; charset=utf-8',
                            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                        },
                    });
                }
            }
            return new Response('Not Found', { status: 404 });
        } catch (err) {
            return new Response('Error: ' + err.message, { status: 500 });
        }
    },
};

// All helper functions (handleVlsRequest, parsetroHeader, etc.) go here - keep them exactly as in your original code
