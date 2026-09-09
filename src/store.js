// ===== DigiPotek Data Store (localStorage) =====
import { generateId, today } from './utils.js';
import { seedProducts } from './data/seed.js';

const STORE_KEYS = {
  users: 'dp_users',
  products: 'dp_products',
  transactions: 'dp_transactions',
  stockLog: 'dp_stock_log',
  settings: 'dp_settings',
  auth: 'dp_auth',
};

// ===== Generic CRUD =====
function getAll(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

function saveAll(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function getById(key, id) {
  return getAll(key).find(item => item.id === id);
}

function add(key, item) {
  const data = getAll(key);
  item.id = item.id || generateId();
  item.createdAt = item.createdAt || new Date().toISOString();
  data.push(item);
  saveAll(key, data);
  return item;
}

function update(key, id, updates) {
  const data = getAll(key);
  const idx = data.findIndex(item => item.id === id);
  if (idx === -1) return null;
  data[idx] = { ...data[idx], ...updates, updatedAt: new Date().toISOString() };
  saveAll(key, data);
  return data[idx];
}

function remove(key, id) {
  const data = getAll(key).filter(item => item.id !== id);
  saveAll(key, data);
}

// ===== Auth =====
export const auth = {
  login(username, password) {
    const users = getAll(STORE_KEYS.users);
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
      const session = { id: user.id, username: user.username, name: user.name, role: user.role };
      localStorage.setItem(STORE_KEYS.auth, JSON.stringify(session));
      return session;
    }
    return null;
  },
  logout() {
    localStorage.removeItem(STORE_KEYS.auth);
  },
  getSession() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEYS.auth));
    } catch {
      return null;
    }
  },
  isLoggedIn() {
    return !!this.getSession();
  },
  isOwner() {
    const s = this.getSession();
    return s && s.role === 'owner';
  }
};

// ===== Users =====
export const users = {
  getAll: () => getAll(STORE_KEYS.users),
  getById: (id) => getById(STORE_KEYS.users, id),
  add: (user) => add(STORE_KEYS.users, user),
  update: (id, data) => update(STORE_KEYS.users, id, data),
  remove: (id) => remove(STORE_KEYS.users, id),
};

// ===== Products =====
export const products = {
  getAll: () => getAll(STORE_KEYS.products).filter(p => !p.deleted),
  getById: (id) => getById(STORE_KEYS.products, id),
  add: (product) => add(STORE_KEYS.products, product),
  update: (id, data) => update(STORE_KEYS.products, id, data),
  remove: (id) => update(STORE_KEYS.products, id, { deleted: true }),
  search(query, category = '') {
    let data = this.getAll();
    if (category) data = data.filter(p => p.category === category);
    if (query) {
      const q = query.toLowerCase();
      data = data.filter(p => p.name.toLowerCase().includes(q));
    }
    return data;
  },
  getLowStock() {
    return this.getAll().filter(p => p.stock <= p.minStock && p.stock > 0);
  },
  getOutOfStock() {
    return this.getAll().filter(p => p.stock <= 0);
  },
  getExpiringSoon(days = 90) {
    const now = new Date();
    const limit = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return this.getAll().filter(p => {
      if (!p.batches || p.batches.length === 0) return false;
      return p.batches.some(b => new Date(b.expiry) <= limit && new Date(b.expiry) >= now);
    });
  },
  addStock(id, qty, batchNo, expiry) {
    const product = this.getById(id);
    if (!product) return null;
    const batches = product.batches || [];
    batches.push({ id: generateId(), batchNo, expiry, qty, addedAt: new Date().toISOString() });
    const newStock = (product.stock || 0) + qty;
    return update(STORE_KEYS.products, id, { stock: newStock, batches });
  }
};

