(() => {
  const style = document.createElement("style");
  style.textContent = `.gp-offer{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:#071b2088;padding:20px;opacity:0;transition:.28s}.gp-offer.show{opacity:1}.gp-offer-card{max-width:480px;width:100%;background:#fffdf7;border-radius:22px;padding:34px;box-shadow:0 24px 70px #0005;position:relative;transform:translateY(18px);transition:.28s}.show .gp-offer-card{transform:none}.gp-offer-close{position:absolute;right:14px;top:12px;border:0;background:transparent;font-size:26px;cursor:pointer}.gp-offer-tag{color:#e92768;font-weight:800;font-size:12px;letter-spacing:.12em}.gp-offer h2{margin:12px 0 8px;font-size:28px}.gp-offer p{color:#58606e}.gp-offer a,.gp-offer-mini{display:inline-block;background:#e92768;color:white;border-radius:9px;padding:12px 16px;font-weight:800;text-decoration:none}.gp-offer-mini{position:fixed;right:18px;top:84px;z-index:900;border:0;box-shadow:0 8px 24px #0003;cursor:pointer;max-width:190px;text-align:left;animation:gpPulse 2.5s infinite}.gp-offer-mini small{display:block;font-weight:500;margin-top:3px}@keyframes gpPulse{50%{transform:translateY(-3px)}}`;
  document.head.append(style);
  fetch("/api/content")
    .then((r) => r.json())
    .then(({ items }) => {
      const offer = items
        .filter(
          (x) =>
            ["webinar", "class"].includes(x.type) &&
            x.offerEnabled &&
            x.joinEnabled !== false &&
            (!x.scheduledAt || new Date(x.scheduledAt) >= new Date()),
        )
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt) -
            new Date(a.updatedAt || a.createdAt),
        )[0];
      if (!offer) return;
      const jump = () => {
        document
          .querySelector("#webinars")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        document.querySelector("#sessionsGrid")?.classList.add("offer-focus");
        setTimeout(
          () =>
            document
              .querySelector("#sessionsGrid")
              ?.classList.remove("offer-focus"),
          1400,
        );
      };
      const mini = document.createElement("button");
      mini.className = "gp-offer-mini";
      mini.innerHTML = `Latest offer<small>${offer.title}</small>`;
      mini.onclick = jump;
      document.body.append(mini);
      const modal = document.createElement("div");
      modal.className = "gp-offer";
      modal.innerHTML = `<div class="gp-offer-card"><button class="gp-offer-close" aria-label="Close offer">×</button><div class="gp-offer-tag">LIMITED LIVE OFFER</div><h2>${offer.title}</h2><p>${offer.excerpt || "Reserve your seat in this live learning session."}</p><p><b>${offer.amount ? "Fee: ₹" + offer.amount : "Free session"}</b></p><a href="register.html?webinar=${encodeURIComponent(offer.id)}">Reserve my seat</a></div>`;
      document.body.append(modal);
      requestAnimationFrame(() => modal.classList.add("show"));
      modal.querySelector(".gp-offer-close").onclick = () => {
        modal.classList.remove("show");
        setTimeout(() => modal.remove(), 300);
      };
      modal.onclick = (e) => {
        if (e.target === modal) modal.querySelector(".gp-offer-close").click();
      };
    })
    .catch(() => {});
})();
