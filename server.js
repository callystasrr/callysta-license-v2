const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const app     = express();
const PORT    = process.env.PORT || 3001;
const DB_FILE = path.join(__dirname, 'licenses.json');
const ADMIN_PASS = process.env.ADMIN_PASS || 'callysta2024';

// ── KALICI (SİLİNMEYEN) LİSANSLAR ────────────────────
// Masaüstü uygulamasında (gemini) "Lisans Doğrulanamadı" ekranında yazan 
// Makine Kimliğini (HWID) kopyalayarak aşağıdaki ilgili alana yapıştırın.
// Render sunucusu uykuya dalsa da, yeniden başlasa da burası ASLA silinmez.
const SABIT_LISANSLAR = [
  { hwid: "707ce95f1157ee0a9dad676443ddf278", shopName: "TECHNODİYARI", active: true, key: "kalici-cly-1", expiresAt: null },
  { hwid: "HWID_BURAYA", shopName: "Dağkapı Şubesi", active: true, key: "kalici-cly-2", expiresAt: null },
  { hwid: "HWID_BURAYA", shopName: "Çiftkapı Şubesi", active: true, key: "kalici-cly-3", expiresAt: null },
  { hwid: "HWID_BURAYA", shopName: "Yedek Kasa", active: true, key: "kalici-cly-4", expiresAt: null }
];

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Lisans DB (Geçici Panel Verileri İçin) ───────────
function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { licenses: [] }; }
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ── API: Lisans kontrol (client tarafından çağrılır) ─
app.get('/api/check', (req, res) => {
  const { hwid } = req.query;
  if (!hwid) return res.json({ valid: false, message: 'HWID eksik' });

  // 1. Önce ASLA silinmeyen sabit lisanslara bakıyoruz
  let lic = SABIT_LISANSLAR.find(l => l.hwid === hwid);

  // 2. Eğer sabit listede yoksa, panelden eklenen listeye bak
  if (!lic) {
    const db = readDB();
    lic = db.licenses.find(l => l.hwid === hwid);
  }

  if (!lic)          return res.json({ valid: false, message: 'Bu cihaza lisans tanımlanmamış.\nLütfen yetkili kişiyle iletişime geçin.' });
  if (!lic.active)   return res.json({ valid: false, message: 'Lisansınız askıya alınmıştır.\nBilgi için yetkili kişiyle iletişime geçin.' });

  // Süre kontrolü
  if (lic.expiresAt) {
    const exp = new Date(lic.expiresAt);
    if (new Date() > exp) return res.json({ valid: false, message: `Lisans süresi doldu (${lic.expiresAt}).\nYenileme için yetkili kişiyle iletişime geçin.` });
  }

  // Sadece panelden eklenenlerin son görülmesini güncelliyoruz
  const db = readDB();
  const dbLic = db.licenses.find(l => l.hwid === hwid);
  if (dbLic) {
    dbLic.lastSeen = new Date().toISOString();
    writeDB(db);
  }

  res.json({ valid: true, key: lic.key, shop: lic.shopName });
});

