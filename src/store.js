import { supabase } from './supabase.js';
import { today, businessDate } from './utils.js';

let session = null;
let inventory = [];
let transactionCache = [];
let purchaseCache = [];
let supplierCache = [];
let appSettings = null;
let authEpoch = 0;
let purchaseRead = 0;
let supplierRead = 0;
let transactionRead = 0;
function checked(result) { if (result.error) throw Object.assign(new Error(result.error.message), {code:result.error.code}); return result.data; }
async function rpc(name, args) { return checked(await supabase.rpc(name, args)); }
function clearCache() { session = null; inventory = []; transactionCache = []; purchaseCache = []; supplierCache = []; appSettings = null; authEpoch++; purchaseRead++; supplierRead++; transactionRead++; }
function isActiveStaff() { return session?.active && ['owner','kasir'].includes(session.role); }
function requireStaff() { if(!isActiveStaff()) throw new Error('Akses pegawai aktif diperlukan.'); }
function normalizeUsername(value) {
  const username = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
    throw new Error('Username harus 3-32 karakter dan hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung.');
  }
  return username;
}

export const auth = {
  getSession: () => session,
  isLoggedIn: () => !!session,
  isOwner: () => session?.role === 'owner' && session.active,
  async refresh() {
    const epoch = authEpoch;
    const { data, error } = await supabase.auth.getUser();
    if (epoch !== authEpoch) return null;
    if (error || !data.user) { clearCache(); return null; }
    const profile = checked(await supabase.from('staff').select('*').eq('id',data.user.id).single());
    if (epoch !== authEpoch) return null;
    if (session && (session.id !== profile.id || session.role !== profile.role || session.active !== profile.active)) clearCache();
    session = { ...profile };
    return session;
  },
  async login(username,password) {
    const normalized = normalizeUsername(username);
    const {data,error} = await supabase.functions.invoke('username-login',{body:{username:normalized,password}});
    if (error || !data?.access_token || !data?.refresh_token) throw new Error('Username atau password salah.');
    checked(await supabase.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token}));
    return this.refresh();
  },
  async register(username,email,password,name) {
    const normalized = normalizeUsername(username);
    const signup = await supabase.auth.signUp({email,password,options:{data:{name,username:normalized}}});
    if (signup.error) throw new Error('Username atau email sudah digunakan, atau data pendaftaran tidak valid.');
    const result = signup.data;
    if (result.user && Array.isArray(result.user.identities) && result.user.identities.length===0) throw new Error('Email sudah terdaftar.');
    return result;
  },
  async logout() {
    checked(await supabase.auth.signOut({scope:'local'}));
    clearCache();
  },
  async claimOwner(token) { await rpc('claim_owner',{token}); return this.refresh(); },
};
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    clearCache();
    window.dispatchEvent(new Event('apotek:signed-out'));
  }
});

export async function initializeData() {
  // Old business data is left untouched for owner-controlled import. Demo passwords are removed.
  localStorage.removeItem('dp_users');
  localStorage.removeItem('dp_auth');
  const { data } = await supabase.auth.getSession();
  if (data.session) await auth.refresh();
}