// ===== Transactions =====
export const transactions = {
  getAll: () => getAll(STORE_KEYS.transactions),
  getById: (id) => getById(STORE_KEYS.transactions, id),
  add(trx) {
    // Deduct stock for each item
    trx.items.forEach(item => {
      const product = products.getById(item.productId);
      if (product) {
        const newStock = Math.max(0, (product.stock || 0) - item.qty);
        update(STORE_KEYS.products, item.productId, { stock: newStock });
      }
    });
    // Calculate margin
    trx.totalCost = trx.items.reduce((sum, i) => sum + (i.costPrice * i.qty), 0);
    trx.margin = trx.total - trx.totalCost;
    return add(STORE_KEYS.transactions, trx);
  },
  getByDateRange(startDate, endDate) {
    return this.getAll().filter(trx => {
      const d = trx.createdAt.split('T')[0];
      return d >= startDate && d <= endDate;
    });
  },
  getToday() {
    return this.getByDateRange(today(), today());
  }
};

// ===== Stock Log =====
export const stockLog = {
  getAll: () => getAll(STORE_KEYS.stockLog),
  add: (log) => add(STORE_KEYS.stockLog, log),
};

// ===== Settings =====
export const settings = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEYS.settings)) || this.defaults();
    } catch {
      return this.defaults();
    }
  },
  save(data) {
    localStorage.setItem(STORE_KEYS.settings, JSON.stringify(data));
  },
  defaults() {
    return {
      pharmacyName: 'DigiPotek Apotek',
      address: 'Jl. Kesehatan No. 1, Jakarta',
      phone: '021-12345678',
      receiptHeader: 'Terima Kasih',
      receiptFooter: 'Semoga Lekas Sembuh',
    };
  }
};

// ===== Initialize Seed Data =====
export function initializeData() {
  // Seed users if empty
  if (getAll(STORE_KEYS.users).length === 0) {
    saveAll(STORE_KEYS.users, [
      { id: 'user_owner', username: 'owner', password: 'owner123', name: 'Pemilik Apotek', role: 'owner', createdAt: new Date().toISOString() },
      { id: 'user_kasir', username: 'kasir', password: 'kasir123', name: 'Kasir 1', role: 'kasir', createdAt: new Date().toISOString() },
    ]);
  }

  // Seed products if empty
  if (getAll(STORE_KEYS.products).length === 0) {
    const prods = seedProducts.map(p => ({
      ...p,
      id: generateId(),
      createdAt: new Date().toISOString(),
    }));
    saveAll(STORE_KEYS.products, prods);
  }

  // Seed settings if empty
  if (!localStorage.getItem(STORE_KEYS.settings)) {
    settings.save(settings.defaults());
  }

  // Seed some sample transactions if empty (for demo dashboard)
  if (getAll(STORE_KEYS.transactions).length === 0) {
    const prods = products.getAll();
    const sampleTrx = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const numTrx = Math.floor(Math.random() * 4) + 2;
      for (let j = 0; j < numTrx; j++) {
        const numItems = Math.floor(Math.random() * 3) + 1;
        const items = [];
        for (let k = 0; k < numItems; k++) {
          const prod = prods[Math.floor(Math.random() * prods.length)];
          const qty = Math.floor(Math.random() * 3) + 1;
          items.push({
            productId: prod.id,
            name: prod.name,
            qty,
            price: prod.sellPrice,
            costPrice: prod.buyPrice,
            subtotal: prod.sellPrice * qty,
          });
        }
        const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
        const totalCost = items.reduce((s, i) => s + (i.costPrice * i.qty), 0);
        const methods = ['tunai', 'qris', 'transfer'];
        d.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60));
        sampleTrx.push({
          id: generateId(),
          trxNo: `TRX${d.getFullYear().toString().slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(j+1).padStart(4,'0')}`,
          items,
          subtotal,
          discount: 0,
          total: subtotal,
          totalCost,
          margin: subtotal - totalCost,
          paymentMethod: methods[Math.floor(Math.random() * methods.length)],
          amountPaid: subtotal,
          change: 0,
          cashier: 'Kasir 1',
          createdAt: d.toISOString(),
        });
      }
    }
    saveAll(STORE_KEYS.transactions, sampleTrx);
  }
}