// ── Yönetim Paneli HTML ──────────────────────────────
const PANEL_HTML = `<!DOCTYPE html><html lang="tr"><head>
<meta charset="utf-8"><title>CALLYSTA Lisans Paneli</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Segoe UI,sans-serif;background:#0a0d14;color:#e8eaf0;min-height:100vh;padding:24px}
h1{font-size:22px;font-weight:800;background:linear-gradient(135deg,#4f8ef7,#7c5cfc);
   -webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:4px}
.sub{color:#5a6280;font-size:13px;margin-bottom:24px}
.card{background:#13172a;border:1px solid #2a3050;border-radius:12px;padding:20px;margin-bottom:16px}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:10px 12px;font-size:11px;color:#5a6280;text-transform:uppercase;border-bottom:1px solid #2a3050}
td{padding:10px 12px;font-size:13px;border-bottom:1px solid #1a1f33}
tr:hover td{background:#0f1220}
.badge{display:inline-block;padding:3px 8px;border-radius:20px;font-size:11px;font-weight:600}
.badge-ok{background:#0d2b1a;color:#22c55e;border:1px solid #22c55e40}
.badge-off{background:#2d0f0f;color:#ef4444;border:1px solid #ef444440}
.badge-exp{background:#2d1a00;color:#f97316;border:1px solid #f9731640}
.badge-hardcoded{background:#1e3a8a;color:#60a5fa;border:1px solid #3b82f640}
input,select{background:#0f1220;border:1px solid #2a3050;border-radius:8px;color:#e8eaf0;padding:8px 12px;font-size:13px;width:100%}
.form-row{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:end}
button{padding:8px 16px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600}
.btn-add{background:linear-gradient(135deg,#4f8ef7,#7c5cfc);color:#fff}
.btn-del{background:#2d0f0f;color:#ef4444;border:1px solid #ef444440}
.btn-tog{background:#0d2b1a;color:#22c55e;border:1px solid #22c55e40}
.pass-box{max-width:320px;margin:40px auto;text-align:center}
label{display:block;font-size:12px;color:#5a6280;margin-bottom:4px}
</style></head><body>
<div id="login" style="display:none" class="pass-box">
  <div style="font-size:40px;margin-bottom:16px">🔐</div>
  <h1>CALLYSTA</h1><div class="sub" style="-webkit-text-fill-color:#5a6280">Lisans Yönetim Paneli</div>
  <div class="card" style="margin-top:24px">
    <label>Yönetici Şifresi</label>
    <input type="password" id="passInput" placeholder="••••••••" onkeydown="if(event.key==='Enter')doLogin()">
    <button class="btn-add" style="width:100%;margin-top:10px" onclick="doLogin()">Giriş Yap</button>
    <div id="loginErr" style="color:#ef4444;font-size:12px;margin-top:8px"></div>
  </div>
</div>

<div id="panel" style="display:none">
<h1>CALLYSTA Lisans Paneli</h1>
<div class="sub">Mağaza lisanslarını buradan yönetin</div>

<div class="card">
  <div style="font-size:13px;font-weight:600;margin-bottom:12px">➕ Yeni Geçici Lisans Ekle (Test/Geçici Cihazlar)</div>
  <div class="form-row">
    <div><label>Mağaza Adı</label><input id="shopName" placeholder="Örn: Geçici Kasa"></div>
    <div><label>HWID (Makine Kimliği)</label><input id="hwid" placeholder="Cihazdan kopyalayın"></div>
    <div><label>Son Geçerlilik (boş=süresiz)</label><input type="date" id="expires"></div>
    <button class="btn-add" onclick="addLicense()">Ekle</button>
  </div>
  <div id="addMsg" style="margin-top:8px;font-size:12px"></div>
</div>

<div class="card">
  <div style="font-size:13px;font-weight:600;margin-bottom:12px">📋 Aktif Lisanslar</div>
  <table>
    <thead><tr>
      <th>Mağaza</th><th>HWID</th><th>Durum</th><th>Son Geçerlilik</th><th>Son Görülme</th><th>İşlem</th>
    </tr></thead>
    <tbody id="tbody"></tbody>
  </table>
</div>
</div>

<script>
let pass = '';
function doLogin() {
  pass = document.getElementById('passInput').value;
  fetch('/api/admin/list?pass=' + encodeURIComponent(pass))
    .then(r=>r.json()).then(d=>{
      if(d.error){ document.getElementById('loginErr').textContent = d.error; return; }
      document.getElementById('login').style.display='none';
      document.getElementById('panel').style.display='block';
      renderTable(d);
    });
}
window.onload = () => { document.getElementById('login').style.display='block'; };

function renderTable(licenses) {
  const now = new Date();
  document.getElementById('tbody').innerHTML = licenses.map(l => {
    const expired = l.expiresAt && new Date(l.expiresAt) < now;
    const isHardcoded = String(l.key).includes('kalici');
    let status = '';
    
    if (isHardcoded) {
        status = '<span class="badge badge-hardcoded">Kalıcı (Koddan)</span>';
    } else {
        status  = !l.active ? '<span class="badge badge-off">Pasif</span>'
                : expired   ? '<span class="badge badge-exp">Süresi Doldu</span>'
                            : '<span class="badge badge-ok">Aktif</span>';
    }
    
    const seen = l.lastSeen ? new Date(l.lastSeen).toLocaleString('tr-TR') : (isHardcoded ? 'Her Zaman Aktif' : '—');
    
    const actions = isHardcoded 
        ? '<span style="font-size:11px;color:#5a6280">Koddan Değiştirin</span>'
        : \`<button class="btn-tog" onclick="toggle('\${l.hwid}')">\${l.active?'Askıya Al':'Aktif Et'}</button>
           <button class="btn-del" onclick="del('\${l.hwid}')">Sil</button>\`;

    return \`<tr>
      <td><b>\${l.shopName||'—'}</b></td>
      <td style="font-family:monospace;font-size:11px">\${l.hwid}</td>
      <td>\${status}</td>
      <td>\${l.expiresAt||'Süresiz'}</td>
      <td style="font-size:11px;color:#5a6280">\${seen}</td>
      <td style="display:flex;gap:6px">\${actions}</td>
    </tr>\`;
  }).join('');
}

function addLicense() {
  const shopName = document.getElementById('shopName').value.trim();
  const hwid     = document.getElementById('hwid').value.trim();
  const expires  = document.getElementById('expires').value;
  if (!hwid) { document.getElementById('addMsg').style.color='#ef4444'; document.getElementById('addMsg').textContent='HWID boş olamaz'; return; }
  fetch('/api/admin/add', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ pass, shopName, hwid, expiresAt: expires||null }) })
    .then(r=>r.json()).then(d=>{
      if(d.error) { document.getElementById('addMsg').style.color='#ef4444'; document.getElementById('addMsg').textContent=d.error; return; }
      document.getElementById('addMsg').style.color='#22c55e';
      document.getElementById('addMsg').textContent='✅ Lisans eklendi';
      document.getElementById('shopName').value=''; document.getElementById('hwid').value=''; document.getElementById('expires').value='';
      renderTable(d.licenses);
    });
}

function toggle(hwid) {
  fetch('/api/admin/toggle', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ pass, hwid }) }).then(r=>r.json()).then(d=>{
        if(d.error) alert(d.error);
        else if(d.licenses) renderTable(d.licenses); 
    });
}

function del(hwid) {
  if(!confirm('Bu lisansı silmek istediğinize emin misiniz?')) return;
  fetch('/api/admin/delete', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ pass, hwid }) }).then(r=>r.json()).then(d=>{ 
        if(d.error) alert(d.error);
        else if(d.licenses) renderTable(d.licenses); 
    });
}
</script></body></html>`;

