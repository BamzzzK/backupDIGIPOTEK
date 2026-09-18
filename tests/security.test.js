import {test,mock,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {lucide} from '../src/icons.js';
import {csvCell,businessDateTime} from '../src/utils.js';
import {showModal,closeModal} from '../src/components/modal.js';
const dom=new Window({url:'http://localhost/'});
Object.assign(globalThis,{window:dom,document:dom.document,localStorage:dom.localStorage,sessionStorage:dom.sessionStorage,lucide});
window.lucide=lucide;
const malicious='<img src=x onerror="alert(1)">';
let controller,ranges;
const sale={id:'test-sale',trxNo:'TEST-001',cashier:malicious,createdAt:'2026-09-18T01:00:00Z',paymentMethod:'tunai',
  total:200,totalCost:100,margin:100,subtotal:200,discount:0,items:[{name:malicious,qty:1,price:200,subtotal:200}]};
await mock.module('../src/store.js',{namedExports:{
  auth:{isOwner:()=>true,getSession:()=>({name:'Owner',role:'owner',active:true})},
  prepareRoute:async()=>{},
  transactions:{loadRange:async(from,to)=>{ranges.push([from,to]);return [sale];},getById:()=>sale}
}});
const {renderReports}=await import('../src/pages/reports.js');
const settle=()=>new Promise(r=>setTimeout(r,15));
beforeEach(()=>{
  document.body.innerHTML='<button id="opener">Open</button><div id="app"></div><div id="toast-container"></div><div id="modal-container"></div>';
  globalThis.Chart=class {static getChart(){return null;}};ranges=[];
});
afterEach(()=>{controller?.destroy?.();controller=null;closeModal();dom.happyDOM.abort();delete globalThis.Chart;});
test('cashier and product names remain text in report and transaction dialog',async()=>{
  controller=renderReports();await settle();
  assert.equal(document.querySelector('#report-table img'),null);
  assert.ok(document.getElementById('report-table').textContent.includes(malicious));
  document.querySelector('[data-action="view-trx"]').click();
  assert.equal(document.querySelector('#modal-container img'),null);
  assert.ok(document.getElementById('modal-container').textContent.includes(malicious));
});
test('7-day and 30-day report presets cover exactly the labelled number of dates',async()=>{
  controller=renderReports();await settle();
  const span=([from,to])=>(Date.parse(to)-Date.parse(from))/86400000+1;
  assert.equal(span(ranges.at(-1)),7);
  document.querySelector('[data-preset="30d"]').click();await settle();
  assert.equal(span(ranges.at(-1)),30);
});
test('CSV neutralizes formulas after whitespace and quotes embedded delimiters',()=>{
  for(const value of ['=1+1','  =1+1','\t+SUM(1,2)','\r\n@SUM(1)','\uFEFF-1+2']) assert.ok(csvCell(value).startsWith('"\''));
  assert.equal(csvCell('obat,"A"'),'"obat,""A"""');
  assert.equal(csvCell(120),'"120"');
  assert.equal(businessDateTime('2026-09-17T18:30:00Z'),'2026-09-18T01:30');
});
test('all modal close paths clean up and Escape affects only the current dialog',()=>{
  let closed=0;
  const opener=document.getElementById('opener');opener.focus();
  showModal({title:'First',content:'<button data-close-modal>Close</button>',onClose:()=>closed++});
  document.querySelector('.modal-body button').click();
  assert.equal(closed,1);assert.equal(document.activeElement,opener);
  showModal({title:'Second',content:'<input id="field"><button id="last">Last</button>',onClose:()=>closed++});
  document.getElementById('last').focus();
  document.dispatchEvent(new dom.KeyboardEvent('keydown',{key:'Tab',cancelable:true}));
  assert.equal(document.activeElement.id,'modal-close-btn');
  document.dispatchEvent(new dom.KeyboardEvent('keydown',{key:'Escape'}));
  document.dispatchEvent(new dom.KeyboardEvent('keydown',{key:'Escape'}));
  assert.equal(closed,2);assert.equal(document.querySelector('[role="dialog"]'),null);
});
