// Minimal JS for the clean 3-tab GUI
console.info('[NewUI] Loaded. Bootstrap.Tab =', !!(window.bootstrap && bootstrap.Tab));

// Explicitly initialize tabs (anchors) to be safe
document.querySelectorAll('a[data-bs-toggle="tab"]').forEach((el)=>{
  try { window.bootstrap && bootstrap.Tab && bootstrap.Tab.getOrCreateInstance(el); } catch {}
  el.addEventListener('shown.bs.tab', (e)=>{
    console.info('[NewUI] Tab shown:', e.target?.id, '->', e.target?.getAttribute('href'));
  });
});

// ==== Clone PPPoE helpers and bindings ====
(function(){
  const $ = (s)=>document.querySelector(s);
  const baseTA = $('#ppp-base');
  const countEl = $('#ppp-count');
  const genBtn = $('#ppp-gen');
  const outTA = $('#ppp-output');
  const dlBtn = $('#ppp-dl');
  const cpBtn = $('#ppp-copy');
  if (!baseTA) return; // tab not rendered yet

  function firstPppBlockFromAny(xmlOrPpp){
    const solo = xmlOrPpp.match(/^\s*<ppp>[\s\S]*<\/ppp>\s*$/i);
    if (solo) return solo[0];
    const m = xmlOrPpp.match(/<ppp>[\s\S]*?<\/ppp>/i);
    return m ? m[0] : '';
  }
  function parseIfPorts(str){
    const m = (str||'').trim().match(/^([a-zA-Z]+)(\d+)$/);
    return m ? { prefix: m[1], start: parseInt(m[2],10) } : { prefix:'pppoe', start:1 };
  }
  function buildPPPClones(basePppOrPpps, total){
    const ppp = firstPppBlockFromAny(basePppOrPpps);
    if (!ppp) throw new Error('Không tìm thấy block <ppp> mẫu.');
    const get = (tag) => {
      const rx = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\/${tag}>`,'i');
      const m = ppp.match(rx); return m ? m[1].trim() : '';
    };
    const user = get('username'); const pass = get('password');
    const ifStr = get('if') || 'pppoe1'; const portsStr = get('ports') || 'vtnet1';
    const ifp = parseIfPorts(ifStr), portp = parseIfPorts(portsStr);
    const N = Math.max(1, Number(total)||1);
    let body = '';
    for (let i=1;i<=N;i++){
      const ifName = `${ifp.prefix}${ifp.start + (i-1)}`;
      const portName = `${portp.prefix}${portp.start + (i-1)}`;
      body += `\n    <ppp>\n      <ptpid>${i}</ptpid>\n      <type>pppoe</type>\n      <if>${ifName}</if>\n      <ports>${portName}</ports>\n      <username><![CDATA[${user}]]></username>\n      <password><![CDATA[${pass}]]></password>\n      <provider></provider>\n      <bandwidth></bandwidth>\n      <mtu></mtu>\n      <mru></mru>\n      <mrru></mrru>\n    </ppp>`;
    }
    return `<ppps>${body}\n</ppps>`;
  }

  function generate(){
    const base = (baseTA.value||'').trim();
    if (!base) { alert('Dán block <ppp> hoặc <ppps> trước đã.'); return; }
    const n = Number(countEl.value||0);
    if (!n || n<1) { alert('Số lượng cần clone phải >= 1.'); return; }
    try {
      outTA.value = buildPPPClones(base, n);
    } catch(e){
      alert(String(e.message||e));
    }
  }
  function download(){
    const xml = (outTA.value||'').trim(); if (!xml) return;
    const blob = new Blob([xml], { type:'application/xml' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'ppps.xml'; a.click(); URL.revokeObjectURL(a.href);
  }
  async function copy(){
    const xml = (outTA.value||'').trim(); if (!xml) return;
    try { await navigator.clipboard.writeText(xml); } catch {}
  }

  genBtn?.addEventListener('click', generate);
  dlBtn?.addEventListener('click', download);
  cpBtn?.addEventListener('click', copy);
})();

// ==== Clone Rules helpers and bindings ====
(function(){
  const $ = (s)=>document.querySelector(s);
  const baseTA = $('#rule-base');
  const countEl = $('#rule-count');
  const genBtn = $('#rule-gen');
  const outTA = $('#rule-output');
  const dlBtn = $('#rule-dl');
  const cpBtn = $('#rule-copy');
  if (!baseTA) return;

  const hasFilterWrapper = (s)=> /<filter>/i.test(s) && /<\/filter>/i.test(s);
  const firstRuleBlockFromAny = (s)=>{ const m=s.match(/<rule>[\s\S]*?<\/rule>/i); return m?m[0]:''; };
  const tagTextFrom = (sec, tag)=>{ if(!sec) return ''; const re=new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\/${tag}>`,'i'); const m=sec.match(re); return m?m[1].trim():''; };
  const insertAfterOpen = (xml, tag, content)=>{ const re=new RegExp(`<${tag}[^>]*>`,'i'); const m=xml.match(re); if(!m) throw new Error(`Missing <${tag}>`); const at=m.index+m[0].length; return xml.slice(0,at)+'\n'+content+xml.slice(at); };
  const ipToNum = (ip)=>{ const p=ip.trim().split('.').map(x=>parseInt(x,10)); if(p.length!==4||p.some(n=>Number.isNaN(n)||n<0||n>255)) throw new Error('Invalid IP: '+ip); return ((p[0]<<24)>>>0)+(p[1]<<16)+(p[2]<<8)+p[3]; };
  const numToIp = (n)=> [ (n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255 ].join('.');
  const getSourceAddressFromRule = (rule)=>{ const m=rule.match(/<source>[\s\S]*?<address>([\s\S]*?)<\/address>[\s\S]*?<\/source>/i); return m?m[1].trim():''; };
  const replaceSourceAddressBlock = (rule, newIp)=>{
    if (/<source>/i.test(rule)){
      if (/<source>[\s\S]*?<address>[\s\S]*?<\/address>[\s\S]*?<\/source>/i.test(rule)){
        return rule.replace(/<source>[\s\S]*?<address>[\s\S]*?<\/address>[\s\S]*?<\/source>/i, `<source>\n        <address>${newIp}</address>\n      </source>`);
      }
      return rule.replace(/<source>[\s\S]*?<\/source>/i, `<source>\n        <address>${newIp}</address>\n      </source>`);
    }
    const after = rule.match(/<\/ipprotocol>/i); if(after){ const at=after.index+after[0].length; return rule.slice(0,at)+`\n      <source><address>${newIp}</address></source>`+rule.slice(at);} return rule;
  };
  const parseGatewayParts = (gw)=>{ const m=(gw||'').trim().match(/^(.*?)(\d+)(.*)$/); return m?{prefix:m[1],num:parseInt(m[2],10),suffix:m[3]}:{prefix:gw||'WAN',num:1,suffix:''}; };
  const replaceGateway = (rule, gw)=> /<gateway>[\s\S]*?<\/gateway>/i.test(rule) ? rule.replace(/<gateway>[\s\S]*?<\/gateway>/i, `<gateway>${gw}</gateway>`) : rule.replace(/<\/rule>/i, `  <gateway>${gw}</gateway>\n    </rule>`);
  const stripCreatedUpdated = (rule)=> rule.replace(/<created>[\s\S]*?<\/created>/ig,'').replace(/<updated>[\s\S]*?<\/updated>/ig,'');

  function buildRuleClones(baseInput, total){
    const desired=Math.max(1,Number(total)||1);
    const baseRule=firstRuleBlockFromAny(baseInput); if(!baseRule) throw new Error('Không tìm thấy rule mẫu.');
    const startIp=getSourceAddressFromRule(baseRule); if(!startIp) throw new Error('Rule mẫu thiếu <source><address>...');
    const startGw=tagTextFrom(baseRule,'gateway')||'WAN1_PPPOE';
    const gwParts=parseGatewayParts(startGw); const baseIpNum=ipToNum(startIp);
    const isFilter=hasFilterWrapper(baseInput); const beginIndex=isFilter?2:1;
    let rules='';
    for(let i=beginIndex;i<=desired;i++){
      const ip=numToIp(baseIpNum+(i-1)); const gw=`${gwParts.prefix}${gwParts.num+(i-1)}${gwParts.suffix}`; let r=stripCreatedUpdated(baseRule); r=replaceSourceAddressBlock(r,ip); r=replaceGateway(r,gw); rules+=`\n    ${r.trim()}\n`;
    }
    return isFilter ? insertAfterOpen(baseInput,'filter',rules.trimStart()) : `<filter>\n    ${stripCreatedUpdated(baseRule).trim()}\n${rules}  </filter>`;
  }

  function generate(){ const base=(baseTA.value||'').trim(); if(!base){ alert('Dán 1 <rule> hoặc <filter> chứa rule mẫu.'); return;} const n=Number(countEl.value||0); if(!n||n<1){ alert('Total rules to reach phải >= 1.'); return;} try{ outTA.value=buildRuleClones(base,n);}catch(e){ alert(String(e.message||e)); } }
  function download(){ const xml=(outTA.value||'').trim(); if(!xml) return; const blob=new Blob([xml],{type:'application/xml'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='rules.xml'; a.click(); URL.revokeObjectURL(a.href); }
  async function copy(){ const xml=(outTA.value||'').trim(); if(!xml) return; try{ await navigator.clipboard.writeText(xml);}catch{} }

  genBtn?.addEventListener('click', generate);
  dlBtn?.addEventListener('click', download);
  cpBtn?.addEventListener('click', copy);
})();

// ==== Clone WAN helpers and bindings ====
(function(){
  const $ = (s)=>document.querySelector(s);
  const baseTA = $('#wan-base');
  const countEl = $('#wan-count');
  const genBtn = $('#wan-gen');
  const outTA = $('#wan-output');
  const dlBtn = $('#wan-dl');
  const cpBtn = $('#wan-copy');
  if (!baseTA) return;

  const hasInterfacesWrapper = (s)=> /<interfaces>/i.test(s) && /<\/interfaces>/i.test(s);
  const firstWanBlockFromAny = (s)=>{
    const solo = s.match(/^\s*<wan>[\s\S]*?<\/wan>\s*$/i);
    if (solo) return solo[0];
    const m = s.match(/<wan>[\s\S]*?<\/wan>/i); return m ? m[0] : '';
  };
  const tagTextFrom = (sec, tag)=>{
    if (!sec) return '';
    const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\/${tag}>`,'i');
    const m = sec.match(re); return m ? m[1].trim() : '';
  };
  const parseIfSuffix = (str)=>{
    const m = (str||'').trim().match(/^([a-zA-Z]+)(\d+)$/); return m ? {prefix:m[1], start:parseInt(m[2],10)} : {prefix:'pppoe', start:1};
  };
  const maxOptIndex = (xml)=>{ const it=[...xml.matchAll(/<opt(\d+)>/g)].map(m=>parseInt(m[1],10)); return it.length?Math.max(...it):0; };
  const insertBeforeClose = (xml, tag, content)=>{ const idx = xml.lastIndexOf(`</${tag}>`); if(idx<0) throw new Error(`Missing </${tag}>`); return xml.slice(0,idx)+content+xml.slice(idx); };

  function buildWANClones(baseInput, total){
    const wanBlock = firstWanBlockFromAny(baseInput);
    if (!wanBlock) throw new Error('Không tìm thấy block <wan> mẫu.');
    const ifStr = tagTextFrom(wanBlock,'if') || 'pppoe1';
    const ipaddrVal = tagTextFrom(wanBlock,'ipaddr') || 'pppoe';
    const ifp = parseIfSuffix(ifStr);
    const desiredTotal = Math.max(1, Number(total)||1);

    const withInterfaces = hasInterfacesWrapper(baseInput);
    const existingOptCount = withInterfaces ? (baseInput.match(/<opt\d+>/gi)||[]).length : 0;
    const existingTotal = 1 + existingOptCount;
    if (desiredTotal <= existingTotal) return withInterfaces ? baseInput : '';

    const startOpt = withInterfaces ? (maxOptIndex(baseInput) + 1) : 1;
    let clones = '';
    for (let i = existingTotal + 1; i <= desiredTotal; i++){
      const wanNum = i; const optIdx = startOpt + (i - (existingTotal + 1));
      const ifName = `${ifp.prefix}${wanNum}`;
      clones += `\n    <opt${optIdx}>\n      <enable></enable>\n      <if>${ifName}</if>\n      <blockpriv></blockpriv>\n      <blockbogons></blockbogons>\n      <descr><![CDATA[WAN${wanNum}]]></descr>\n      <spoofmac></spoofmac>\n      <ipaddr>${ipaddrVal}</ipaddr>\n    </opt${optIdx}>`;
    }

    return withInterfaces ? insertBeforeClose(baseInput,'interfaces',clones) : clones.trimStart();
  }

  function generate(){
    const base = (baseTA.value||'').trim(); if (!base) { alert('Dán <wan> hoặc <interfaces> chứa <wan>.'); return; }
    const n = Number(countEl.value||0); if (!n||n<1) { alert('Total WAN to reach phải >= 1.'); return; }
    try { outTA.value = buildWANClones(base, n); } catch(e){ alert(String(e.message||e)); }
  }
  function download(){ const xml=(outTA.value||'').trim(); if(!xml) return; const blob=new Blob([xml],{type:'application/xml'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='wan-clones.xml'; a.click(); URL.revokeObjectURL(a.href); }
  async function copy(){ const xml=(outTA.value||'').trim(); if(!xml) return; try{ await navigator.clipboard.writeText(xml);}catch{} }

  genBtn?.addEventListener('click', generate);
  dlBtn?.addEventListener('click', download);
  cpBtn?.addEventListener('click', copy);
})();
