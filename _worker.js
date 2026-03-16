// 相关环境变量(都是可选的)
// SUB_PATH | subpath  订阅路径
// PROXYIP  | proxyip  代理IP
// UUID     | uuid     UUID
// DISABLE_TROJAN | 是否关闭Trojan, 设置为true时关闭，false开启，默认开启 

import { connect } from 'cloudflare:sockets';

let subPath = 'link';     // 节点订阅路径,不修改将使用uuid作为订阅路径
let password = '123456';  // 主页密码,建议修改或添加 PASSWORD环境变量
let proxyIP = 'proxy.xxxxxxxx.tk:50001';  // proxyIP 格式：ip、域名、ip:port、域名:port等,没填写port，默认使用443
let yourUUID = '5dc15e15-f285-4a9d-959b-0e4fbdd77b63'; // UUID,建议修改或添加环境便量
let disabletro = false;  // 是否关闭trojan, 设置为true时关闭，false开启 

// CDN - Your original static proxies (KEEP THESE!)
let cfip = [ // 格式:优选域名:端口#备注名称、优选IP:端口#备注名称、[ipv6优选]:端口#备注名称、优选域名#备注 
    'mfa.gov.ua#SG', 'saas.sin.fan#HK', 'store.ubi.com#JP','cf.130519.xyz#KR','cf.008500.xyz#HK', 
    'cf.090227.xyz#SG', 'cf.877774.xyz#HK','cdns.doon.eu.org#JP','sub.danfeng.eu.org#TW','cf.zhetengsha.eu.org#HK'
];  // 在此感谢各位大佬维护的优选域名

// ===== NEW: PROXY SCRAPER VARIABLES =====
let scrapedProxies = [];
let lastScrapeTime = 0;
const SCRAPE_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

// ===== NEW: PROXY SCRAPER FUNCTIONS =====

/**
 * Scrape free proxies from public sources
 */
async function scrapeFreeProxies() {
    const sources = [
        'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
        'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
        'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
        'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt'
    ];
    
    let allProxies = new Set();
    
    for (const source of sources) {
        try {
            const response = await fetch(source, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProxyChecker/1.0)' },
                timeout: 5000
            });
            
            if (response.ok) {
                const text = await response.text();
                const proxies = text.split('\n')
                    .map(line => line.trim())
                    .filter(line => line && line.includes(':') && !line.includes('#'))
                    .map(line => line.split(' ')[0].trim());
                
                proxies.forEach(p => allProxies.add(p));
                console.log(`✓ Scraped ${proxies.length} from ${source.split('/')[3]}`);
            }
        } catch (e) {
            console.log(`✗ Failed to scrape: ${e.message}`);
        }
        
        // Be respectful - delay between requests
        await new Promise(r => setTimeout(r, 1000));
    }
    
    return Array.from(allProxies);
}

/**
 * Test if a proxy is working
 */
async function testProxy(proxy) {
    const testUrl = 'http://httpbin.org/ip';
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(testUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
            return true;
        }
    } catch (e) {
        // Proxy failed
    }
    return false;
}

/**
 * Test multiple proxies concurrently
 */
