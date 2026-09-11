import { supabase } from './supabase.js';
import { today, businessDate } from './utils.js';

let session = null;
let inventory = [];
let transactionCache = [];
let appSettings = null;
let authEpoch = 0;
function checked(result) { if (result.error) throw Object.assign(new Error(result.error.message), {code:result.error.code}); return result.data; }
async function rpc(name, args) { return checked(await supabase.rpc(name, args)); }
function clearCache() { session = null; inventory = []; transactionCache = []; appSettings = null; authEpoch++; }
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
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) { clearCache(); return null; }
    const profile = checked(await supabase.from('staff').select('*').eq('id',data.user.id).single());
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
  const row = checked(await supabase.from('settings').select('*').eq('id',true).single());
  appSettings={pharmacyName:row.pharmacy_name,address:row.address,phone:row.phone,receiptHeader:row.receipt_header,receiptFooter:row.receipt_footer};
}
export async function prepareRoute(path) {
  if (!session?.active) return;
  await Promise.all([refreshInventory(),loadSettings()]);
  if (path==='/dashboard') {
    const d = new Date(); d.setDate(d.getDate()-30);
    await transactions.loadRange(businessDate(d),today());
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
   const epoch=authEpoch;
   const rows=[];
   const start=new Date(`${from}T00:00:00+07:00`).toISOString();
   const end=new Date(new Date(`${to}T00:00:00+07:00`).getTime()+86400000).toISOString();
   for(let offset=0;;offset+=500) {
     const page=checked(await supabase.from('sales').select('*,sale_items(*)').gte('created_at',start).lt('created_at',end).order('created_at').order('id').range(offset,offset+499));
     rows.push(...page);if(page.length<500)break;
   }
   const next=rows.map(mapTransaction);
   if(epoch===authEpoch)transactionCache=next;
   return next;
 },
 async add(trx) {
   let id;
   try { id=await rpc('checkout',{request_id:trx.requestId,items:trx.items.map(i=>({productId:i.productId,qty:i.qty,price:i.price})),discount_type:trx.discountType,discount_value:trx.discountValue,payment_method:trx.paymentMethod,amount_paid:Math.round(trx.amountPaid)}); } catch(error) {
     error.rejected = error.code==='P0001' || error.code==='42501' || /^22|^23/.test(error.code||'');
     throw error;
   }
   const result=checked(await supabase.from('sales').select('*,sale_items(*)').eq('id',id).single());
   const saved=mapTransaction(result);
   // Receipt retrieval may fail after commit. Reusing requestId makes retries safe.
   transactionCache=transactionCache.filter(t=>t.id!==id).concat(saved);
   return saved;
 },
};
export const settings={ get:()=>appSettings||{pharmacyName:'Apotek Mulia Farma',address:'',phone:'',receiptHeader:'Terima Kasih',receiptFooter:'Semoga Lekas Sembuh'} };
export const staff={
 async list(){return checked(await supabase.from('staff').select('*').order('created_at'));},
 async setActive(id,enabled){await rpc('manage_staff',{staff_id:id,enabled});},
};
export async function importLegacy(data) {return rpc('import_legacy',{payload:data});}
