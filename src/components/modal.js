let activeModal = null;

export function showModal(optionsOrTitle, maybeContent = '', maybeSize = '') {
  closeModal();
  const options=typeof optionsOrTitle==='string' ? {title:optionsOrTitle,content:maybeContent,size:maybeSize} : (optionsOrTitle||{});
  const {title,content,size='',onClose,footer}=options;
  const previousFocus=document.activeElement;
  const container=document.getElementById('modal-container');
  container.innerHTML=`<div class="modal-overlay" id="modal-overlay">
    <div class="modal ${size ? `modal-${size}` : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">
      <div class="modal-header"><h3 id="modal-title">${title}</h3>
        <button class="modal-close" id="modal-close-btn" data-close-modal aria-label="Tutup dialog"><i data-lucide="x"></i></button></div>
      <div class="modal-body">${content}</div>${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div></div>`;
  const dialog=container.querySelector('[role="dialog"]');
  const focusable=()=>[...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>!el.hidden);
  const keydown=event=>{
    if(event.key==='Escape') {event.preventDefault();closeModal();return;}
    if(event.key!=='Tab') return;
    const nodes=focusable(),first=nodes[0],last=nodes.at(-1);
    if(!first) {event.preventDefault();dialog.focus();return;}
    if(event.shiftKey && (document.activeElement===first || !dialog.contains(document.activeElement))) {event.preventDefault();last.focus();}
    else if(!event.shiftKey && (document.activeElement===last || !dialog.contains(document.activeElement))) {event.preventDefault();first.focus();}
  };
  const click=event=>{if(event.target.id==='modal-overlay' || event.target.closest('[data-close-modal]'))closeModal();};
  document.addEventListener('keydown',keydown);
  container.addEventListener('click',click);
  activeModal={onClose,previousFocus,cleanup(){document.removeEventListener('keydown',keydown);container.removeEventListener('click',click);}};
  if(window.lucide) lucide.createIcons({nodes:[container]});
  (dialog.querySelector('[autofocus]') || dialog.querySelector('.modal-body input,.modal-body select,.modal-body textarea') || focusable()[0] || dialog).focus();
}

export function closeModal() {
  const current=activeModal;
  activeModal=null;
  current?.cleanup();
  const container=document.getElementById('modal-container');
  if(container) container.innerHTML='';
  if(current?.previousFocus?.isConnected) current.previousFocus.focus();
  current?.onClose?.();
}
