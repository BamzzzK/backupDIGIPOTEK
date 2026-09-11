import {test,mock,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {lucide} from '../src/icons.js';
const dom=new Window({url:'http://localhost/'});
Object.assign(globalThis,{window:dom,document:dom.document,localStorage:dom.localStorage,sessionStorage:dom.sessionStorage,lucide});
window.lucide=lucide;
let product,attempts,failures,controller;
const identity={id:'test-owner',name:'Owner',role:'owner',active:true};
const productStore={getAll:()=>[product],getById:()=>product,search:()=>[product],getLowStock:()=>[],getOutOfStock:()=>[],getExpiringSoon:()=>[],update:async(id,data)=>{product={...product,...data};},add:async data=>{product={...product,...data};},addStock:async(id,qty)=>{product.stock+=qty;},remove:async()=>{},adjust:async(id,mode,qty)=>{product.stock+=mode==='add'?qty:-qty;}};
await mock.module('../src/store.js',{namedExports:{
 auth:{getSession:()=>identity,isOwner:()=>true},prepareRoute:async()=>{},products:productStore,
 refreshInventory:async()=>{},settings:{get:()=>({pharmacyName:'Apotek Test',address:'',phone:'',receiptHeader:'Terima Kasih',receiptFooter:''})},
 transactions:{getToday:()=>[],getByDateRange:()=>[],add:async trx=>{attempts.push(trx);if(failures.length)throw failures.shift();product.stock-=trx.items[0].qty;product.availableStock=product.stock;return {...trx,id:'saved-id',trxNo:'SERVER-001',createdAt:'2026-09-09T01:00:00Z',total:200,subtotal:200,discount:0,amountPaid:500,change:300,cashier:'Owner'};}}
}});
const {renderDashboard}=await import('../src/pages/dashboard.js');
const {renderPOS}=await import('../src/pages/pos.js');
const {renderProducts}=await import('../src/pages/products.js');
const {businessDate,escapeHtml}=await import('../src/utils.js');
const settle=()=>new Promise(r=>setTimeout(r,20));
beforeEach(()=>{document.body.innerHTML='<div id="app"></div><div id="toast-container"></div><div id="modal-container"></div>';sessionStorage.clear();attempts=[];failures=[];product={id:'p1',name:'Test <img src=x>',category:'obat',unit:'strip',stock:5,availableStock:5,minStock:1,buyPrice:100,sellPrice:200,batches:[]};});
afterEach(()=>{controller?.destroy?.();controller=null;delete globalThis.Chart;dom.happyDOM.abort();});
function openPayment(){controller=renderPOS();document.querySelector('.pos-product-card').click();document.getElementById('btn-pay').click();document.getElementById('pay-amount').value='500';}
test('dashboard renders bundled Lucide icons and reaches chart initialization',()=>{
 const charts=[];
 globalThis.Chart=class {constructor(canvas){charts.push(canvas);}static getChart(){return null;}};
 controller=renderDashboard();
 assert.match(document.querySelector('.header-title').textContent,/Dashboard/);
 assert.ok(document.querySelector('svg[data-lucide="trending-up"]')?.childElementCount > 0);
 assert.ok(document.querySelector('svg[data-lucide="log-out"]'));
 assert.equal(document.querySelector('i[data-lucide]'),null);
 assert.deepEqual(charts,[document.getElementById('sales-chart')]);
});
test('double-click submits once and receipt uses committed server response',async()=>{
 openPayment();assert.ok(document.querySelector('#modal-container svg[data-lucide="x"]'));const button=document.getElementById('btn-confirm-pay');button.click();button.click();await settle();
 assert.equal(attempts.length,1);assert.equal(product.stock,4);assert.match(document.getElementById('receipt-content').textContent,/SERVER-001/);assert.equal(document.querySelector('#receipt-content img'),null);assert.equal(sessionStorage.getItem('apotek_pending_checkout:test-owner'),null);
});
test('network retry preserves checkout request ID',async()=>{
 failures=[new Error('Network interrupted')];openPayment();document.getElementById('btn-confirm-pay').click();await settle();
 assert.ok(sessionStorage.getItem('apotek_pending_checkout:test-owner'));document.getElementById('btn-confirm-pay').click();await settle();
 assert.equal(attempts.length,2);assert.equal(attempts[0].requestId,attempts[1].requestId);assert.equal(product.stock,4);
});
test('database rejection clears pending command without changing stock',async()=>{
 failures=[Object.assign(new Error('Stok tidak cukup'),{rejected:true})];openPayment();document.getElementById('btn-confirm-pay').click();await settle();assert.equal(product.stock,5);assert.equal(sessionStorage.getItem('apotek_pending_checkout:test-owner'),null);assert.equal(document.getElementById('btn-confirm-pay'),null);
});
test('product edits await database completion',async()=>{
 controller=renderProducts();document.querySelector('[data-action="edit"]').click();document.getElementById('pf-name').value='Updated';document.getElementById('btn-save-product').click();await settle();assert.equal(product.name,'Updated');assert.match(document.getElementById('app').textContent,/Updated/);
});
test('WIB date and HTML attribute escaping',()=>{
 assert.equal(businessDate('2026-09-08T18:00:00Z'),'2026-09-09');assert.equal(escapeHtml('"<x>&'), '&quot;&lt;x&gt;&amp;');
});
