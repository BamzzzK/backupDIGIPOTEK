import { createIcons, icons } from 'lucide';

// The bundled Lucide API needs the icon registry on every render call.
export const lucide = {
  createIcons(options = {}) {
    return createIcons({ ...options, icons });
  },
};
