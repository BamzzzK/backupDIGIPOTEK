// ===== DigiPotek Modal Component =====

export function showModal({ title, content, size = '', onClose, footer }) {
  closeModal(); // Close any existing modal
  
  const container = document.getElementById('modal-container');
  const sizeClass = size ? `modal-${size}` : '';
  
  container.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal ${sizeClass}">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" id="modal-close-btn">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="modal-body">
          ${content}
        </div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons({ nodes: [container] });

  // Close handlers
  const closeBtn = document.getElementById('modal-close-btn');
  const overlay = document.getElementById('modal-overlay');
  
  closeBtn.addEventListener('click', () => {
    closeModal();
    if (onClose) onClose();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
      if (onClose) onClose();
    }
  });

  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      closeModal();
      if (onClose) onClose();
      document.removeEventListener('keydown', escHandler);
    }
  });
}

export function closeModal() {
  const container = document.getElementById('modal-container');
  container.innerHTML = '';
}
