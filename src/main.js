function renderShell(root) {
  root.innerHTML = `
    <main class="deck-page">
      <section class="deck-stage" aria-label="Cassette deck">
        <p>Side B — cassette deck coming online</p>
      </section>
      <aside class="deck-panel" aria-label="Track tray and controls">
        <div class="panel-card">Track tray</div>
        <div class="panel-card">Tape controls</div>
      </aside>
    </main>
  `;
}

function boot() {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("missing #app root element");
  }
  renderShell(root);
  console.info("Side B booted");
}

boot();
