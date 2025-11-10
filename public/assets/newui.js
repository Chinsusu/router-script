// Minimal JS for the clean 3-tab GUI
console.info('[NewUI] Loaded. Bootstrap.Tab =', !!(window.bootstrap && bootstrap.Tab));

// Explicitly initialize tabs (anchors) to be safe
document.querySelectorAll('a[data-bs-toggle="tab"]').forEach((el)=>{
  try { window.bootstrap && bootstrap.Tab && bootstrap.Tab.getOrCreateInstance(el); } catch {}
  el.addEventListener('shown.bs.tab', (e)=>{
    console.info('[NewUI] Tab shown:', e.target?.id, '->', e.target?.getAttribute('href'));
  });
});

