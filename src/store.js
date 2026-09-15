import { supabase } from './supabase.js';
import { today, businessDate } from './utils.js';

let session = null;
let inventory = [];
let transactionCache = [];
let purchaseCache = [];
let supplierCache = [];
let appSettings = null;
let authEpoch = 0;
function checked(result) { if (result.error) throw Object.assign(new Error(result.error.message), {code:result.error.code}); return result.data; }
async function rpc(name, args) { return checked(await supabase.rpc(name, args)); }
function clearCache() { session = null; inventory = []; transactionCache = []; purchaseCache = []; supplierCache = []; appSettings = null; authEpoch++; }
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

const DEFAULT_SUPPLIERS = [
  { id: 'sup-1', name: 'PT Kimia Farma Trading & Distribution', phone: '021-3847709', address: 'Jakarta' },
  { id: 'sup-2', name: 'PT Anugrah Argon Medica', phone: '021-8990123', address: 'Bekasi' },
  { id: 'sup-3', name: 'PT Mensa Bina Sukses', phone: '021-4608822', address: 'Jakarta Timur' },
  { id: 'sup-4', name: 'PT Enseval Putera Megatrading', phone: '021-4609042', address: 'Jakarta Timur' },
  { id: 'sup-5', name: 'PT Dos Ni Roha', phone: '021-4600022', address: 'Pulo Gadung' },
];