app.get('/', (req, res) => res.send(PANEL_HTML));

// ── Admin API ────────────────────────────────────────
function checkPass(p) { return p === ADMIN_PASS; }

app.get('/api/admin/list', (req, res) => {
  if (!checkPass(req.query.pass)) return res.json({ error: 'Hatalı şifre' });
  const allLicenses = [...SABIT_LISANSLAR, ...readDB().licenses];
  res.json(allLicenses);
});

app.post('/api/admin/add', (req, res) => {
  const { pass, shopName, hwid, expiresAt } = req.body;
  if (!checkPass(pass)) return res.json({ error: 'Hatalı şifre' });
  if (!hwid) return res.json({ error: 'HWID zorunlu' });
  
  const db = readDB();
  if (SABIT_LISANSLAR.find(l => l.hwid === hwid) || db.licenses.find(l => l.hwid === hwid)) {
    return res.json({ error: 'Bu HWID zaten kayıtlı' });
  }
  
  db.licenses.push({
    hwid, shopName: shopName || 'Mağaza',
    active: true, expiresAt: expiresAt || null,
    key: crypto.randomBytes(16).toString('hex'),
    createdAt: new Date().toISOString(),
    lastSeen: null
  });
  writeDB(db);
  const allLicenses = [...SABIT_LISANSLAR, ...db.licenses];
  res.json({ success: true, licenses: allLicenses });
});

app.post('/api/admin/toggle', (req, res) => {
  const { pass, hwid } = req.body;
  if (!checkPass(pass)) return res.json({ error: 'Hatalı şifre' });
  
  if (SABIT_LISANSLAR.find(l => l.hwid === hwid)) {
      return res.json({ error: 'Sabit lisanslar panelden durdurulamaz. server.js dosyasından kaldırmalısınız.' });
  }

  const db = readDB();
  const l  = db.licenses.find(l => l.hwid === hwid);
  if (!l) return res.json({ error: 'Bulunamadı' });
  l.active = !l.active;
  writeDB(db);
  const allLicenses = [...SABIT_LISANSLAR, ...db.licenses];
  res.json({ success: true, licenses: allLicenses });
});

app.post('/api/admin/delete', (req, res) => {
  const { pass, hwid } = req.body;
  if (!checkPass(pass)) return res.json({ error: 'Hatalı şifre' });
  
  if (SABIT_LISANSLAR.find(l => l.hwid === hwid)) {
      return res.json({ error: 'Sabit lisanslar panelden silinemez. server.js dosyasından kaldırmalısınız.' });
  }

  const db = readDB();
  db.licenses = db.licenses.filter(l => l.hwid !== hwid);
  writeDB(db);
  const allLicenses = [...SABIT_LISANSLAR, ...db.licenses];
  res.json({ success: true, licenses: allLicenses });
});

app.listen(PORT, () => console.log(`Callysta Telekomünikasyon Lisans Sunucusu: http://localhost:${PORT}`));
