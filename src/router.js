// ===== DigiPotek Hash Router =====
import { auth } from './store.js';

const routes = {};
let currentPage = null;

export function registerRoute(path, handler, roles = null) {
  routes[path] = { handler, roles };
}

export function navigate(path) {
  window.location.hash = path;
}

export function getCurrentRoute() {
  return window.location.hash.slice(1) || '/login';
}

export function initRouter() {
  const handleRoute = () => {
    const path = getCurrentRoute();
    const session = auth.getSession();

    // Not logged in → redirect to login
    if (path !== '/login' && !session) {
      navigate('/login');
      return;
    }

    // Already logged in and on login page → redirect based on role
    if (path === '/login' && session) {
      navigate(session.role === 'owner' ? '/dashboard' : '/pos');
      return;
    }

    // Route guard: check role access
    const route = routes[path];
    if (!route) {
      navigate(session ? (session.role === 'owner' ? '/dashboard' : '/pos') : '/login');
      return;
    }

    if (route.roles && session && !route.roles.includes(session.role)) {
      navigate('/pos');
      return;
    }

    // Render the page
    if (currentPage && currentPage.destroy) {
      currentPage.destroy();
    }
    currentPage = route.handler();
  };

  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}
