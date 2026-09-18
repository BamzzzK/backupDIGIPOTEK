import { auth,prepareRoute } from './store.js';
import { escapeHtml } from './utils.js';
import { closeModal } from './components/modal.js';
const routes={};let currentPage=null;let navigation=0;
export function registerRoute(path,handler,roles=null){routes[path]={handler,roles};}
export function navigate(path){window.location.hash=path;}
export function getCurrentRoute(){return window.location.hash.slice(1)||'/login';}
export function initRouter(){
 const handleRoute=async()=>{
  const ticket=++navigation;const path=getCurrentRoute();const session=auth.getSession();
  if(path!=='/login'&&!session){navigate('/login');return;}
  if(session&&!session.active&&path!=='/pending'){navigate('/pending');return;}
  if(session?.active&&['/login','/pending'].includes(path)){navigate(session.role==='owner'?'/dashboard':'/pos');return;}
  const route=routes[path];
  if(!route){navigate(session?'/pos':'/login');return;}
  if(route.roles&&!route.roles.includes(session?.role)){navigate('/pos');return;}
  currentPage?.destroy?.();currentPage=null;closeModal();
  document.getElementById('app').innerHTML='<div class="login-page"><p>Memuat data apotek…</p></div>';
  try{
   if(['/dashboard','/reports'].includes(path) && !window.Chart) window.Chart=(await import('chart.js/auto')).default;
   if(ticket!==navigation)return;
   if(session?.active)await prepareRoute(path);
   if(ticket!==navigation)return;
   currentPage=await route.handler();
  }catch(e){if(ticket!==navigation)return;document.getElementById('app').innerHTML=`<div class="login-page"><div class="login-card"><h2>Data belum dapat dimuat</h2><p>${escapeHtml(e.message)}</p><button id="retry-route" class="btn btn-primary">Coba lagi</button> <button id="error-out" class="btn btn-secondary">Keluar</button></div></div>`;document.getElementById('retry-route').onclick=handleRoute;document.getElementById('error-out').onclick=async()=>{await auth.logout();navigate('/login');};}
 };
 window.addEventListener('hashchange',handleRoute);
 window.addEventListener('apotek:signed-out',()=>{navigation++;currentPage?.destroy?.();closeModal();document.getElementById('app').innerHTML='';navigate('/login');handleRoute();});
 handleRoute();
}