export async function refreshInventory() {
  const epoch = authEpoch;
  const rows = [];
  for (let offset=0;;offset+=500) {
    const page = checked(await supabase.from('products').select('*,batches(*)').gt('batches.qty',0).eq('deleted',false).order('id').range(offset,offset+499));
    rows.push(...page);
    if (page.length<500) break;
  }
  const date = today();
  const next = rows.map(p=>({
    id:p.id,name:p.name,category:p.category,unit:p.unit,buyPrice:Number(p.buy_price),sellPrice:Number(p.sell_price),minStock:p.min_stock,
    stock:p.batches.reduce((s,b)=>s+b.qty,0),
    availableStock:p.batches.filter(b=>!b.expiry || b.expiry>=date).reduce((s,b)=>s+b.qty,0),
    batches:p.batches.filter(b=>b.qty>0).map(b=>({id:b.id,batchNo:b.batch_no,expiry:b.expiry,qty:b.qty,addedAt:b.created_at})),
  }));
  if(epoch===authEpoch) inventory=next;
  return next;
}
export async function loadSettings() {
  const epoch=authEpoch;
  const row = checked(await supabase.from('settings').select('*').eq('id',true).single());
  if(epoch!==authEpoch) return;
  appSettings={pharmacyName:row.pharmacy_name,address:row.address,phone:row.phone,receiptHeader:row.receipt_header,receiptFooter:row.receipt_footer};
}
export async function prepareRoute(path) {
  if (!session?.active) return;
  await Promise.all([refreshInventory(),loadSettings()]);
  if (path==='/dashboard') {
    const d = new Date(); d.setDate(d.getDate()-30);
    await transactions.loadRange(businessDate(d),today());
  }
  if (path==='/purchases' || path==='/purchases/new') {
    const d = new Date(); d.setDate(d.getDate()-30);
    await Promise.all([
      purchases.loadRange(businessDate(d),today()),
      suppliers.load()
    ]);
  }
}
export const products = {
  getAll:()=>inventory,
  getById:id=>inventory.find(p=>p.id===id),
  search(query,category='') { return inventory.filter(p=>(!category||p.category===category)&&(!query||p.name.toLowerCase().includes(query.toLowerCase()))); },
  getLowStock:()=>inventory.filter(p=>p.stock>0&&p.stock<=p.minStock),
  getOutOfStock:()=>inventory.filter(p=>p.stock<=0),
  getExpiringSoon(days=90) { const limit=new Date();limit.setDate(limit.getDate()+days);return inventory.filter(p=>p.batches.some(b=>b.expiry && b.expiry>=today() && b.expiry<=businessDate(limit))); },
  async add(data) { const id=await rpc('save_product',{product_id:null,payload:data});await refreshInventory();return this.getById(id); },
  async update(id,data) { await rpc('save_product',{product_id:id,payload:data});await refreshInventory();return this.getById(id); },
  async remove(id) { await rpc('delete_product',{product_id:id});await refreshInventory(); },
  async addStock(id,qty,batchNo,expiry) { await rpc('change_stock',{product_id:id,mode:'add',quantity:qty,batch_no:batchNo,expiry:expiry||null,note:'Penerimaan stok'});await refreshInventory(); },
  async adjust(id,mode,quantity,note) { await rpc('change_stock',{product_id:id,mode,quantity,note});await refreshInventory(); },
};
function mapTransaction(t) {
 return {id:t.id,trxNo:t.trx_no,createdAt:t.created_at,cashier:t.cashier,subtotal:Number(t.subtotal),discount:Number(t.discount),total:Number(t.total),totalCost:Number(t.total_cost),margin:Number(t.margin),paymentMethod:t.payment_method,amountPaid:Number(t.amount_paid),change:Number(t.change),items:(t.sale_items||[]).map(i=>({productId:i.product_id,name:i.name,qty:i.qty,price:Number(i.price),costPrice:Number(i.cost_total)/i.qty,subtotal:Number(i.subtotal)}))};
}
export const transactions = {
 getAll:()=>transactionCache,
 getById:id=>transactionCache.find(t=>t.id===id),
 getByDateRange:(from,to)=>transactionCache.filter(t=>{const date=businessDate(t.createdAt);return date>=from&&date<=to;}),
 getToday() {return this.getByDateRange(today(),today());},
 async loadRange(from,to) {
   if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to) throw new Error('Rentang tanggal tidak valid');
   if((new Date(to)-new Date(from))/86400000>92) throw new Error('Pilih rentang maksimal 93 hari agar laporan tetap ringan.');
   const epoch=authEpoch,ticket=++transactionRead;
   const rows=[];
   const start=new Date(`${from}T00:00:00+07:00`).toISOString();
   const end=new Date(new Date(`${to}T00:00:00+07:00`).getTime()+86400000).toISOString();
   for(let offset=0;;offset+=500) {
     const page=checked(await supabase.from('sales').select('*,sale_items(*)').gte('created_at',start).lt('created_at',end).order('created_at').order('id').range(offset,offset+499));
     rows.push(...page);if(page.length<500)break;
   }
   const next=rows.map(mapTransaction);
   if(epoch!==authEpoch || ticket!==transactionRead) return [];
   transactionCache=next;
   return next;
 },
 async add(trx) {
   const epoch=authEpoch;
   let id;
   try { id=await rpc('checkout',{request_id:trx.requestId,items:trx.items.map(i=>({productId:i.productId,qty:i.qty,price:i.price})),discount_type:trx.discountType,discount_value:trx.discountValue,payment_method:trx.paymentMethod,amount_paid:Math.round(trx.amountPaid)}); } catch(error) {
     error.rejected = error.code==='P0001' || error.code==='42501' || /^22|^23/.test(error.code||'');
     throw error;
   }
   const result=checked(await supabase.from('sales').select('*,sale_items(*)').eq('id',id).single());
   const saved=mapTransaction(result);
   // Receipt retrieval may fail after commit. Reusing requestId makes retries safe.
   if(epoch===authEpoch) transactionCache=transactionCache.filter(t=>t.id!==id).concat(saved);
   return saved;
 },
};
export const settings={ get:()=>appSettings||{pharmacyName:'Apotek Mulia Farma',address:'',phone:'',receiptHeader:'Terima Kasih',receiptFooter:'Semoga Lekas Sembuh'} };
export const staff={
 async list(){return checked(await supabase.from('staff').select('*').order('created_at'));},
 async setActive(id,enabled){await rpc('manage_staff',{staff_id:id,enabled});},
};
export async function importLegacy(data) {return rpc('import_legacy',{payload:data});}

