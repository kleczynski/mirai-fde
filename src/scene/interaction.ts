/** Passive, bounded input. Scrolling stays native; touch never steers the sculpture. */
export function createInteractionController(host: HTMLElement) {
  const input = { x: 0, y: 0, scroll: 0, active: false };
  const fine = matchMedia('(pointer: fine)');
  const move = (event: PointerEvent) => {
    if (!fine.matches || event.pointerType === 'touch') return;
    const rect = host.getBoundingClientRect();
    input.x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
    input.y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
    input.active = true;
  };
  const leave = () => { input.active = false; input.x = 0; input.y = 0; };
  const scroll = () => { input.scroll = Math.min(1, window.scrollY / Math.max(1, innerHeight)); };
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('scroll', scroll, { passive: true });
  window.addEventListener('blur', leave);
  document.addEventListener('pointerleave', leave);
  return { input, dispose() { window.removeEventListener('pointermove', move); window.removeEventListener('scroll', scroll); window.removeEventListener('blur', leave); document.removeEventListener('pointerleave', leave); } };
}