function loadLocalSuppliers() {
  try {
    const raw = localStorage.getItem('dp_suppliers');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return DEFAULT_SUPPLIERS;
}

function saveLocalSuppliers(list) {
  try {
    localStorage.setItem('dp_suppliers', JSON.stringify(list));
  } catch (e) {}
}

function loadLocalPurchases() {
  try {
    const raw = localStorage.getItem('dp_purchases');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

function saveLocalPurchases(list) {
  try {
    localStorage.setItem('dp_purchases', JSON.stringify(list));
  } catch (e) {}
}

function mapPurchaseInvoice(row) {
  return {
    id: row.id,
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

export const suppliers = {
  getAll() {
    if (!supplierCache.length) {
      supplierCache = loadLocalSuppliers();
    }
    return supplierCache;
  },
  async load() {
    try {
      const { data, error } = await supabase.from('suppliers').select('*').order('name');
      if (!error && data && data.length > 0) {
        supplierCache = data;
        return data;
      }
    } catch (e) {}
    return this.getAll();
  },
  async add(item) {
    const newSupplier = {
      id: item.id || ('sup-' + Date.now()),
      name: (item.name || '').trim(),
      phone: (item.phone || '').trim(),
      address: (item.address || '').trim(),
      createdAt: new Date().toISOString()
    };
    try {
      const { data, error } = await supabase.from('suppliers').insert({
        name: newSupplier.name,
        phone: newSupplier.phone,
        address: newSupplier.address
      }).select().single();
      if (!error && data) {
        newSupplier.id = data.id;
      }
    } catch (e) {}
    supplierCache = [newSupplier, ...supplierCache.filter(s => s.id !== newSupplier.id)];
    saveLocalSuppliers(supplierCache);
    return newSupplier;
  }
};

export const purchases = {
  getAll() {
    if (!purchaseCache.length) {
      purchaseCache = loadLocalPurchases();
    }
    return purchaseCache;
  },
  getById(id) {
    const list = this.getAll();
    return list.find(p => p.id === id || p.invoiceNo === id);
  },
  getByDateRange(from, to) {
    const list = this.getAll();
    return list.filter(p => {
      const d = p.invoiceDate || businessDate(p.createdAt);
      return d >= from && d <= to;
    });
  },
  async loadRange(from, to) {
    try {
      const start = new Date(`${from}T00:00:00+07:00`).toISOString();
      const end = new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86400000).toISOString();
      const { data, error } = await supabase
        .from('purchase_invoices')
        .select('*,purchase_items(*)')
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: false });
      if (!error && data) {
        const mapped = data.map(mapPurchaseInvoice);
        const local = loadLocalPurchases();
        const combined = [...mapped];
        for (const loc of local) {
          if (!combined.some(c => c.id === loc.id || c.invoiceNo === loc.invoiceNo)) {
            combined.push(loc);
          }
        }
        purchaseCache = combined;
        return this.getByDateRange(from, to);
      }
    } catch (e) {}
    return this.getByDateRange(from, to);
  },
  async add(invoiceData) {
    if (!invoiceData.invoiceNo || !invoiceData.invoiceNo.trim()) {
      throw new Error('Nomor faktur wajib diisi.');
    }
    if (!invoiceData.items || invoiceData.items.length === 0) {
      throw new Error('Faktur harus memiliki minimal satu item produk.');
    }

    // 1. Process batch stock additions for each product
    for (const item of invoiceData.items) {
      if (item.productId && item.qty > 0) {
        try {
          await rpc('change_stock', {
            product_id: item.productId,
            mode: 'add',
            quantity: Number(item.qty),
            batch_no: item.batchNo || '-',
            expiry: item.expiry || null,
            note: 'Faktur: ' + (invoiceData.invoiceNo || '-')
          });
        } catch (stockErr) {
          const prod = inventory.find(p => p.id === item.productId);
          if (prod) {
            prod.stock = (prod.stock || 0) + Number(item.qty);
            prod.availableStock = (prod.availableStock || 0) + Number(item.qty);
            prod.batches = prod.batches || [];
            prod.batches.push({
              id: 'batch-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
              batchNo: item.batchNo || '-',
              expiry: item.expiry || null,
              qty: Number(item.qty),
              addedAt: new Date().toISOString()
            });
          }
        }

        // Update product buy_price if new buy price is given
        if (item.buyPrice && item.buyPrice > 0) {
          const currentProd = products.getById(item.productId);
          if (currentProd && currentProd.buyPrice !== Number(item.buyPrice)) {
            try {
              await products.update(item.productId, {
                name: currentProd.name,
                category: currentProd.category,
                unit: currentProd.unit,
                buyPrice: Number(item.buyPrice),
                sellPrice: currentProd.sellPrice,
                minStock: currentProd.minStock,
              });
            } catch (updErr) {
              if (currentProd) currentProd.buyPrice = Number(item.buyPrice);
            }
          }
        }
      }
    }
    await refreshInventory().catch(() => {});

    // 2. Prepare saved invoice object
    const saved = {
      id: invoiceData.id || ('pi-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)),
      invoiceNo: invoiceData.invoiceNo.trim(),
      orderNo: (invoiceData.orderNo || '').trim(),
      supplierId: invoiceData.supplierId || null,
      supplierName: invoiceData.supplierName || 'Umum',
      officerId: session?.id || null,
      officerName: session?.name || invoiceData.officerName || 'Petugas',
      invoiceDate: invoiceData.invoiceDate || today(),
      receivedAt: invoiceData.receivedAt || new Date().toISOString(),
      invoiceType: invoiceData.invoiceType || 'exclude_tax',
      warehouse: invoiceData.warehouse || 'Gudang Utama',
      paymentType: invoiceData.paymentType || 'kredit',
      paymentTerm: Number(invoiceData.paymentTerm || 0),
      dueDate: invoiceData.dueDate || today(),
      subtotal: Number(invoiceData.subtotal || 0),
      discountType: invoiceData.discountType || 'nominal',
      discountValue: Number(invoiceData.discountValue || 0),
      discountAmount: Number(invoiceData.discountAmount || 0),
      cashback: Number(invoiceData.cashback || 0),
      otherFees: Number(invoiceData.otherFees || 0),
      taxPercent: Number(invoiceData.taxPercent || 0),
      taxAmount: Number(invoiceData.taxAmount || 0),
      total: Number(invoiceData.total || 0),
      notes: invoiceData.notes || '',
      pkpStatus: invoiceData.pkpStatus || 'non_pkp',
      status: invoiceData.status || 'completed',
      createdAt: new Date().toISOString(),
      items: (invoiceData.items || []).map((item, idx) => ({
        id: item.id || (idx + 1),
        productId: item.productId,
        productName: item.productName,
        batchNo: item.batchNo || '-',
        expiry: item.expiry || null,
        qty: Number(item.qty),
        unit: item.unit || 'pcs',
        buyPrice: Number(item.buyPrice || 0),
        discountPercent: Number(item.discountPercent || 0),
        taxPercent: Number(item.taxPercent || 0),
        costPrice: Number(item.costPrice || item.buyPrice || 0),
        subtotal: Number(item.subtotal || 0)
      }))
    };

    // 3. Try to persist to Supabase
    try {
      const { data: invRow, error: invErr } = await supabase.from('purchase_invoices').insert({
        invoice_no: saved.invoiceNo,
        order_no: saved.orderNo,
        supplier_id: saved.supplierId,
        supplier_name: saved.supplierName,
        officer_id: saved.officerId,
        officer_name: saved.officerName,
        invoice_date: saved.invoiceDate,
        received_at: saved.receivedAt,
        invoice_type: saved.invoiceType,
        warehouse: saved.warehouse,
        payment_type: saved.paymentType,
        payment_term: saved.paymentTerm,
        due_date: saved.dueDate,
        subtotal: saved.subtotal,
        discount_type: saved.discountType,
        discount_value: saved.discountValue,
        discount_amount: saved.discountAmount,
        cashback: saved.cashback,
        other_fees: saved.otherFees,
        tax_percent: saved.taxPercent,
        tax_amount: saved.taxAmount,
        total: saved.total,
        notes: saved.notes,
        pkp_status: saved.pkpStatus,
        status: saved.status
      }).select().single();

      if (!invErr && invRow) {
        saved.id = invRow.id;
        const itemRows = saved.items.map(it => ({
          invoice_id: invRow.id,
          product_id: it.productId,
          product_name: it.productName,
          batch_no: it.batchNo,
          expiry: it.expiry,
          qty: it.qty,
          unit: it.unit,
          buy_price: it.buyPrice,
          discount_percent: it.discountPercent,
          tax_percent: it.taxPercent,
          cost_price: it.costPrice,
          subtotal: it.subtotal
        }));
        await supabase.from('purchase_items').insert(itemRows);
      }
    } catch (e) {}

    purchaseCache = [saved, ...purchaseCache.filter(p => p.id !== saved.id)];
    saveLocalPurchases(purchaseCache);
    return saved;
  },
  async update(id, invoiceData) {
    const existing = this.getById(id);
    if (!existing) throw new Error('Faktur tidak ditemukan.');

    // Adjust stock differences between old and new items
    const oldItemsMap = new Map();
    (existing.items || []).forEach(it => {
      oldItemsMap.set(it.productId, (oldItemsMap.get(it.productId) || 0) + Number(it.qty));
    });

    const newItemsMap = new Map();
    (invoiceData.items || []).forEach(it => {
      newItemsMap.set(it.productId, (newItemsMap.get(it.productId) || 0) + Number(it.qty));
    });

    // Handle products in new items
    for (const [prodId, newQty] of newItemsMap.entries()) {
      const oldQty = oldItemsMap.get(prodId) || 0;
      const delta = newQty - oldQty;
      if (delta > 0) {
        const item = invoiceData.items.find(i => i.productId === prodId);
        try {
          await rpc('change_stock', {
            product_id: prodId,
            mode: 'add',
            quantity: delta,
            batch_no: item?.batchNo || '-',
            expiry: item?.expiry || null,
            note: 'Revisi Faktur: ' + (invoiceData.invoiceNo || existing.invoiceNo)
          });
        } catch (e) {
          const prod = inventory.find(p => p.id === prodId);
          if (prod) {
            prod.stock = (prod.stock || 0) + delta;
            prod.availableStock = (prod.availableStock || 0) + delta;
          }
        }
      } else if (delta < 0) {
        try {
          await rpc('change_stock', {
            product_id: prodId,
            mode: 'subtract',
            quantity: Math.abs(delta),
            note: 'Revisi Pengurangan Faktur: ' + (invoiceData.invoiceNo || existing.invoiceNo)
          });
        } catch (e) {
          const prod = inventory.find(p => p.id === prodId);
          if (prod) {
            prod.stock = Math.max(0, (prod.stock || 0) + delta);
            prod.availableStock = Math.max(0, (prod.availableStock || 0) + delta);
          }
        }
      }
    }

    // Handle removed products completely
    for (const [prodId, oldQty] of oldItemsMap.entries()) {
      if (!newItemsMap.has(prodId) && oldQty > 0) {
        try {
          await rpc('change_stock', {
            product_id: prodId,
            mode: 'subtract',
            quantity: oldQty,
            note: 'Hapus Item Faktur: ' + existing.invoiceNo
          });
        } catch (e) {
          const prod = inventory.find(p => p.id === prodId);
          if (prod) {
            prod.stock = Math.max(0, (prod.stock || 0) - oldQty);
            prod.availableStock = Math.max(0, (prod.availableStock || 0) - oldQty);
          }
        }
      }
    }

    await refreshInventory().catch(() => {});

    const updated = {
      ...existing,
      invoiceNo: (invoiceData.invoiceNo || existing.invoiceNo).trim(),
      orderNo: (invoiceData.orderNo ?? existing.orderNo).trim(),
      supplierId: invoiceData.supplierId ?? existing.supplierId,
      supplierName: invoiceData.supplierName || existing.supplierName,
      invoiceDate: invoiceData.invoiceDate || existing.invoiceDate,
      receivedAt: invoiceData.receivedAt || existing.receivedAt,
      invoiceType: invoiceData.invoiceType || existing.invoiceType,
      warehouse: invoiceData.warehouse || existing.warehouse,
      paymentType: invoiceData.paymentType || existing.paymentType,
      paymentTerm: Number(invoiceData.paymentTerm ?? existing.paymentTerm ?? 0),
      dueDate: invoiceData.dueDate || existing.dueDate,
      subtotal: Number(invoiceData.subtotal ?? existing.subtotal ?? 0),
      discountType: invoiceData.discountType || existing.discountType,
      discountValue: Number(invoiceData.discountValue ?? existing.discountValue ?? 0),
      discountAmount: Number(invoiceData.discountAmount ?? existing.discountAmount ?? 0),
      cashback: Number(invoiceData.cashback ?? existing.cashback ?? 0),
      otherFees: Number(invoiceData.otherFees ?? existing.otherFees ?? 0),
      taxPercent: Number(invoiceData.taxPercent ?? existing.taxPercent ?? 0),
      taxAmount: Number(invoiceData.taxAmount ?? existing.taxAmount ?? 0),
      total: Number(invoiceData.total ?? existing.total ?? 0),
      notes: invoiceData.notes ?? existing.notes ?? '',
      pkpStatus: invoiceData.pkpStatus || existing.pkpStatus,
      updatedAt: new Date().toISOString(),
      items: (invoiceData.items || []).map((item, idx) => ({
        id: item.id || (idx + 1),
        productId: item.productId,
        productName: item.productName,
        batchNo: item.batchNo || '-',
        expiry: item.expiry || null,
        qty: Number(item.qty),
        unit: item.unit || 'pcs',
        buyPrice: Number(item.buyPrice || 0),
        discountPercent: Number(item.discountPercent || 0),
        taxPercent: Number(item.taxPercent || 0),
        costPrice: Number(item.costPrice || item.buyPrice || 0),
        subtotal: Number(item.subtotal || 0)
      }))
    };

    try {
      await supabase.from('purchase_invoices').update({
        invoice_no: updated.invoiceNo,
        order_no: updated.orderNo,
        supplier_id: updated.supplierId,
        supplier_name: updated.supplierName,
        invoice_date: updated.invoiceDate,
        received_at: updated.receivedAt,
        invoice_type: updated.invoiceType,
        warehouse: updated.warehouse,
        payment_type: updated.paymentType,
        payment_term: updated.paymentTerm,
        due_date: updated.dueDate,
        subtotal: updated.subtotal,
        discount_type: updated.discountType,
        discount_value: updated.discountValue,
        discount_amount: updated.discountAmount,
        cashback: updated.cashback,
        other_fees: updated.otherFees,
        tax_percent: updated.taxPercent,
        tax_amount: updated.taxAmount,
        total: updated.total,
        notes: updated.notes,
        pkp_status: updated.pkpStatus
      }).eq('id', updated.id);

      await supabase.from('purchase_items').delete().eq('invoice_id', updated.id);
      const itemRows = updated.items.map(it => ({
        invoice_id: updated.id,
        product_id: it.productId,
        product_name: it.productName,
        batch_no: it.batchNo,
        expiry: it.expiry,
        qty: it.qty,
        unit: it.unit,
        buy_price: it.buyPrice,
        discount_percent: it.discountPercent,
        tax_percent: it.taxPercent,
        cost_price: it.costPrice,
        subtotal: it.subtotal
      }));
      await supabase.from('purchase_items').insert(itemRows);
    } catch (e) {}

    purchaseCache = purchaseCache.map(p => (p.id === updated.id ? updated : p));
    saveLocalPurchases(purchaseCache);
    return updated;
  },
  async remove(id) {
    const existing = this.getById(id);
    if (!existing) return;

    // Deduct previously added stock
    for (const item of (existing.items || [])) {
      if (item.productId && item.qty > 0) {
        try {
          await rpc('change_stock', {
            product_id: item.productId,
            mode: 'subtract',
            quantity: Number(item.qty),
            note: 'Pembatalan Faktur: ' + existing.invoiceNo
          });
        } catch (e) {
          const prod = inventory.find(p => p.id === item.productId);
          if (prod) {
            prod.stock = Math.max(0, (prod.stock || 0) - Number(item.qty));
            prod.availableStock = Math.max(0, (prod.availableStock || 0) - Number(item.qty));
          }
        }
      }
    }
    await refreshInventory().catch(() => {});

    // Delete from Supabase
    try {
      await supabase.from('purchase_items').delete().eq('invoice_id', existing.id);
      await supabase.from('purchase_invoices').delete().eq('id', existing.id);
    } catch (e) {}

    // Delete from local cache
    purchaseCache = purchaseCache.filter(p => p.id !== existing.id && p.invoiceNo !== existing.invoiceNo);
    saveLocalPurchases(purchaseCache);
  }
};