function mapPurchaseInvoice(row) {
  return {
    id: row.id,
    version: row.version,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason || '',
    canModifyStock: (row.purchase_items || []).length>0 && (row.purchase_items || []).every(it=>!!it.batch_id),
    invoiceNo: row.invoice_no || row.invoiceNo,
    orderNo: row.order_no || row.orderNo || '',
    supplierId: row.supplier_id || row.supplierId || null,
    supplierName: row.supplier_name || row.supplierName || 'Umum',
    officerId: row.officer_id || row.officerId || null,
    officerName: row.officer_name || row.officerName || 'Petugas',
    invoiceDate: row.invoice_date || row.invoiceDate || today(),
    receivedAt: row.received_at || row.receivedAt || row.created_at,
    invoiceType: row.invoice_type || row.invoiceType || 'exclude_tax',
    warehouse: row.warehouse || 'Gudang Utama',
    paymentType: row.payment_type || row.paymentType || 'kredit',
    paymentTerm: Number(row.payment_term ?? row.paymentTerm ?? 0),
    dueDate: row.due_date || row.dueDate || today(),
    subtotal: Number(row.subtotal || 0),
    discountType: row.discount_type || row.discountType || 'nominal',
    discountValue: Number(row.discount_value ?? row.discountValue ?? 0),
    discountAmount: Number(row.discount_amount ?? row.discountAmount ?? 0),
    cashback: Number(row.cashback || 0),
    otherFees: Number(row.other_fees ?? row.otherFees ?? 0),
    taxPercent: Number(row.tax_percent ?? row.taxPercent ?? 0),
    taxAmount: Number(row.tax_amount ?? row.taxAmount ?? 0),
    total: Number(row.total || 0),
    notes: row.notes || '',
    pkpStatus: row.pkp_status || row.pkpStatus || 'non_pkp',
    status: row.status || 'completed',
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    items: (row.purchase_items || row.items || []).map((it, idx) => ({
      id: it.id || (idx + 1),
      batchId: it.batch_id || it.batchId || null,
      productId: it.product_id || it.productId,
      productName: it.product_name || it.productName || 'Produk',
      batchNo: it.batch_no || it.batchNo || '-',
      expiry: it.expiry || null,
      qty: Number(it.qty || 0),
      unit: it.unit || 'pcs',
      buyPrice: Number(it.buy_price ?? it.buyPrice ?? 0),
      discountPercent: Number(it.discount_percent ?? it.discountPercent ?? 0),
      taxPercent: Number(it.tax_percent ?? it.taxPercent ?? 0),
      costPrice: Number(it.cost_price ?? it.costPrice ?? it.buy_price ?? it.buyPrice ?? 0),
      subtotal: Number(it.subtotal || 0)
    }))
  };
}


function requireOwner() {
  if (!auth.isOwner()) throw new Error('Akses pemilik diperlukan.');
}
function staffKey(kind) {
  requireStaff();
  return `apotek:${supabase.supabaseUrl || 'local'}:${session.id}:${kind}`;
}
function validateRange(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from>to ||
      !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to))) throw new Error('Rentang tanggal tidak valid.');
}
function readPending() {
  const raw=sessionStorage.getItem(staffKey('purchase-command'));
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch { throw new Error('Data permintaan tertunda tidak terbaca. Periksa faktur sebelum membersihkan penyimpanan tab.'); }
}
function rejected(error) {
  return error.code==='P0001' || error.code==='42501' || error.code==='40001' || /^22|^23/.test(error.code||'');
}
let activePurchase=null;
async function executePurchase(command, key) {
  const epoch=authEpoch;
  let row;
  try { row=await rpc(command.method,command.args); }
  catch(error) {
    if(rejected(error)) sessionStorage.removeItem(key);
    error.rejected=rejected(error);
    throw error;
  }
  sessionStorage.removeItem(key);
  if(epoch!==authEpoch) throw new Error('Sesi berubah. Masuk kembali untuk melihat hasil faktur.');
  const saved=mapPurchaseInvoice(row);
  purchaseRead++; // Invalidate older reads that started before this mutation.
  purchaseCache=[saved,...purchaseCache.filter(p=>p.id!==saved.id)];
  try { await refreshInventory(); }
  catch { saved.inventoryRefreshFailed=true; }
  return saved;
}
async function sendPurchase(method, args) {
  requireStaff();
  if(method!=='save_purchase' || args.invoice_id!==null) requireOwner();
  const key=staffKey('purchase-command');
  let command=readPending();
  const fingerprint=JSON.stringify({method,args});
  if(command && command.fingerprint!==fingerprint) throw new Error('Ada permintaan pembelian yang belum terkonfirmasi. Selesaikan melalui tombol Periksa permintaan tertunda.');
  if(!command) {
    command={method,args:{...args,request_id:crypto.randomUUID()},fingerprint};
    // Persist before sending: a lost response can safely replay the same command.
    sessionStorage.setItem(key,JSON.stringify(command));
  }
  if(activePurchase?.key===key) return activePurchase.promise;
  const promise=executePurchase(command,key);
  activePurchase={key,promise};
  try { return await promise; }
  finally { if(activePurchase?.promise===promise) activePurchase=null; }
}

