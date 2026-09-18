import {test,mock,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {lucide} from '../src/icons.js';
import {closeModal} from '../src/components/modal.js';
const dom=new Window({url:'http://localhost/'});
Object.assign(globalThis,{window:dom,document:dom.document,localStorage:dom.localStorage,sessionStorage:dom.sessionStorage,lucide});window.lucide=lucide;
let controller,stockCalls,stockHandler,historyCalls,historyHandler;
const identity={id:'cashier',role:'kasir',active:true,name:'Petugas'};
const product={id:'p1',name:'Obat <img src=x>',category:'obat',unit:'strip',stock:3,minStock:1,buyPrice:100,sellPrice:200,batches:[]};
const sale=(id)=>({id,trxNo:id,cashier:'Petugas <img src=x>',createdAt:'2026-09-18T02:00:00Z',total:200,subtotal:200,discount:0,paymentMethod:'tunai',amountPaid:500,change:300,items:[{name:'Obat <img src=x>',qty:1,price:200,subtotal:200}]});
await mock.module('../src/store.js',{namedExports:{
  auth:{getSession:()=>identity,isOwner:()=>identity.role==='owner'},prepareRoute:async()=>{},
  products:{getAll:()=>[product],getById:()=>product,search:()=>[product],getExpiringSoon:()=>[],
    addStock:async(...args)=>{stockCalls.push(args);await stockHandler();}},
  transactions:{loadRange:async(...args)=>{historyCalls.push(args);return historyHandler();}}
}});
const {renderStock}=await import('../src/pages/stock.js');
const {renderHistory}=await import('../src/pages/history.js');
const settle=()=>new Promise(r=>setTimeout(r,20));
beforeEach(()=>{
  document.body.innerHTML='<div id="app"></div><div id="toast-container"></div><div id="modal-container"></div>';
  identity.role='kasir';stockCalls=[];historyCalls=[];stockHandler=async()=>{};historyHandler=async()=>[sale('SALE-1')];
});
afterEach(()=>{controller?.destroy?.();controller=null;closeModal();dom.happyDOM.abort();});
test('cashier menus expose stock, purchases and history without owner settings',()=>{
  controller=renderStock();
  for(const path of ['/stock','/purchases','/history'])assert.ok(document.querySelector(`a[href="#${path}"]`));
  for(const path of ['/staff','/products','/reports','/dashboard'])assert.equal(document.querySelector(`a[href="#${path}"]`),null);
  assert.ok(document.querySelector('[data-action="receive"]'));assert.ok(document.querySelector('[data-action="view-batch"]'));
  assert.equal(document.querySelector('[data-action="adjust"]'),null);
});
test('cashier stock entry validates medicine expiry and double clicks send once with batch data',async()=>{
  let resolve;stockHandler=()=>new Promise(r=>{resolve=r;});
  controller=renderStock();document.querySelector('[data-action="receive"]').click();
  document.getElementById('receive-qty').value='4';document.getElementById('receive-batch').value='CASHIER-BATCH';
  const button=document.getElementById('receive-save');button.click();await settle();
  assert.equal(stockCalls.length,0);
  document.getElementById('receive-expiry').value='2035-01-01';button.click();button.click();
  assert.deepEqual(stockCalls,[['p1',4,'CASHIER-BATCH','2035-01-01']]);assert.equal(button.disabled,true);
  resolve();await settle();assert.equal(document.getElementById('receive-stock-form'),null);
});
test('history shows searchable receipts and escaped detail, with date filters and pagination',async()=>{
  historyHandler=async()=>Array.from({length:21},(_,i)=>sale(`SALE-${String(i).padStart(2,'0')}`));
  controller=renderHistory();await settle();
  assert.match(document.querySelector('.header-title').textContent,/yang kamu layani/);
  assert.equal(document.querySelectorAll('[data-history-id]').length,20);
  document.getElementById('history-next').click();assert.equal(document.querySelectorAll('[data-history-id]').length,1);
  const search=document.getElementById('history-search');search.value='SALE-00';search.dispatchEvent(new dom.Event('input'));
  assert.equal(document.querySelectorAll('[data-history-id]').length,1);
  document.querySelector('[data-history-id]').click();
  assert.equal(document.querySelector('#modal-container img'),null);
  assert.ok(document.getElementById('modal-container').textContent.includes('Obat <img src=x>'));
  assert.match(document.getElementById('modal-container').textContent,/Rp 300/);
  document.getElementById('history-from').value='2026-08-01';document.getElementById('history-to').value='2026-08-30';
  document.getElementById('history-filter').dispatchEvent(new dom.Event('submit',{cancelable:true}));await settle();
  assert.deepEqual(historyCalls.at(-1),['2026-08-01','2026-08-30']);
});
test('late history response cannot render after leaving the page',async()=>{
  let resolve;historyHandler=()=>new Promise(r=>{resolve=r;});controller=renderHistory();
  controller.destroy();document.getElementById('app').innerHTML='<p>Halaman lain</p>';
  resolve([sale('LATE')]);await settle();
  assert.equal(document.getElementById('app').textContent,'Halaman lain');
});