async function testProxiesConcurrent(proxies, concurrency = 10) {
    const working = [];
    const chunks = [];
    
    // Split into chunks for concurrency control
    for (let i = 0; i < proxies.length; i += concurrency) {
        chunks.push(proxies.slice(i, i + concurrency));
    }
    
    for (const chunk of chunks) {
        const results = await Promise.all(
            chunk.map(async (proxy) => {
                const isWorking = await testProxy(proxy);
                return isWorking ? proxy : null;
            })
        );
        
        working.push(...results.filter(p => p !== null));
        
        // Small delay between chunks
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return working;
}

/**
 * Format proxies for cfip array with regions
 */
function formatProxiesForCfip(proxies, limit = 20) {
    const regions = ['🇺🇸', '🇬🇧', '🇩🇪', '🇫🇷', '🇯🇵', '🇸🇬', '🇰🇷', '🇨🇦', '🇦🇺', '🇳🇱'];
    return proxies.slice(0, limit).map((proxy, index) => {
        const region = regions[index % regions.length];
        return `${proxy}#${region}Scraped-${index+1}`;
    });
}

/**
 * MAIN FUNCTION: Refresh proxy pool (combines old + new)
 */
async function refreshProxyPool() {
    const now = Date.now();
    
    // Only scrape every 6 hours
    if (now - lastScrapeTime < SCRAPE_INTERVAL && scrapedProxies.length > 0) {
        console.log('Using cached scraped proxies');
        return scrapedProxies;
    }
    
    console.log('🔄 Starting proxy scrape (every 6 hours)...');
    const allProxies = await scrapeFreeProxies();
    console.log(`Found ${allProxies.length} total proxies, testing...`);
    
    // Test first 200 proxies
    const workingProxies = await testProxiesConcurrent(allProxies.slice(0, 200), 15);
    console.log(`✅ Found ${workingProxies.length} working proxies`);
    
    scrapedProxies = workingProxies;
    lastScrapeTime = now;
    
    // ===== OPTION 2: COMBINE BOTH (20 new + 5 old) =====
    const oldProxyCount = Math.min(5, cfip.length); // Keep up to 5 old ones
    const scrapedFormatted = formatProxiesForCfip(workingProxies, 20);
    const oldFormatted = cfip.slice(0, oldProxyCount);
    
    // UPDATE cfip with combined list
    cfip = [...scrapedFormatted, ...oldFormatted];
    
    console.log(`📊 FINAL PROXY POOL: ${cfip.length} total (${scrapedFormatted.length} new scraped + ${oldFormatted.length} original static)`);
    console.log('New cfip:', cfip);
    
    return workingProxies;
}

// Telegram bot variables
let tgBotToken = '';
let tgChatId = '';
let adminKey = 'admin123';

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
    // 解析 S5
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
    
    // 解析 HTTP
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
    
    // 处理 IPv6 格式 [host]:port
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

/**
 * Generate a random UUID v4
 * @returns {string}
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Generate a short link code
 * @param {string} uuid 
 * @param {number} length 
 * @returns {string}
 */
function generateShortCode(uuid, length = 8) {
    return uuid.replace(/-/g, '').substring(0, length);
}

/**
 * Generate expiring link token
 * @param {string} uuid 
 * @param {number} days 
 * @returns {Promise<string>}
 */
async function generateExpiringToken(uuid, days = 30) {
    const expireTime = Date.now() + (days * 24 * 60 * 60 * 1000);
    const hash = await sha224(uuid + expireTime);
    const shortHash = hash.substring(0, 16);
    return `${shortHash}_exp_${expireTime}`;
}

export default {
    /**
     * @param {import("@cloudflare/workers-types").Request} request
     * @param {{UUID: string, uuid: string, PROXYIP: string, PASSWORD: string, PASSWD: string, password: string, proxyip: string, proxyIP: string, SUB_PATH: string, subpath: string, DISABLE_TROJAN: string, CLOSE_TROJAN: string, TG_BOT_TOKEN: string, TG_CHAT_ID: string, ADMIN_KEY: string}} env
     * @param {import("@cloudflare/workers-types").ExecutionContext} ctx
     * @returns {Promise<Response>}
     */
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
            
            // Telegram bot variables
            tgBotToken = env.TG_BOT_TOKEN || tgBotToken;
            tgChatId = env.TG_CHAT_ID || tgChatId;
            adminKey = env.ADMIN_KEY || adminKey;
            
            const url = new URL(request.url);
            const pathname = url.pathname;
            
            // ===== FIXED: 30-DAY LINK GENERATOR ENDPOINT =====
            if (pathname === '/generate-30day-link') {
                const days = parseInt(url.searchParams.get('days')) || 30;
                
                // Generate proper token using sha224 function
                const expireTime = Date.now() + (days * 24 * 60 * 60 * 1000);
                const hash = await sha224(yourUUID + expireTime);
                const token = `${hash.substring(0, 16)}_exp_${expireTime}`;
                
                // Create the full link
                const link = `https://${url.hostname}/${subPath}?token=${token}`;
                
                return new Response(JSON.stringify({ 
                    success: true, 
                    link: link,
                    expires: new Date(expireTime).toLocaleString()
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            
            // ===== TELEGRAM BOT WEBHOOK HANDLER =====
            if (pathname === '/tg-webhook') {
                try {
                    const update = await request.json();
                    
                    // Handle /start command
                    if (update.message?.text === '/start') {
                        const chatId = update.message.chat.id;
                        
                        await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                text: `Welcome! 🎉\n\n` +
                                      `Use /getlink to get your 30-day subscription link.\n` +
                                      `Use /help for more options.`,
                                parse_mode: 'HTML'
                            })
                        });
                    }
                    
                    // Handle /getlink command
                    else if (update.message?.text === '/getlink') {
                        const chatId = update.message.chat.id;
                        
                        // Generate 30-day link
                        const expiringToken = await generateExpiringToken(yourUUID, 30);
                        const baseUrl = `https://${url.hostname}`;
                        const v2rayLink = `${baseUrl}/${subPath}?token=${expiringToken}`;
                        const clashLink = `https://sublink.eooce.com/clash?config=${baseUrl}/${subPath}&token=${expiringToken}`;
                        
                        await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                text: `🔐 <b>Your 30-Day Subscription Links</b>\n\n` +
                                      `📱 <b>V2Ray:</b>\n<code>${v2rayLink}</code>\n\n` +
                                      `🔄 <b>Clash:</b>\n<code>${clashLink}</code>\n\n` +
                                      `⏰ <b>Expires:</b> ${new Date(Date.now() + 30*24*60*60*1000).toLocaleString()}\n\n` +
                                      `⚠️ <i>Keep these links private!</i>`,
                                parse_mode: 'HTML'
                            })
                        });
                    }
                    
                    // Handle /help command
                    else if (update.message?.text === '/help') {
                        const chatId = update.message.chat.id;
                        
                        await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                text: `📚 <b>Available Commands:</b>\n\n` +
                                      `/start - Welcome message\n` +
                                      `/getlink - Get 30-day subscription links\n` +
                                      `/renew - Renew your link (if expired)\n` +
                                      `/help - Show this help`,
                                parse_mode: 'HTML'
                            })
                        });
                    }
                    
                    // Handle /renew command
                    else if (update.message?.text === '/renew') {
                        const chatId = update.message.chat.id;
                        
                        // Generate new 30-day link
                        const expiringToken = await generateExpiringToken(yourUUID, 30);
                        const baseUrl = `https://${url.hostname}`;
                        const v2rayLink = `${baseUrl}/${subPath}?token=${expiringToken}`;
                        
                        await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                text: `🔄 <b>Your Link Has Been Renewed!</b>\n\n` +
                                      `New link valid for 30 days:\n` +
                                      `<code>${v2rayLink}</code>\n\n` +
                                      `⏰ New expiry: ${new Date(Date.now() + 30*24*60*60*1000).toLocaleString()}`,
                                parse_mode: 'HTML'
                            })
                        });
                    }
                    
                    return new Response('OK');
                } catch (e) {
                    console.error('Telegram webhook error:', e);
                    return new Response('Error', { status: 500 });
                }
            }
            
            // ===== ADMIN LINK GENERATOR =====
            if (pathname === '/admin/generate') {
                const adminPass = url.searchParams.get('key');
                if (adminPass !== adminKey) {
                    return new Response('Unauthorized', { status: 401 });
                }
                
                const days = parseInt(url.searchParams.get('days')) || 30;
                const count = parseInt(url.searchParams.get('count')) || 1;
                
                let links = [];
                for (let i = 0; i < count; i++) {
                    const expiringToken = await generateExpiringToken(yourUUID + i, days);
                    links.push({
                        v2ray: `https://${url.hostname}/${subPath}?token=${expiringToken}`,
                        expiresAt: new Date(Date.now() + days*24*60*60*1000).toLocaleString()
                    });
                }
                
                return new Response(JSON.stringify(links, null, 2), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            
            // ===== PROXY MANAGEMENT ENDPOINTS =====
            if (pathname === '/admin/proxies') {
                const adminPass = url.searchParams.get('key');
                if (adminPass !== adminKey) {
                    return new Response('Unauthorized', { status: 401 });
                }
                
                const action = url.searchParams.get('action') || 'list';
                
                if (action === 'scrape') {
                    // Force a new scrape
                    lastScrapeTime = 0;
                    await refreshProxyPool();
                    
                    return new Response(JSON.stringify({
                        success: true,
                        message: `Scraped ${scrapedProxies.length} working proxies`,
                        cfip: cfip,
                        total: cfip.length,
                        scraped: scrapedProxies.length,
                        original: 5
                    }, null, 2), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                
                if (action === 'list') {
                    return new Response(JSON.stringify({
                        total: cfip.length,
                        scrapedCount: scrapedProxies.length,
                        originalCount: Math.min(5, cfip.length - scrapedProxies.length),
                        lastScrape: lastScrapeTime ? new Date(lastScrapeTime).toLocaleString() : 'Never',
                        proxies: cfip
                    }, null, 2), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                
                return new Response('Invalid action', { status: 400 });
            }
            
            // ===== PROXY STATUS PAGE =====
            if (pathname === '/proxy-status') {
                const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Proxy Status</title>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: Arial; padding: 20px; background: #f5f5f5; }
                        .container { max-width: 1200px; margin: 0 auto; }
                        .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
                        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px; }
                        .stat-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        .stat-value { font-size: 2rem; font-weight: bold; color: #667eea; }
                        .proxy-list { background: white; border-radius: 10px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        .proxy-item { display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #eee; }
                        .proxy-item:last-child { border-bottom: none; }
                        .proxy-ip { font-family: monospace; color: #333; }
                        .proxy-status { color: #48bb78; font-weight: bold; }
                        .btn { background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-right: 10px; }
                        .btn:hover { background: #5a67d8; }
                        .btn-danger { background: #f56565; }
                        .btn-danger:hover { background: #e53e3e; }
                        .refresh { text-align: right; margin-bottom: 20px; }
                        .timestamp { color: #718096; font-size: 0.9rem; }
                        .badge { background: #48bb78; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; }
                        .badge-original { background: #805ad5; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🌐 Proxy Scraper Status</h1>
                            <p>Automatically scraped proxies + Original static proxies working together</p>
                        </div>
                        
                        <div class="refresh">
                            <button class="btn" onclick="refreshData()">🔄 Refresh</button>
                            <button class="btn btn-danger" onclick="scrapeNew()">🔍 Force Scrape New Proxies</button>
                        </div>
                        
                        <div class="stats" id="stats">
                            <div class="stat-card">
                                <h3>Loading...</h3>
                            </div>
                        </div>
                        
                        <div class="proxy-list">
                            <h2>📋 Current Proxy Pool</h2>
                            <div id="proxyList">Loading...</div>
                        </div>
                    </div>
                    
                    <script>
                        async function loadData() {
                            const response = await fetch('/admin/proxies?action=list&key=${adminKey}');
                            const data = await response.json();
                            
                            document.getElementById('stats').innerHTML = \`
                                <div class="stat-card">
                                    <h3>Total Proxies</h3>
                                    <div class="stat-value">\${data.total}</div>
                                </div>
                                <div class="stat-card">
                                    <h3>Scraped Proxies</h3>
                                    <div class="stat-value">\${data.scrapedCount}</div>
                                </div>
                                <div class="stat-card">
                                    <h3>Original Proxies</h3>
                                    <div class="stat-value">\${data.originalCount}</div>
                                </div>
                                <div class="stat-card">
                                    <h3>Last Scrape</h3>
                                    <div class="stat-value" style="font-size:1rem;">\${data.lastScrape}</div>
                                </div>
                            \`;
                            
                            let proxyHtml = '';
                            data.proxies.forEach((proxy, index) => {
                                const isOriginal = index >= data.scrapedCount;
                                const badgeClass = isOriginal ? 'badge-original' : '';
                                const badgeText = isOriginal ? 'Original' : 'Scraped';
                                proxyHtml += \`
                                    <div class="proxy-item">
                                        <span class="proxy-ip">\${proxy}</span>
                                        <span class="badge \${badgeClass}">\${badgeText}</span>
                                    </div>
                                \`;
                            });
                            document.getElementById('proxyList').innerHTML = proxyHtml;
                        }
                        
                        async function scrapeNew() {
                            if(confirm('Force scrape new proxies? This may take a moment.')) {
                                const response = await fetch('/admin/proxies?action=scrape&key=${adminKey}');
                                const data = await response.json();
                                alert(\`✅ \${data.message}\`);
                                loadData();
                            }
                        }
                        
                        function refreshData() {
                            loadData();
                        }
                        
                        loadData();
                    </script>
                </body>
                </html>
                `;
                
                return new Response(html, {
                    headers: { 'Content-Type': 'text/html' }
                });
            }
            
            // ===== SHORT LINK HANDLER =====
            if (pathname.startsWith('/s/')) {
                const shortCode = pathname.substring(3);
                // Redirect to main page with the UUID
                return new Response('Redirecting...', {
                    status: 302,
                    headers: { 'Location': '/' }
                });
            }
            
            let pathProxyIP = null;
            if (pathname.startsWith('/proxyip=')) {
                try {
                    pathProxyIP = decodeURIComponent(pathname.substring(9)).trim();
                } catch (e) {
                    // 忽略错误
                }

                if (pathProxyIP && !request.headers.get('Upgrade')) {
                    proxyIP = pathProxyIP;
                    return new Response(`set proxyIP to: ${proxyIP}\n\n`, {
                        headers: { 
                            'Content-Type': 'text/plain; charset=utf-8',
                            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                        },
                    });
                }
            }

            if (request.headers.get('Upgrade') === 'websocket') {
                let wsPathProxyIP = null;
                if (pathname.startsWith('/proxyip=')) {
                    try {
                        wsPathProxyIP = decodeURIComponent(pathname.substring(9)).trim();
                    } catch (e) {
                        // 忽略错误
                    }
                }
                
                const customProxyIP = wsPathProxyIP || url.searchParams.get('proxyip') || request.headers.get('proxyip');
                return await handleVlsRequest(request, customProxyIP);
            } else if (request.method === 'GET') {
                if (url.pathname === '/') {
                    return getHomePage(request);
                }
                
                if (url.pathname.toLowerCase().includes(`/${subPath.toLowerCase()}`)) {
                    
                    // ===== 30-DAY EXPIRATION CHECK =====
                    const token = url.searchParams.get('token');
                    if (token && token.includes('_exp_')) {
                        try {
                            const [originalToken, expireTime] = token.split('_exp_');
                            if (Date.now() > parseInt(expireTime)) {
                                return new Response('❌ Subscription link expired. Please get a new one from Telegram bot.', { 
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
                            // If token parsing fails, continue without expiration
                            console.log('Token check failed:', e);
                        }
                    }
                    // ===== END EXPIRATION CHECK =====
                    
                    // ===== REFRESH PROXIES IN BACKGROUND (doesn't block subscription) =====
                    ctx.waitUntil(refreshProxyPool());
                    
                    const currentDomain = url.hostname;
                    const vlsHeader = 'v' + 'l' + 'e' + 's' + 's';
                    const troHeader = 't' + 'r' + 'o' + 'j' + 'a' + 'n';
                    
                    // 生成 VLE-SS 节点 (using UPDATED cfip with both old + new)
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
                    
                    // 生成 Tro-jan 节点
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
            return new Response('Internal Server Error', { status: 500 });
        }
    },
};

/**
 * @param {import("@cloudflare/workers-types").Request} request
 * @returns {Response}
 */
function getHomePage(request) {
	const url = request.headers.get('Host');
	const baseUrl = `https://${url}`;
	const urlObj = new URL(request.url);
	const providedPassword = urlObj.searchParams.get('password');
	
	// Check if we're generating a new UUID
	const generateNew = urlObj.searchParams.get('generate') === 'true';
	
	if (providedPassword) {
		if (providedPassword === password) {
			// If generate new UUID requested, create one
			if (generateNew) {
				const newUUID = generateUUID();
				return getMainPageContent(url, baseUrl, newUUID);
			}
			return getMainPageContent(url, baseUrl, yourUUID);
		} else {
			return getLoginPage(url, baseUrl, true);
		}
	}
	return getLoginPage(url, baseUrl, false);
}

/**
 * 获取登录页面
 * @param {string} url 
 * @param {string} baseUrl 
 * @param {boolean} showError 
 * @returns {Response}
 */
function getLoginPage(url, baseUrl, showError = false) {
	const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workers Service - 登录</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #333;
            margin: 0;
            padding: 20px;
        }
        
        .login-container {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            max-width: 450px;
            width: 100%;
            text-align: center;
            animation: slideUp 0.5s ease;
        }
        
        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .logo {
            margin-bottom: 20px;
        }
        
        .logo img {
            width: 80px;
            height: 80px;
        }
        
        .title {
            font-size: 2rem;
            margin-bottom: 8px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .subtitle {
            color: #718096;
            margin-bottom: 30px;
            font-size: 1rem;
        }
        
        .form-group {
            margin-bottom: 20px;
            text-align: left;
        }
        
        .form-label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #4a5568;
        }
        
        .form-input {
            width: 100%;
            padding: 14px 16px;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            font-size: 1rem;
            transition: all 0.3s ease;
            background: #fff;
        }
        
        .form-input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        
        .btn-login {
            width: 100%;
            padding: 14px 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }
        
        .btn-login:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
        }
        
        .btn-login:active {
            transform: translateY(0);
        }
        
        .btn-login::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.3);
            transform: translate(-50%, -50%);
            transition: width 0.6s, height 0.6s;
        }
        
        .btn-login:active::after {
            width: 300px;
            height: 300px;
        }
        
        .error-message {
            background: #fed7d7;
            color: #c53030;
            padding: 14px;
            border-radius: 12px;
            margin-bottom: 20px;
            border-left: 4px solid #e53e3e;
            animation: shake 0.5s ease;
        }
        
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
            20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        
        .features {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin: 30px 0 20px;
            color: #718096;
        }
        
        .feature-item {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 0.9rem;
        }
        
        .feature-item i {
            color: #667eea;
        }
        
        .footer {
            margin-top: 30px;
            color: #718096;
            font-size: 0.9rem;
        }
        
        .footer a {
            color: #667eea;
            text-decoration: none;
            font-weight: 600;
        }
        
        .footer a:hover {
            text-decoration: underline;
        }
        
        @media (max-width: 480px) {
            .login-container {
                padding: 30px 20px;
            }
            
            .title {
                font-size: 1.8rem;
            }
            
            .features {
                flex-direction: column;
                gap: 10px;
                align-items: center;
            }
        }
    </style>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
</head>
<body>
    <div class="login-container">
        <div class="logo">
            <img src="https://img.icons8.com/color/96/cloudflare.png" alt="Cloudflare">
        </div>
        <h1 class="title">Welcome Back!</h1>
        <p class="subtitle">Enter your password to access the service</p>
        
        ${showError ? '<div class="error-message"><i class="fas fa-exclamation-circle"></i> Invalid password. Please try again.</div>' : ''}
        
        <form onsubmit="handleLogin(event)">
            <div class="form-group">
                <label class="form-label" for="password">
                    <i class="fas fa-lock"></i> Password
                </label>
                <input 
                    type="password" 
                    id="password" 
                    name="password" 
                    class="form-input" 
                    placeholder="Enter your password"
                    required
                    autofocus
                >
            </div>
            <button type="submit" class="btn-login">
                <i class="fas fa-sign-in-alt"></i> Login
            </button>
        </form>
        
        <div class="features">
            <div class="feature-item">
                <i class="fas fa-bolt"></i> Fast & Secure
            </div>
            <div class="feature-item">
                <i class="fas fa-shield-alt"></i> Cloudflare Protected
            </div>
            <div class="feature-item">
                <i class="fas fa-infinity"></i> Unlimited Traffic
            </div>
        </div>
        
        <div class="footer">
            <p>Powered by <a href="https://t.me/eooceu" target="_blank">eooce</a> | <i class="fas fa-heart" style="color: #ff6b6b;"></i> Made with love</p>
        </div>
    </div>
    
    <script>
        function handleLogin(event) {
            event.preventDefault();
            const password = document.getElementById('password').value;
            const currentUrl = new URL(window.location);
            currentUrl.searchParams.set('password', password);
            window.location.href = currentUrl.toString();
        }
        
        // Add floating animation to logo
        document.querySelector('.logo img').style.animation = 'float 3s ease-in-out infinite';
        
        const style = document.createElement('style');
        style.textContent = \`
            @keyframes float {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-10px); }
            }
        \`;
        document.head.appendChild(style);
    </script>
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: {
			'Content-Type': 'text/html;charset=utf-8',
			'Cache-Control': 'no-cache, no-store, must-revalidate',
		},
	});
}

/**
 * Get main page content with UUID generator and short links
 * @param {string} url 
 * @param {string} baseUrl 
 * @param {string} currentUUID
 * @returns {Response}
 */
function getMainPageContent(url, baseUrl, currentUUID) {
	const shortCode = generateShortCode(currentUUID);
	const shortLink = `${baseUrl}/s/${shortCode}`;
	
	const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workers Service Dashboard</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #333;
            margin: 0;
            padding: 20px;
        }
        
        .container {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 30px;
            padding: 30px;
            box-shadow: 0 30px 60px rgba(0, 0, 0, 0.2);
            max-width: 1000px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            position: relative;
            animation: slideUp 0.5s ease;
        }
        
        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .logout-btn {
            position: absolute;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #ff6b6b, #ee5a24);
            color: white;
            border: none;
            border-radius: 12px;
            padding: 10px 20px;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 15px rgba(255, 107, 107, 0.3);
            z-index: 100;
        }
        
        .logout-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(255, 107, 107, 0.4);
        }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-top: 20px;
        }
        
        .logo {
            width: 80px;
            height: 80px;
            margin: 0 auto 20px;
            animation: float 3s ease-in-out infinite;
        }
        
        @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
        }
        
        .title {
            font-size: 2.5rem;
            margin-bottom: 10px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .subtitle {
            color: #718096;
            font-size: 1.1rem;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: white;
            border-radius: 20px;
            padding: 20px;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            transition: all 0.3s ease;
            border: 1px solid rgba(102, 126, 234, 0.1);
        }
        
        .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 40px rgba(102, 126, 234, 0.2);
        }
        
        .stat-icon {
            width: 50px;
            height: 50px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 15px;
            color: white;
            font-size: 1.5rem;
        }
        
        .stat-value {
            font-size: 1.8rem;
            font-weight: bold;
            color: #2d3748;
            margin-bottom: 5px;
        }
        
        .stat-label {
            color: #718096;
            font-size: 0.9rem;
        }
        
        .uuid-section {
            background: linear-gradient(135deg, #f6f9fc, #e6f0fa);
            border-radius: 20px;
            padding: 25px;
            margin-bottom: 30px;
            border: 2px solid rgba(102, 126, 234, 0.2);
        }
        
        .section-title {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 20px;
            color: #2d3748;
            font-size: 1.3rem;
        }
        
        .section-title i {
            color: #667eea;
        }
        
        .uuid-display {
            background: white;
            border-radius: 15px;
            padding: 20px;
            margin-bottom: 20px;
            border: 2px dashed #667eea;
        }
        
        .uuid-label {
            font-size: 0.9rem;
            color: #718096;
            margin-bottom: 5px;
        }
        
        .uuid-value {
            font-family: 'Courier New', monospace;
            font-size: 1.2rem;
            font-weight: bold;
            color: #2d3748;
            word-break: break-all;
            background: #f7fafc;
            padding: 10px;
            border-radius: 10px;
            margin: 10px 0;
        }
        
        .short-link {
            background: #ebf8ff;
            border-radius: 10px;
            padding: 15px;
            margin-top: 15px;
            border-left: 4px solid #4299e1;
        }
        
        .short-link-label {
            font-size: 0.9rem;
            color: #2b6cb0;
            margin-bottom: 5px;
            font-weight: 600;
        }
        
        .short-link-value {
            font-family: 'Courier New', monospace;
            font-size: 1.1rem;
            color: #2c5282;
            word-break: break-all;
        }
        
        .button-group {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            margin: 20px 0;
        }
        
        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            transition: all 0.3s ease;
            flex: 1;
            min-width: 150px;
            justify-content: center;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
        }
        
        .btn-secondary {
            background: linear-gradient(135deg, #48bb78, #38a169);
            color: white;
            box-shadow: 0 4px 15px rgba(72, 187, 120, 0.3);
        }
        
        .btn-warning {
            background: linear-gradient(135deg, #fbbf24, #f59e0b);
            color: white;
            box-shadow: 0 4px 15px rgba(251, 191, 36, 0.3);
        }
        
        .btn-danger {
            background: linear-gradient(135deg, #f87171, #ef4444);
            color: white;
            box-shadow: 0 4px 15px rgba(248, 113, 113, 0.3);
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
        }
        
        .btn:active {
            transform: translateY(0);
        }
        
        .links-section {
            background: white;
            border-radius: 20px;
            padding: 25px;
            margin-bottom: 30px;
        }
        
        .link-item {
            background: #f7fafc;
            border-radius: 12px;
            padding: 15px;
            margin-bottom: 15px;
            border: 1px solid #e2e8f0;
            transition: all 0.3s ease;
        }
        
        .link-item:hover {
            border-color: #667eea;
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.1);
        }
        
        .link-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
            color: #4a5568;
            font-weight: 600;
        }
        
        .link-header i {
            color: #667eea;
        }
        
        .link-content {
            display: flex;
            gap: 10px;
            align-items: center;
            flex-wrap: wrap;
        }
        
        .link-url {
            font-family: 'Courier New', monospace;
            font-size: 0.9rem;
            color: #2d3748;
            background: white;
            padding: 8px 12px;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
            flex: 1;
            word-break: break-all;
        }
        
        .copy-btn {
            background: #667eea;
            color: white;
            border: none;
            border-radius: 8px;
            padding: 8px 15px;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 0.9rem;
        }
        
        .copy-btn:hover {
            background: #5a67d8;
            transform: scale(1.05);
        }
        
        .toast {
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: white;
            border-radius: 12px;
            padding: 15px 25px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            display: flex;
            align-items: center;
            gap: 15px;
            transform: translateX(400px);
            transition: transform 0.3s ease;
            z-index: 1000;
            border-left: 4px solid #48bb78;
        }
        
        .toast.show {
            transform: translateX(0);
        }
        
        .toast-icon {
            width: 30px;
            height: 30px;
            background: #48bb78;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 1rem;
        }
        
        .toast-message {
            color: #2d3748;
            font-weight: 500;
        }
        
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            align-items: center;
            justify-content: center;
            z-index: 2000;
            backdrop-filter: blur(5px);
        }
        
        .modal.show {
            display: flex;
        }
        
        .modal-content {
            background: white;
            border-radius: 20px;
            padding: 30px;
            max-width: 500px;
            width: 90%;
            animation: modalSlideIn 0.3s ease;
        }
        
        @keyframes modalSlideIn {
            from {
                opacity: 0;
                transform: translateY(-50px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .modal-title {
            font-size: 1.5rem;
            margin-bottom: 20px;
            color: #2d3748;
        }
        
        .modal-body {
            margin-bottom: 20px;
        }
        
        .modal-actions {
            display: flex;
            gap: 15px;
            justify-content: flex-end;
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 20px;
            }
            
            .title {
                font-size: 2rem;
            }
            
            .button-group {
                flex-direction: column;
            }
            
            .btn {
                width: 100%;
            }
            
            .link-content {
                flex-direction: column;
            }
            
            .copy-btn {
                width: 100%;
                justify-content: center;
            }
            
            .toast {
                left: 20px;
                right: 20px;
                bottom: 20px;
                transform: translateY(100px);
            }
            
            .toast.show {
                transform: translateY(0);
            }
        }
    </style>
</head>
<body>
    <button onclick="logout()" class="logout-btn">
        <i class="fas fa-sign-out-alt"></i>
        <span>Logout</span>
    </button>
    
    <div class="container">
        <div class="header">
            <img src="https://img.icons8.com/color/96/cloudflare.png" alt="Cloudflare" class="logo">
            <h1 class="title">Dashboard</h1>
            <p class="subtitle">Manage your Cloudflare Workers service</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-server"></i>
                </div>
                <div class="stat-value">${cfip.length}</div>
                <div class="stat-label">Active Nodes</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-globe"></i>
                </div>
                <div class="stat-value">${new Date().toLocaleTimeString()}</div>
                <div class="stat-label">Server Time</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-shield-alt"></i>
                </div>
                <div class="stat-value">Active</div>
                <div class="stat-label">Status</div>
            </div>
        </div>
        
        <div class="uuid-section">
            <div class="section-title">
                <i class="fas fa-key"></i>
                <h2>UUID Configuration</h2>
            </div>
            
            <div class="uuid-display">
                <div class="uuid-label">Current UUID:</div>
                <div class="uuid-value" id="currentUUID">${currentUUID}</div>
                
                <div class="short-link">
                    <div class="short-link-label">
                        <i class="fas fa-link"></i> Short Link:
                    </div>
                    <div class="short-link-value" id="shortLink">${shortLink}</div>
                </div>
            </div>
            
            <div class="button-group">
                <button onclick="generateNewUUID()" class="btn btn-primary">
                    <i class="fas fa-sync-alt"></i> Generate New UUID
                </button>
                <button onclick="copyUUID()" class="btn btn-secondary">
                    <i class="fas fa-copy"></i> Copy UUID
                </button>
                <button onclick="copyShortLink()" class="btn btn-warning">
                    <i class="fas fa-link"></i> Copy Short Link
                </button>
            </div>
        </div>
        
        <div class="links-section">
            <div class="section-title">
                <i class="fas fa-link"></i>
                <h2>Subscription Links</h2>
            </div>
            
            <div class="link-item">
                <div class="link-header">
                    <i class="fas fa-bolt"></i>
                    <span>V2Ray / VLESS</span>
                </div>
                <div class="link-content">
                    <span class="link-url" id="v2rayLink">${baseUrl}/${subPath}</span>
                    <button onclick="copyToClipboard('${baseUrl}/${subPath}', 'V2Ray link copied!')" class="copy-btn">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                </div>
            </div>
            
            <div class="link-item">
                <div class="link-header">
                    <i class="fas fa-fire"></i>
                    <span>Clash</span>
                </div>
                <div class="link-content">
                    <span class="link-url" id="clashLink">https://sublink.eooce.com/clash?config=${baseUrl}/${subPath}</span>
                    <button onclick="copyToClipboard('https://sublink.eooce.com/clash?config=${baseUrl}/${subPath}', 'Clash link copied!')" class="copy-btn">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                </div>
            </div>
            
            <div class="link-item">
                <div class="link-header">
                    <i class="fas fa-cube"></i>
                    <span>Sing-box</span>
                </div>
                <div class="link-content">
                    <span class="link-url" id="singboxLink">https://sublink.eooce.com/singbox?config=${baseUrl}/${subPath}</span>
                    <button onclick="copyToClipboard('https://sublink.eooce.com/singbox?config=${baseUrl}/${subPath}', 'Sing-box link copied!')" class="copy-btn">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                </div>
            </div>
        </div>
        
        <div class="links-section">
            <div class="section-title">
                <i class="fas fa-clock"></i>
                <h2>Expiring Links (30-Day)</h2>
            </div>
            
            <div class="link-item">
                <div class="link-header">
                    <i class="fas fa-bolt"></i>
                    <span>V2Ray (30-day)</span>
                </div>
                <div class="link-content">
                    <span class="link-url" id="expiringV2ray">Click Generate to create 30-day link</span>
                    <button onclick="generateExpiringLink()" class="copy-btn btn-primary">
                        <i class="fas fa-clock"></i> Generate
                    </button>
                </div>
            </div>
        </div>
        
        <div class="footer" style="text-align: center; margin-top: 20px; color: #718096;">
            <p>Powered by <a href="https://t.me/eooceu" target="_blank" style="color: #667eea; text-decoration: none;">eooce</a> | Made with <i class="fas fa-heart" style="color: #ff6b6b;"></i> for the community</p>
        </div>
    </div>
    
    <div class="toast" id="toast">
        <div class="toast-icon">
            <i class="fas fa-check"></i>
        </div>
        <div class="toast-message" id="toastMessage">Copied to clipboard!</div>
    </div>
    
    <div class="modal" id="confirmModal">
        <div class="modal-content">
            <h3 class="modal-title">Generate New UUID</h3>
            <div class="modal-body">
                <p>Are you sure you want to generate a new UUID?</p>
                <p style="color: #e53e3e; font-size: 0.9rem; margin-top: 10px;">
                    <i class="fas fa-exclamation-triangle"></i>
                    Warning: This will change your current UUID. Make sure to update your client configuration!
                </p>
            </div>
            <div class="modal-actions">
                <button onclick="closeModal()" class="btn btn-secondary" style="background: #cbd5e0; color: #4a5568;">Cancel</button>
                <button onclick="confirmGenerateUUID()" class="btn btn-danger">Generate</button>
            </div>
        </div>
    </div>
    
    <script>
        function showToast(message) {
            const toast = document.getElementById('toast');
            const toastMessage = document.getElementById('toastMessage');
            toastMessage.textContent = message;
            toast.classList.add('show');
            
            setTimeout(() => {
                toast.classList.remove('show');
            }, 2000);
        }
        
        function copyToClipboard(text, message) {
            navigator.clipboard.writeText(text).then(() => {
                showToast(message);
            }).catch(() => {
                const textArea = document.createElement('textarea');
                textArea.value = text;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                showToast(message);
            });
        }
        
        function copyUUID() {
            const uuid = document.getElementById('currentUUID').textContent;
            copyToClipboard(uuid, 'UUID copied to clipboard!');
        }
        
        function copyShortLink() {
            const shortLink = document.getElementById('shortLink').textContent;
            copyToClipboard(shortLink, 'Short link copied!');
        }
        
        function generateNewUUID() {
            document.getElementById('confirmModal').classList.add('show');
        }
        
        function closeModal() {
            document.getElementById('confirmModal').classList.remove('show');
        }
        
        function confirmGenerateUUID() {
            closeModal();
            showToast('Generating new UUID...');
            
            // Redirect to generate new UUID
            const currentUrl = new URL(window.location);
            currentUrl.searchParams.set('generate', 'true');
            window.location.href = currentUrl.toString();
        }
        
        // FIXED: Generate expiring link by calling server endpoint
        async function generateExpiringLink() {
            try {
                const response = await fetch('/generate-30day-link?days=30');
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('expiringV2ray').textContent = data.link;
                    copyToClipboard(data.link, '✅ 30-day link generated and copied!');
                } else {
                    alert('Failed to generate link');
                }
            } catch (error) {
                alert('Error generating link: ' + error.message);
            }
        }
        
        function logout() {
            if (confirm('Are you sure you want to logout?')) {
                const currentUrl = new URL(window.location);
                currentUrl.searchParams.delete('password');
                window.location.href = currentUrl.toString();
            }
        }
    </script>
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: {
			'Content-Type': 'text/html;charset=utf-8',
			'Cache-Control': 'no-cache, no-store, must-revalidate',
		},
	});
}

/**
 * 
 * @param {import("@cloudflare/workers-types").Request} request
 */
async function handleVlsRequest(request, customProxyIP) {
    const wssPair = new WebSocketPair();
    const [clientSock, serverSock] = Object.values(wssPair);
    serverSock.accept();
    let remoteConnWrapper = { socket: null };
    let isDnsQuery = false;
    let isTrojan = false;
    const earlyData = request.headers.get('sec-websocket-protocol') || '';
    const readable = makeReadableStr(serverSock, earlyData);

    readable.pipeTo(new WritableStream({
        async write(chunk) {
            if (isDnsQuery) return await forwardataudp(chunk, serverSock, null);
            if (remoteConnWrapper.socket) {
                const writer = remoteConnWrapper.socket.writable.getWriter();
                await writer.write(chunk);
                writer.releaseLock();
                return;
            }
            
            if (!disabletro) {
                const trojanResult = await parsetroHeader(chunk, yourUUID);
                if (!trojanResult.hasError) {
                    isTrojan = true;
                    const { addressType, port, hostname, rawClientData } = trojanResult;
                    
                    if (isSpeedTestSite(hostname)) {
                        throw new Error('Speedtest site is blocked');
                    }
                    
                    await forwardataTCP(hostname, port, rawClientData, serverSock, null, remoteConnWrapper, customProxyIP);
                    return;
                }
            }
            
            const { hasError, message, addressType, port, hostname, rawIndex, version, isUDP } = parseVLsPacketHeader(chunk, yourUUID);
            if (hasError) throw new Error(message);

            if (isSpeedTestSite(hostname)) {
                throw new Error('Speedtest site is blocked');
            }

            if (isUDP) {
                if (port === 53) isDnsQuery = true;
                else throw new Error('UDP is not supported');
            }
            const respHeader = new Uint8Array([version[0], 0]);
            const rawData = chunk.slice(rawIndex);
            if (isDnsQuery) return forwardataudp(rawData, serverSock, respHeader);
            await forwardataTCP(hostname, port, rawData, serverSock, respHeader, remoteConnWrapper, customProxyIP);
        },
    })).catch((err) => {
        // console.error('Readable pipe error:', err);
    });

    return new Response(null, { status: 101, webSocket: clientSock });
}

async function parsetroHeader(buffer, passwordPlainText) {
  const sha224Password = await sha224(passwordPlainText);
  
  if (buffer.byteLength < 56) {
    return { hasError: true, message: "invalid data" };
  }
  let crLfIndex = 56;
  if (new Uint8Array(buffer.slice(56, 57))[0] !== 0x0d || new Uint8Array(buffer.slice(57, 58))[0] !== 0x0a) {
    return { hasError: true, message: "invalid header format" };
  }
  const password = new TextDecoder().decode(buffer.slice(0, crLfIndex));
  if (password !== sha224Password) {
    return { hasError: true, message: "invalid password" };
  }

  const socks5DataBuffer = buffer.slice(crLfIndex + 2);
  if (socks5DataBuffer.byteLength < 6) {
    return { hasError: true, message: "invalid S5 request data" };
  }

  const view = new DataView(socks5DataBuffer);
  const cmd = view.getUint8(0);
  if (cmd !== 1) {
    return { hasError: true, message: "unsupported command, only TCP is allowed" };
  }

  const atype = view.getUint8(1);
  let addressLength = 0;
  let addressIndex = 2;
  let address = "";
  switch (atype) {
    case 1: // IPv4
      addressLength = 4;
      address = new Uint8Array(socks5DataBuffer.slice(addressIndex, addressIndex + addressLength)).join(".");
      break;
    case 3: // Domain
      addressLength = new Uint8Array(socks5DataBuffer.slice(addressIndex, addressIndex + 1))[0];
      addressIndex += 1;
      address = new TextDecoder().decode(socks5DataBuffer.slice(addressIndex, addressIndex + addressLength));
      break;
    case 4: // IPv6
      addressLength = 16;
      const dataView = new DataView(socks5DataBuffer.slice(addressIndex, addressIndex + addressLength));
      const ipv6 = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(dataView.getUint16(i * 2).toString(16));
      }
      address = ipv6.join(":");
      break;
    default:
      return { hasError: true, message: `invalid addressType is ${atype}` };
  }

  if (!address) {
    return { hasError: true, message: `address is empty, addressType is ${atype}` };
  }

  const portIndex = addressIndex + addressLength;
  const portBuffer = socks5DataBuffer.slice(portIndex, portIndex + 2);
  const portRemote = new DataView(portBuffer).getUint16(0);

  return {
    hasError: false,
    addressType: atype,
    port: portRemote,
    hostname: address,
    rawClientData: socks5DataBuffer.slice(portIndex + 4)
  };
}

async function connect2Socks5(proxyConfig, targetHost, targetPort, initialData) {
    const { host, port, username, password } = proxyConfig;
    const socket = connect({ hostname: host, port: port });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    
    try {
        const authMethods = username && password ? 
            new Uint8Array([0x05, 0x02, 0x00, 0x02]) :
            new Uint8Array([0x05, 0x01, 0x00]); 
        
        await writer.write(authMethods);
        const methodResponse = await reader.read();
        if (methodResponse.done || methodResponse.value.byteLength < 2) {
            throw new Error('S5 method selection failed');
        }
        
        const selectedMethod = new Uint8Array(methodResponse.value)[1];
        if (selectedMethod === 0x02) {
            if (!username || !password) {
                throw new Error('S5 requires authentication');
            }
            const userBytes = new TextEncoder().encode(username);
            const passBytes = new TextEncoder().encode(password);
            const authPacket = new Uint8Array(3 + userBytes.length + passBytes.length);
            authPacket[0] = 0x01; 
            authPacket[1] = userBytes.length;
            authPacket.set(userBytes, 2);
            authPacket[2 + userBytes.length] = passBytes.length;
            authPacket.set(passBytes, 3 + userBytes.length);
            await writer.write(authPacket);
            const authResponse = await reader.read();
            if (authResponse.done || new Uint8Array(authResponse.value)[1] !== 0x00) {
                throw new Error('S5 authentication failed');
            }
        } else if (selectedMethod !== 0x00) {
            throw new Error(`S5 unsupported auth method: ${selectedMethod}`);
        }
        
        const hostBytes = new TextEncoder().encode(targetHost);
        const connectPacket = new Uint8Array(7 + hostBytes.length);
        connectPacket[0] = 0x05;
        connectPacket[1] = 0x01;
        connectPacket[2] = 0x00; 
        connectPacket[3] = 0x03; 
        connectPacket[4] = hostBytes.length;
        connectPacket.set(hostBytes, 5);
        new DataView(connectPacket.buffer).setUint16(5 + hostBytes.length, targetPort, false);
        await writer.write(connectPacket);
        const connectResponse = await reader.read();
        if (connectResponse.done || new Uint8Array(connectResponse.value)[1] !== 0x00) {
            throw new Error('S5 connection failed');
        }
        
        await writer.write(initialData);
        writer.releaseLock();
        reader.releaseLock();
        return socket;
    } catch (error) {
        writer.releaseLock();
        reader.releaseLock();
        throw error;
    }
}

async function connect2Http(proxyConfig, targetHost, targetPort, initialData) {
    const { host, port, username, password } = proxyConfig;
    const socket = connect({ hostname: host, port: port });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    try {
        let connectRequest = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n`;
        connectRequest += `Host: ${targetHost}:${targetPort}\r\n`;
        
        if (username && password) {
            const auth = btoa(`${username}:${password}`);
            connectRequest += `Proxy-Authorization: Basic ${auth}\r\n`;
        }
        
        connectRequest += `User-Agent: Mozilla/5.0\r\n`;
        connectRequest += `Connection: keep-alive\r\n`;
        connectRequest += '\r\n';
        await writer.write(new TextEncoder().encode(connectRequest));
        let responseBuffer = new Uint8Array(0);
        let headerEndIndex = -1;
        let bytesRead = 0;
        const maxHeaderSize = 8192;
        
        while (headerEndIndex === -1 && bytesRead < maxHeaderSize) {
            const { done, value } = await reader.read();
            if (done) {
                throw new Error('Connection closed before receiving HTTP response');
            }
            const newBuffer = new Uint8Array(responseBuffer.length + value.length);
            newBuffer.set(responseBuffer);
            newBuffer.set(value, responseBuffer.length);
            responseBuffer = newBuffer;
            bytesRead = responseBuffer.length;
            
            for (let i = 0; i < responseBuffer.length - 3; i++) {
                if (responseBuffer[i] === 0x0d && responseBuffer[i + 1] === 0x0a &&
                    responseBuffer[i + 2] === 0x0d && responseBuffer[i + 3] === 0x0a) {
                    headerEndIndex = i + 4;
                    break;
                }
            }
        }
        
        if (headerEndIndex === -1) {
            throw new Error('Invalid HTTP response');
        }
        
        const headerText = new TextDecoder().decode(responseBuffer.slice(0, headerEndIndex));
        const statusLine = headerText.split('\r\n')[0];
        const statusMatch = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/);
        
        if (!statusMatch) {
            throw new Error(`Invalid response: ${statusLine}`);
        }
        
        const statusCode = parseInt(statusMatch[1]);
        if (statusCode < 200 || statusCode >= 300) {
            throw new Error(`Connection failed: ${statusLine}`);
        }
        
        console.log('HTTP connection established for Trojan');
        
        await writer.write(initialData);
        writer.releaseLock();
        reader.releaseLock();
        
        return socket;
    } catch (error) {
        try { 
            writer.releaseLock(); 
        } catch (e) {}
        try { 
            reader.releaseLock(); 
        } catch (e) {}
        try { 
            socket.close(); 
        } catch (e) {}
        throw error;
    }
}

async function forwardataTCP(host, portNum, rawData, ws, respHeader, remoteConnWrapper, customProxyIP) {
    async function connectDirect(address, port, data) {
        const remoteSock = connect({ hostname: address, port: port });
        const writer = remoteSock.writable.getWriter();
        await writer.write(data);
        writer.releaseLock();
        return remoteSock;
    }
    
    let proxyConfig = null;
    let shouldUseProxy = false;
    if (customProxyIP) {
        proxyConfig = parsePryAddress(customProxyIP);
        if (proxyConfig && (proxyConfig.type === 'socks5' || proxyConfig.type === 'http' || proxyConfig.type === 'https')) {
            shouldUseProxy = true;
        } else if (!proxyConfig) {
            proxyConfig = parsePryAddress(proxyIP) || { type: 'direct', host: proxyIP, port: 443 };
        }
    } else {
        proxyConfig = parsePryAddress(proxyIP) || { type: 'direct', host: proxyIP, port: 443 };
        if (proxyConfig.type === 'socks5' || proxyConfig.type === 'http' || proxyConfig.type === 'https') {
            shouldUseProxy = true;
        }
    }
    
    async function connecttoPry() {
        let newSocket;
        if (proxyConfig.type === 'socks5') {
            newSocket = await connect2Socks5(proxyConfig, host, portNum, rawData);
        } else if (proxyConfig.type === 'http' || proxyConfig.type === 'https') {
            newSocket = await connect2Http(proxyConfig, host, portNum, rawData);
        } else {
            newSocket = await connectDirect(proxyConfig.host, proxyConfig.port, rawData);
        }
        
        remoteConnWrapper.socket = newSocket;
        newSocket.closed.catch(() => {}).finally(() => closeSocketQuietly(ws));
        connectStreams(newSocket, ws, respHeader, null);
    }
    
    if (shouldUseProxy) {
        try {
            await connecttoPry();
        } catch (err) {
            throw err;
        }
    } else {
        try {
            const initialSocket = await connectDirect(host, portNum, rawData);
            remoteConnWrapper.socket = initialSocket;
            connectStreams(initialSocket, ws, respHeader, connecttoPry);
        } catch (err) {
            await connecttoPry();
        }
    }
}

function parseVLsPacketHeader(chunk, token) {
    if (chunk.byteLength < 24) return { hasError: true, message: 'Invalid data' };
    const version = new Uint8Array(chunk.slice(0, 1));
    if (formatIdentifier(new Uint8Array(chunk.slice(1, 17))) !== token) return { hasError: true, message: 'Invalid uuid' };
    const optLen = new Uint8Array(chunk.slice(17, 18))[0];
    const cmd = new Uint8Array(chunk.slice(18 + optLen, 19 + optLen))[0];
    let isUDP = false;
    if (cmd === 1) {} else if (cmd === 2) { isUDP = true; } else { return { hasError: true, message: 'Invalid command' }; }
    const portIdx = 19 + optLen;
    const port = new DataView(chunk.slice(portIdx, portIdx + 2)).getUint16(0);
    let addrIdx = portIdx + 2, addrLen = 0, addrValIdx = addrIdx + 1, hostname = '';
    const addressType = new Uint8Array(chunk.slice(addrIdx, addrValIdx))[0];
    switch (addressType) {
        case 1: 
            addrLen = 4; 
            hostname = new Uint8Array(chunk.slice(addrValIdx, addrValIdx + addrLen)).join('.'); 
            break;
        case 2: 
            addrLen = new Uint8Array(chunk.slice(addrValIdx, addrValIdx + 1))[0]; 
            addrValIdx += 1; 
            hostname = new TextDecoder().decode(chunk.slice(addrValIdx, addrValIdx + addrLen)); 
            break;
        case 3: 
            addrLen = 16; 
            const ipv6 = []; 
            const ipv6View = new DataView(chunk.slice(addrValIdx, addrValIdx + addrLen)); 
            for (let i = 0; i < 8; i++) ipv6.push(ipv6View.getUint16(i * 2).toString(16)); 
            hostname = ipv6.join(':'); 
            break;
        default: 
            return { hasError: true, message: `Invalid address type: ${addressType}` };
    }
    if (!hostname) return { hasError: true, message: `Invalid address: ${addressType}` };
    return { hasError: false, addressType, port, hostname, isUDP, rawIndex: addrValIdx + addrLen, version };
}

function makeReadableStr(socket, earlyDataHeader) {
    let cancelled = false;
    return new ReadableStream({
        start(controller) {
            socket.addEventListener('message', (event) => { 
                if (!cancelled) controller.enqueue(event.data); 
            });
            socket.addEventListener('close', () => { 
                if (!cancelled) { 
                    closeSocketQuietly(socket); 
                    controller.close(); 
                } 
            });
            socket.addEventListener('error', (err) => controller.error(err));
            const { earlyData, error } = base64ToArray(earlyDataHeader);
            if (error) controller.error(error); 
            else if (earlyData) controller.enqueue(earlyData);
        },
        cancel() { 
            cancelled = true; 
            closeSocketQuietly(socket); 
        }
    });
}

async function connectStreams(remoteSocket, webSocket, headerData, retryFunc) {
    let header = headerData, hasData = false;
    await remoteSocket.readable.pipeTo(
        new WritableStream({
            async write(chunk, controller) {
                hasData = true;
                if (webSocket.readyState !== WebSocket.OPEN) controller.error('ws.readyState is not open');
                if (header) { 
                    const response = new Uint8Array(header.length + chunk.byteLength);
                    response.set(header, 0);
                    response.set(chunk, header.length);
                    webSocket.send(response.buffer); 
                    header = null; 
                } else { 
                    webSocket.send(chunk); 
                }
            },
            abort() {},
        })
    ).catch((err) => { 
        closeSocketQuietly(webSocket); 
    });
    if (!hasData && retryFunc) {
        await retryFunc();
    }
}

async function forwardataudp(udpChunk, webSocket, respHeader) {
    try {
        const tcpSocket = connect({ hostname: '8.8.4.4', port: 53 });
        let vlessHeader = respHeader;
        const writer = tcpSocket.writable.getWriter();
        await writer.write(udpChunk);
        writer.releaseLock();
        await tcpSocket.readable.pipeTo(new WritableStream({
            async write(chunk) {
                if (webSocket.readyState === WebSocket.OPEN) {
                    if (vlessHeader) { 
                        const response = new Uint8Array(vlessHeader.length + chunk.byteLength);
                        response.set(vlessHeader, 0);
                        response.set(chunk, vlessHeader.length);
                        webSocket.send(response.buffer);
                        vlessHeader = null; 
                    } else { 
                        webSocket.send(chunk); 
                    }
                }
            },
        }));
    } catch (error) {
        // console.error('UDP forward error:', error);
    }
}