export const suppliers = {
  getAll:()=>isActiveStaff()?supplierCache:[],
  async load() {
    requireStaff();
    const epoch=authEpoch,ticket=++supplierRead,rows=[];
    for(let offset=0;;offset+=500) {
      const page=checked(await supabase.from('suppliers').select('*').order('name').order('id').range(offset,offset+499));
      rows.push(...page); if(page.length<500) break;
    }
    if(epoch!==authEpoch || ticket!==supplierRead) return [];
    supplierCache=rows; return rows;
  },
  async add(item) {
    requireOwner();
    const epoch=authEpoch;
    const payload={id:item.requestId || crypto.randomUUID(),name:(item.name||'').trim(),phone:(item.phone||'').trim(),address:(item.address||'').trim()};
    const saved=await rpc('save_supplier',{payload});
    if(epoch!==authEpoch) throw new Error('Sesi berubah. Masuk kembali untuk melihat supplier.');
    supplierRead++;
    supplierCache=[saved,...supplierCache.filter(s=>s.id!==saved.id)];
    return saved;
  }
};

export const purchases = {
  getAll:()=>isActiveStaff()?purchaseCache:[],
  getById(id) { return this.getAll().find(p=>p.id===id); },
  getByDateRange(from,to) { return this.getAll().filter(p=>p.invoiceDate>=from && p.invoiceDate<=to); },
  pending() { return isActiveStaff()?readPending():null; },
  async retryPending() {
    requireStaff();
    const command=readPending();
    if(!command) throw new Error('Tidak ada permintaan tertunda.');
    const {request_id,...args}=command.args;
    return sendPurchase(command.method,args);
  },
  hasLegacyLocalData() {
    if(!auth.isOwner()) return false;
    return ['dp_purchases','dp_suppliers'].some(key=> {
      const raw=localStorage.getItem(key);
      return raw && raw!=='[]';
    });
  },
  exportLegacy() {
    requireOwner();
    // Preserve the exact old content, including malformed JSON; never silently import it.
    return {exportedAt:new Date().toISOString(),purchases:localStorage.getItem('dp_purchases'),suppliers:localStorage.getItem('dp_suppliers')};
  },
  async loadRange(from,to) {
    requireStaff(); validateRange(from,to);
    const epoch=authEpoch,ticket=++purchaseRead,rows=[];
    for(let offset=0;;offset+=500) {
      const page=checked(await supabase.from('purchase_invoices').select('*,purchase_items(*)')
        .gte('invoice_date',from).lte('invoice_date',to)
        .order('invoice_date',{ascending:false}).order('id').range(offset,offset+499));
      rows.push(...page); if(page.length<500) break;
    }
    if(epoch!==authEpoch || ticket!==purchaseRead) return [];
    purchaseCache=rows.map(row=>mapPurchaseInvoice({...row,purchase_items:[...(row.purchase_items||[])].sort((a,b)=>a.id-b.id)}));
    return this.getByDateRange(from,to);
  },
  async add(payload) {
    return sendPurchase('save_purchase',{invoice_id:null,expected_version:null,payload});
  },
  async update(id,payload,version) {
    requireOwner();
    const existing=this.getById(id);
    if(!existing) throw new Error('Faktur belum dimuat. Segarkan daftar terlebih dahulu.');
    return sendPurchase('save_purchase',{invoice_id:id,expected_version:version ?? existing.version,payload});
  },
  async remove(id,reason='Dibatalkan oleh pemilik',version) {
    requireOwner();
    const existing=this.getById(id);
    if(!existing) throw new Error('Faktur belum dimuat. Segarkan daftar terlebih dahulu.');
    return sendPurchase('cancel_purchase',{invoice_id:id,expected_version:version ?? existing.version,reason});
  }
};
