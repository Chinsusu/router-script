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
