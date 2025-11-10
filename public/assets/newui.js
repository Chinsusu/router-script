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
