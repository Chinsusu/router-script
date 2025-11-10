// VM Config Editor logic (no frameworks).

const qs = (sel, el = document) => el.querySelector(sel);
const qsa = (sel, el = document) => [...el.querySelectorAll(sel)];

const DEFAULT_MAC_PREFIX = 'D8:FC:93';

function randByte() {
  return Math.floor(Math.random() * 256);
}
function byteToHex(b) {
  return b.toString(16).toUpperCase().padStart(2, '0');
}
function genMac(prefix = DEFAULT_MAC_PREFIX) {
  const parts = prefix.split(':').map(s => s.trim()).filter(Boolean);
  const need = 6 - parts.length;
  for (let i = 0; i < need; i++) parts.push(byteToHex(randByte()));
  return parts.slice(0, 6).join(':');
}
function isValidMac(mac) {
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(mac);
}
function uniqueMacs(arr) {
  // dedupe helper
  const seen = new Set();
  return arr.every(m => {
    const mU = m.toUpperCase();
    if (seen.has(mU)) return false;
    seen.add(mU);
    return true;
  });
}
function deepClone(v){
  return JSON.parse(JSON.stringify(v));
}
// ---- pfSense helpers ----
function ipToNum(ip){
  const p = ip.trim().split('.').map(x=>parseInt(x,10));
  if (p.length!==4 || p.some(n=>Number.isNaN(n)||n<0||n>255)) throw new Error('Invalid IP: '+ip);
  return ((p[0]<<24)>>>0) + (p[1]<<16) + (p[2]<<8) + p[3];
}
function numToIp(n){
  return [ (n>>>24)&255, (n>>>16)&255, (n>>>8)&255, n&255 ].join('.');
}
function tagText(xml, tag){
  const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\/${tag}>`,'i');
  const m = xml.match(re); return m ? m[1].trim() : '';
}
function insertBeforeClose(xml, tag, content){
  const idx = xml.lastIndexOf(`</${tag}>`); if (idx<0) throw new Error(`Missing </${tag}>`);
  return xml.slice(0, idx) + content + xml.slice(idx);
}
function insertAfterOpen(xml, tag, content){
  const re = new RegExp(`<${tag}[^>]*>`,'i'); const m = xml.match(re); if (!m) throw new Error(`Missing <${tag}>`);
  const at = m.index + m[0].length; return xml.slice(0, at) + '\n' + content + xml.slice(at);
}

function parseConfig(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const state = { name: '', vmgenid: '', scsi0: '', nets: [], other: [] };
  for (const line of lines) {
    const mKey = line.match(/^(\w[\w\d]+)\s*:\s*(.*)$/);
    if (!mKey) { state.other.push(line); continue; }
    const key = mKey[1], val = mKey[2];
    if (key === 'name') { state.name = val.trim(); continue; }
    if (key === 'vmgenid') { state.vmgenid = val.trim(); continue; }
    if (key === 'scsi0') { state.scsi0 = val.trim(); continue; }
    if (/^net\d+$/.test(key)) {
      const idx = Number(key.replace('net',''));
      const mm = val.match(/^(\w+)=([0-9A-Fa-f:]{17})(?:,.*?bridge=([^,\s]+))?(?:,.*?tag=(\d+))?/);
      let model='virtio', mac='', bridge='', tag='';
      if (mm) { model=mm[1]||'virtio'; mac=(mm[2]||'').toUpperCase(); bridge=mm[3]||''; tag=mm[4]||''; }
      state.nets.push({ index: idx, model, mac, bridge, tag });
      continue;
    }
    state.other.push(line);
  }
  state.nets.sort((a,b)=>a.index-b.index);
  return state;
}

function serializeConfig(state, originalText) {
  const lines = originalText.split(/\r?\n/).map(l=>l.trim());
  const unmanaged = [];
  for (const line of lines) {
    if (!line) continue;
    if (/^(name|vmgenid|scsi0)\s*:/.test(line)) continue;
    if (/^net\d+\s*:/.test(line)) continue;
    unmanaged.push(line);
  }
  const out = [...unmanaged];
  if (state.name) out.push(`name: ${state.name}`);
  if (state.vmgenid) out.push(`vmgenid: ${state.vmgenid}`);
  if (state.scsi0) out.push(`scsi0: ${state.scsi0}`);
  for (let i=0;i<state.nets.length;i++) {
    const n = state.nets[i];
    if (!n.mac) continue;
    const parts = [`${n.model||'virtio'}=${n.mac}`];
    if (n.bridge) parts.push(`bridge=${n.bridge}`);
    if (n.tag) parts.push(`tag=${n.tag}`);
    out.push(`net${i}: ${parts.join(',')}`);
  }
  return out.join('\n') + '\n';
}

// Build pfSense XML from a base
function buildPfSenseXML(baseXml, addCount, startIp){
  const user = tagText(baseXml, 'username');
  const pass = tagText(baseXml, 'password');
  if (!user) throw new Error('Cannot find PPPoE username in <ppps>');
  const portsVal = tagText(baseXml, 'ports') || 'vtnet1';
  const pm = portsVal.match(/^([a-zA-Z]+)(\d+)$/) || ['', 'vtnet', '1'];
  const portPrefix = pm[1] || 'vtnet';
  const portStart = parseInt(pm[2]||'1',10);

  const total = 1 + Math.max(0, Number(addCount)||0);
  const baseIpNum = ipToNum(startIp.trim());

  let ifBlocks = '';
  for (let i=2;i<=total;i++){
    ifBlocks += `
    <wan${i}>
      <enable></enable>
      <if>pppoe${i}</if>
      <blockpriv></blockpriv>
      <blockbogons></blockbogons>
      <descr><![CDATA[WAN${i}]]></descr>
      <spoofmac></spoofmac>
      <ipaddr>pppoe</ipaddr>
    </wan${i}>`;
  }

  let pppBlocks = '';
  for (let i=2;i<=total;i++){
    pppBlocks += `
    <ppp>
      <ptpid>${i}</ptpid>
      <type>pppoe</type>
      <if>pppoe${i}</if>
      <ports>${portPrefix}${portStart + (i-1)}</ports>
      <username><![CDATA[${user}]]></username>
      <password><![CDATA[${pass}]]></password>
      <provider></provider>
      <bandwidth></bandwidth>
      <mtu></mtu>
      <mru></mru>
      <mrru></mrru>
    </ppp>`;
  }

  let gwBlocks = '';
  for (let i=2;i<=total;i++){
    gwBlocks += `
    <gateway_item>
      <interface>wan${i}</interface>
      <gateway>dynamic</gateway>
      <name>WAN${i}_PPPOE</name>
      <weight>1</weight>
      <ipprotocol>inet</ipprotocol>
      <descr><![CDATA[Interface WAN${i}_PPPOE Gateway]]></descr>
      <gw_down_kill_states></gw_down_kill_states>
      <monitor>1.1.1.1</monitor>
    </gateway_item>`;
  }

  let ruleBlocks = '';
  for (let i=1;i<=total;i++){
    const ip = numToIp(baseIpNum + (i-1));
    ruleBlocks += `
    <rule>
      <type>pass</type>
      <interface>lan</interface>
      <ipprotocol>inet</ipprotocol>
      <source><address>${ip}</address></source>
      <destination><any></any></destination>
      <descr></descr>
      <gateway>WAN${i}_PPPOE</gateway>
    </rule>`;
  }

  let out = baseXml;
  out = insertBeforeClose(out, 'interfaces', ifBlocks);
  out = insertBeforeClose(out, 'ppps', pppBlocks);
  out = insertBeforeClose(out, 'gateways', gwBlocks);
  out = insertAfterOpen(out, 'filter', ruleBlocks);
  return out;
}

// UI State (baseline giữ config gốc từ lần import đầu)
const ui = {
  vmid: qs('#vmid'),
  name: qs('#name'),
  vmgenid: qs('#vmgenid'),
  scsi0: qs('#scsi0'),
  netCount: qs('#net-count'),
  netList: qs('#net-list'),
  output: qs('#output'),
  status: qs('#status'),
  import: qs('#btn-import'),
  importApply: qs('#import-apply'),
  generate: qs('#btn-generate'),
  download: qs('#btn-download'),
  copy: qs('#btn-copy'),
  reset: qs('#btn-reset'),
  addNet: qs('#btn-add-net'),
  randAll: qs('#btn-rand-all'),
  importText: qs('#import-text'),
};
// pfSense tab UI
const pfui = {
  xml: qs('#pf-xml'),
  add: qs('#pf-add'),
  startIp: qs('#pf-start-ip'),
  out: qs('#pf-output'),
  gen: qs('#pf-gen'),
  dl: qs('#pf-dl'),
  copy: qs('#pf-copy')
};

let bootstrapModal = null;
function showImportModal(){ const el = document.getElementById('importModal'); bootstrapModal = bootstrap.Modal.getOrCreateInstance(el); bootstrapModal.show(); }
function hideImportModal(){ if (bootstrapModal) bootstrapModal.hide(); }

const appState = { originalText: '', nets: [], baselineNets: [] };

function renderNets() {
  ui.netList.innerHTML = '';
  ui.netCount.value = String(appState.nets.length);
  appState.nets.forEach((n, i) => {
    const row = document.createElement('div');
    row.className = 'row g-2 align-items-end mb-2';
    const minKeep = Math.min(2, (appState.baselineNets?.length || 0));
    const locked = i < minKeep;
    row.innerHTML = `
      <div class="col-12 col-md-2">
        <label class="form-label">net${i}</label>
        <input type="text" class="form-control form-control-sm model" value="${n.model||'virtio'}" />
      </div>
      <div class="col-12 col-md-3">
        <label class="form-label">MAC</label>
        <div class="input-group input-group-sm">
          <input type="text" class="form-control mac" value="${n.mac}" placeholder="D8:FC:93:XX:YY:ZZ" />
          <button class="btn btn-outline-secondary btn-rand" type="button">🎲</button>
        </div>
        <div class="form-text text-warning small d-none mac-warn">Invalid / duplicate MAC</div>
      </div>
      <div class="col-6 col-md-3">
        <label class="form-label">bridge</label>
        <input type="text" class="form-control form-control-sm bridge" value="${n.bridge||''}" placeholder="${i===0?'vmbr0':'vmbrX'}" />
      </div>
      <div class="col-4 col-md-2">
        <label class="form-label">tag</label>
        <input type="number" min="1" class="form-control form-control-sm tag" value="${n.tag||''}" placeholder="e.g. 107" />
      </div>
      <div class="col-2 col-md-2 text-end">
        <button class="btn btn-outline-danger btn-sm btn-del">×</button>
      </div>
    `;
    const modelEl = row.querySelector('.model');
    const macEl = row.querySelector('.mac');
    const bridgeEl = row.querySelector('.bridge');
    const tagEl = row.querySelector('.tag');
    const btnRand = row.querySelector('.btn-rand');
    const btnDel = row.querySelector('.btn-del');
    if (locked) {
      btnDel.disabled = true;
      btnDel.classList.add('disabled');
      btnDel.title = 'locked (baseline)';
    }
    modelEl.addEventListener('input', () => n.model = modelEl.value.trim() || 'virtio');
    macEl.addEventListener('input', () => { n.mac = macEl.value.toUpperCase(); validateMacs(); });
    bridgeEl.addEventListener('input', () => n.bridge = bridgeEl.value.trim());
    tagEl.addEventListener('input', () => n.tag = tagEl.value.trim());
    btnRand.addEventListener('click', () => { n.mac = genMac(); macEl.value = n.mac; validateMacs(); });
    btnDel.addEventListener('click', () => { if (locked) return; appState.nets.splice(i,1); renderNets(); });
    row.dataset.idx = i;
    ui.netList.appendChild(row);
  });
  validateMacs();
}
function validateMacs() {
  const macs = appState.nets.map(n => n.mac);
  const allValid = macs.every(isValidMac);
  const allUnique = uniqueMacs(macs);
  [...ui.netList.querySelectorAll('.row')].forEach((row, i) => {
    const macEl = row.querySelector('.mac');
    const warn = row.querySelector('.mac-warn');
    const thisMac = appState.nets[i].mac;
    const valid = isValidMac(thisMac);
    const dup = macs.filter(m => m.toUpperCase() === thisMac.toUpperCase()).length > 1;
    if (!valid || dup) { warn.classList.remove('d-none'); macEl.classList.add('is-invalid'); }
    else { warn.classList.add('d-none'); macEl.classList.remove('is-invalid'); }
  });
  if (!allValid) setStatus('One or more MAC addresses are invalid.');
  else if (!allUnique) setStatus('Duplicate MAC addresses detected.');
  else clearStatus();
}
function setStatus(msg){ ui.status.textContent = msg; }
function clearStatus(){ ui.status.textContent = ''; }

function addNet(defaults = {}) {
  const i = appState.nets.length;
  // Mặc định:
  // - net0: bridge = vmbr0
  // - net1: giữ nguyên (rỗng hoặc từ import)
  // - net2+ : kế thừa bridge/tag của net1 nếu có
  let bridge;
  let tag;

  if (Object.prototype.hasOwnProperty.call(defaults, 'bridge')) {
    bridge = defaults.bridge;
  } else if (i === 0) {
    bridge = 'vmbr0';
  } else if (i >= 2 && (appState.nets[1] || appState.baselineNets[1])) {
    const n1 = appState.nets[1] || appState.baselineNets[1];
    bridge = n1.bridge || '';
  } else {
    bridge = '';
  }

  if (Object.prototype.hasOwnProperty.call(defaults, 'tag')) {
    tag = defaults.tag;
  } else if (i >= 2 && (appState.nets[1] || appState.baselineNets[1])) {
    const n1 = appState.nets[1] || appState.baselineNets[1];
    tag = n1.tag || '';
  } else {
    tag = '';
  }

  appState.nets.push({
    index: i,
    model: defaults.model || 'virtio',
    mac: (defaults.mac || genMac()).toUpperCase(),
    bridge,
    tag
  });
  renderNets();
}

function ensureNetCount(count) {
  const desired = Math.max(0, Math.min(24, Number(count) || 0));
  const minKeep = Math.min(2, (appState.baselineNets?.length || 0));
  const finalCount = Math.max(desired, minKeep);
  while (appState.nets.length < finalCount) {
    const idx = appState.nets.length;
    if (appState.baselineNets && appState.baselineNets[idx]) {
      appState.nets.push(deepClone(appState.baselineNets[idx]));
    } else {
      addNet({});
    }
  }
  while (appState.nets.length > finalCount && appState.nets.length > minKeep) appState.nets.pop();
  ui.netCount.value = String(finalCount);
  renderNets();
}
function collectState() {
  return {
    vmid: (qs('#vmid').value || '').trim(),
    name: (qs('#name').value || '').trim(),
    vmgenid: (qs('#vmgenid').value || '').trim(),
    scsi0: (qs('#scsi0').value || '').trim(),
    nets: appState.nets.map((n,i)=>({ index:i, model:n.model||'virtio', mac:(n.mac||'').toUpperCase(), bridge:n.bridge||'', tag:n.tag||'' }))
  };
}
function serializeAndShow() {
  const st = collectState();
  if (st.nets.length) {
    const macs = st.nets.map(n=>n.mac);
    if (!macs.every(isValidMac)) { setStatus('Please fix invalid MACs before generating.'); return; }
    if (!uniqueMacs(macs)) { setStatus('Please ensure all MACs are unique.'); return; }
  }
  const text = serializeConfig({ name: st.name, vmgenid: st.vmgenid, scsi0: st.scsi0, nets: st.nets }, appState.originalText || '');
  qs('#output').value = text; clearStatus();
}
function downloadOutput() {
  const vmid = (qs('#vmid').value || 'vm').trim();
  const blob = new Blob([qs('#output').value || ''], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${vmid}.conf`; a.click(); URL.revokeObjectURL(a.href);
}
function copyOutput() {
  navigator.clipboard.writeText(qs('#output').value || '').then(()=>{ setStatus('Copied to clipboard.'); setTimeout(clearStatus,1500); });
}
function resetAll() {
  qs('#vmid').value=''; qs('#name').value=''; qs('#vmgenid').value=''; qs('#scsi0').value='';
  appState.originalText=''; appState.nets=[]; appState.baselineNets=[]; addNet({}); qs('#output').value=''; clearStatus();
}
function importApply() {
  const text = qs('#import-text').value || '';
  if (!text.trim()) { if (bootstrapModal) bootstrapModal.hide(); return; }
  const parsed = parseConfig(text); appState.originalText = text;
  qs('#name').value = parsed.name || ''; qs('#vmgenid').value = parsed.vmgenid || ''; qs('#scsi0').value = parsed.scsi0 || '';
  appState.nets = [];
  if (parsed.nets.length) {
    parsed.nets.sort((a,b)=>a.index-b.index).forEach((n,i)=>{
      appState.nets.push({ index:i, model:n.model||'virtio', mac:(n.mac||genMac()).toUpperCase(), bridge:n.bridge || (i===0?'vmbr0':''), tag:n.tag||'' });
    });
    appState.baselineNets = appState.nets.map(n => deepClone(n));
  } else addNet({});
  renderNets(); if (bootstrapModal) bootstrapModal.hide();
}
function seedSample() {
  const sample = `agent: 1
balloon: 0
boot: order=scsi0;net0
cores: 1
cpu: host
memory: 512
meta: creation-qemu=6.2.0,ctime=1745116545
name: pf-dlc-203
net0: virtio=2A:38:C4:4D:16:7C,bridge=vmbr0,tag=107
net1: virtio=62:24:ED:40:5A:C2,bridge=vmbr23,tag=581
numa: 0
ostype: l26
scsi0: local-lvm:vm-203-disk-0,discard=on,size=5G,ssd=1
scsihw: virtio-scsi-pci
smbios1: uuid=320d1591-fc12-4181-ab3d-7546490341b8
sockets: 1
tablet: 0
vmgenid: c6a7ed0b-c533-4e98-8b92-c791ba2cde3b`;
  qs('#import-text').value = sample;
  importApply(); qs('#vmid').value = '203';
}
function wireEvents() {
  qs('#btn-import').addEventListener('click', ()=>{ const el = document.getElementById('importModal'); bootstrapModal = bootstrap.Modal.getOrCreateInstance(el); bootstrapModal.show(); });
  qs('#import-apply').addEventListener('click', importApply);
  qs('#btn-generate').addEventListener('click', serializeAndShow);
  qs('#btn-download').addEventListener('click', downloadOutput);
  qs('#btn-copy').addEventListener('click', copyOutput);
  qs('#btn-reset').addEventListener('click', resetAll);
  qs('#btn-add-net').addEventListener('click', ()=> addNet({}));
  qs('#net-count').addEventListener('input', ()=> {
    const raw = qs('#net-count').value;
    if (raw === '' || Number.isNaN(Number(raw))) return;
    ensureNetCount(Number(raw));
  });
  qs('#btn-rand-all').addEventListener('click', ()=>{ appState.nets.forEach(n=> n.mac = genMac()); renderNets(); });
}

// pfSense events
if (pfui.gen) {
  pfui.gen.addEventListener('click', () => {
    try{
      const base = (pfui.xml.value || '').trim();
      if (!base) { setStatus('Paste pfSense base XML trước đã.'); return; }
      const addN = Number(pfui.add.value||0);
      const start = (pfui.startIp.value || '').trim();
      if (!start) { setStatus('Nhập Start IP để tạo rules.'); return; }
      const xml = buildPfSenseXML(base, addN, start);
      pfui.out.value = xml;
      clearStatus();
    } catch(e){
      setStatus('pfSense: ' + (e.message||e));
    }
  });
  pfui.dl.addEventListener('click', () => {
    const blob = new Blob([pfui.out.value||''], { type: 'application/xml' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'config-pfsense.xml'; a.click(); URL.revokeObjectURL(a.href);
  });
  pfui.copy.addEventListener('click', () => navigator.clipboard.writeText(pfui.out.value||'').then(()=>setStatus('Copied pfSense XML'), ()=>{}));
}
(function init(){ wireEvents(); resetAll(); seedSample(); })();
