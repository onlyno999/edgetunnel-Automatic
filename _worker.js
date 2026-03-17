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

// Helper functions (keep all your existing helper functions here)
// [All your helper functions: closeSocketQuietly, formatIdentifier, base64ToArray, parsePryAddress, isSpeedTestSite, sha224, rightRotate]

// For brevity, I'm not repeating all helper functions here, but you MUST keep them all
// They are the same as in your original code

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
            
            // ===== ONLY 30-DAY LINK GENERATOR - NO UUID GENERATOR =====
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
                
                // Return ONLY the link - nothing else
                return new Response(link, {
                    headers: { 'Content-Type': 'text/plain' }
                });
            }
            
            // ===== SIMPLE HOME PAGE - NO UUID GENERATOR =====
            if (pathname === '/') {
                return new Response(`<!DOCTYPE html>
<html>
<head>
    <title>30-Day Link Generator</title>
    <style>
        body { font-family: Arial; max-width: 500px; margin: 50px auto; padding: 20px; }
        input, select, button { width: 100%; padding: 10px; margin: 10px 0; }
        .link { background: #f0f0f0; padding: 15px; word-break: break-all; display: none; }
        .permanent { background: #e3f2fd; padding: 10px; margin: 20px 0; }
    </style>
</head>
<body>
    <h2>30-Day Link Generator</h2>
    
    <div class="permanent">
        <strong>Permanent Link:</strong><br>
        <a href="https://${url.hostname}/${subPath}">https://${url.hostname}/${subPath}</a>
    </div>
    
    <input type="password" id="password" placeholder="Enter password">
    
    <select id="days">
        <option value="1">1 day (test)</option>
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
                alert('Please enter password');
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
            
            // ===== PROXY HANDLING =====
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
            } 
            
            // ===== SUBSCRIPTION ENDPOINT WITH EXPIRATION CHECK =====
            else if (request.method === 'GET') {
                if (url.pathname.toLowerCase().includes(`/${subPath.toLowerCase()}`)) {
                    
                    // Check for token expiration
                    const token = url.searchParams.get('token');
                    if (token && token.includes('_exp_')) {
                        try {
                            const [originalToken, expireTime] = token.split('_exp_');
                            if (Date.now() > parseInt(expireTime)) {
                                return new Response('Link expired', { status: 403 });
                            }
                            
                            const expectedHash = await sha224(yourUUID + expireTime);
                            if (originalToken !== expectedHash.substring(0, 16)) {
                                return new Response('Invalid token', { status: 403 });
                            }
                        } catch (e) {}
                    }
                    
                    // Generate VLESS and Trojan nodes
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
                        headers: { 'Content-Type': 'text/plain' }
                    });
                }
            }
            
            return new Response('Not Found', { status: 404 });
        } catch (err) {
            return new Response('Error: ' + err.message, { status: 500 });
        }
    },
};

// ALL your helper functions go here - keep them exactly as in your original code
// handleVlsRequest, parsetroHeader, connect2Socks5, connect2Http, forwardataTCP, 
// parseVLsPacketHeader, makeReadableStr, connectStreams, forwardataudp
