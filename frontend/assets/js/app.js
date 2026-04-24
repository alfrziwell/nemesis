(() => {
  const API_BASE_URL = ("https://backend-kelompok-4.vercel.app/api" || window.DASHBOARD_API_BASE_URL || "http://127.0.0.1:3000/api").replace(/\/$/, "");

  if (!window.maplibregl || !window.AuditMap) {
    console.error("MapLibre GL or AuditMap failed to load.");
    return;
  }

  const state = {
    mapFilter: "central",
    tab: "all",
    selectedAreaKey: "region-jawa-barat-kota-cimahi",
    selectedOwnerKey: null,
    search: "",
    sortBy: "waste",
    modalRequestId: 0,
    modal: {
      areaType: "region",
      areaKey: null,
      ownerName: "",
      page: 1,
      pageSize: 25,
      search: "",
      ownerType: "",
      severity: "",
      priorityOnly: false,
    },
  };

  const dom = {
    kpi: document.getElementById("kpi"),
    mapRoot: document.getElementById("map"),
    mapFilters: document.getElementById("mf"),
    tabs: document.getElementById("tabs"),
    legend: document.getElementById("legend"),
    sidebarContent: document.getElementById("sbc"),
    modal: document.getElementById("rupModal"),
    modalTop: document.getElementById("modalTop"),
    modalBody: document.getElementById("modalBody"),
  };

  if (Object.values(dom).some((element) => !element)) {
    console.error("Dashboard shell is incomplete.");
    return;
  }

  const FILTERS = [
    { key: "central", label: "Kementerian/Lembaga" },
    { key: "provinsi", label: "Pemprov" },
    { key: "kabkota", label: "Pemkot" },
    { key: "other", label: "Others" },
  ];

  const TABS = [
    { key: "all", label: "Semua" },
    { key: "kabupaten", label: "Kabupaten" },
    { key: "kota", label: "Kota" },
  ];

  const SEVERITY_FILTERS = [
    { key: "", label: "Semua Severity" },
    { key: "low", label: "Low" },
    { key: "med", label: "Medium" },
    { key: "high", label: "High" },
    { key: "absurd", label: "Absurd" },
  ];

  let cimahiOwnersCache = null;
  let cimahiOwnersCacheTime = 0;

  async function getCimahiOwners() {
    // Cache untuk 30 detik
    const now = Date.now();
    if (cimahiOwnersCache && (now - cimahiOwnersCacheTime) < 30000) {
      return cimahiOwnersCache;
    }

    try {
      // Load all packages for Kota Cimahi
      const params = new URLSearchParams({
        page: "1",
        pageSize: "1000",
      });
      
      const response = await fetchJson(`/regions/region-jawa-barat-kota-cimahi/packages?${params.toString()}`);
      const packages = response.items || [];
      
      // Group packages by owner
      const ownerMap = new Map();
      
      packages.forEach((pkg) => {
        const ownerName = pkg.ownerName || "Unknown";
        if (!ownerMap.has(ownerName)) {
          ownerMap.set(ownerName, {
            ownerName,
            ownerType: "central",
            totalPackages: 0,
            totalPriorityPackages: 0,
            totalPotentialWaste: 0,
            totalBudget: 0,
            severityCounts: { high: 0, absurd: 0 },
          });
        }
        
        const owner = ownerMap.get(ownerName);
        owner.totalPackages += 1;
        owner.totalBudget += (pkg.budget || 0);
        owner.totalPotentialWaste += (pkg.audit?.potensiPemborosan || 0);
        
        if (pkg.meta?.isPriority) {
          owner.totalPriorityPackages += 1;
        }
        
        if (pkg.audit?.severity === "high") {
          owner.severityCounts.high += 1;
        } else if (pkg.audit?.severity === "absurd") {
          owner.severityCounts.absurd += 1;
        }
      });
      
      cimahiOwnersCache = Array.from(ownerMap.values());
      cimahiOwnersCacheTime = now;
      return cimahiOwnersCache;
    } catch (error) {
      console.warn("Failed to load Cimahi owners:", error);
      return [];
    }
  }

  let dashboardData = null;
  let regionsByKey = new Map();
  let provincesByKey = new Map();

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeJsString(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n");
  }

  function jsArg(value) {
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    if (typeof value === "number") {
      return String(value);
    }
    return `'${escapeJsString(value)}'`;
  }

  function actionCall(action, ...args) {
    return escapeAttr(`dashboardActions.${action}(${args.map(jsArg).join(",")})`);
  }

  function actionExpr(expression) {
    return escapeAttr(expression);
  }

  function normalizeSourceId(sourceId) {
    if (sourceId === null || sourceId === undefined) {
      return null;
    }

    const normalized = String(sourceId).trim();
    if (!/^\d+$/.test(normalized)) {
      return null;
    }

    const parsed = Number(normalized);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      return null;
    }

    return String(parsed);
  }

  function buildInaprocUrl(sourceId) {
    const kode = normalizeSourceId(sourceId);
    return kode ? `https://data.inaproc.id/rup?kode=${encodeURIComponent(kode)}` : null;
  }

  function isProvinceView() {
    return state.mapFilter === "provinsi";
  }

  function isCentralOwnerMode() {
    return state.mapFilter === "central";
  }

  function currentAreaType() {
    return isProvinceView() ? "province" : "region";
  }

  function formatCompactCurrency(value) {
    const amount = Number(value) || 0;
    const abs = Math.abs(amount);
    if (abs >= 1e12) return `${(amount / 1e12).toFixed(amount % 1e12 === 0 ? 0 : 1)} T`;
    if (abs >= 1e9) return `${(amount / 1e9).toFixed(amount % 1e9 === 0 ? 0 : 1)} B`;
    if (abs >= 1e6) return `${(amount / 1e6).toFixed(amount % 1e6 === 0 ? 0 : 1)} M`;
    if (abs >= 1e3) return `${(amount / 1e3).toFixed(amount % 1e3 === 0 ? 0 : 1)} K`;
    return `${amount.toFixed(0)}`;
  }

  function formatCurrencyLong(value) {
    const number = Math.round(Number(value) || 0);
    return `Rp ${number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
  }

  function formatNumber(value) {
    const number = Math.round(Number(value) || 0);
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function formatDecimal(value) {
    const amount = Number(value) || 0;
    return amount % 1 === 0 ? formatNumber(amount) : amount.toFixed(2).replace(".", ",");
  }

  function ownerTypeLabel(value) {
    if (value === "central") return "Kementerian/Lembaga";
    if (value === "provinsi") return "Pemprov";
    if (value === "kabkota") return "Pemkot";
    if (value === "other") return "Others";
    return "Tidak diketahui";
  }

  function ownerTypeCount(area, ownerType) {
    return Number(area && area.ownerMix ? area.ownerMix[ownerType] : 0) || 0;
  }

  function ownerMixSummary(area) {
    return `K/L ${formatNumber(ownerTypeCount(area, "central"))} | Pemprov ${formatNumber(
      ownerTypeCount(area, "provinsi")
    )} | Pemkot ${formatNumber(ownerTypeCount(area, "kabkota"))} | Others ${formatNumber(
      ownerTypeCount(area, "other")
    )}`;
  }

  function areaOwnerSummary(area) {
    return `${activeSidebarOwnerLabel()} saja`;
  }

  function areaBadgeLabel(area) {
    if (area.regionType === "Provinsi") return "Prov.";
    if (area.regionType === "Kota") return "Kota";
    return "Kab.";
  }

  function areaBadgeClass(area) {
    return area.regionType === "Kota" ? "bk" : "bp";
  }

  function areaSecondaryLine(area) {
    return isProvinceView() ? "Hanya paket Pemprov" : area.provinceName;
  }

  function severityColor(severity) {
    if (severity === "absurd") return "var(--rose)";
    if (severity === "high") return "var(--brick)";
    if (severity === "med") return "var(--olive)";
    return "var(--steel)";
  }

  function severityLabel(severity) {
    if (severity === "absurd") return "Absurd";
    if (severity === "high") return "High";
    if (severity === "med") return "Medium";
    return "Low";
  }

  function totalAreaMetrics(area) {
    return {
      totalPackages: Number(area?.totalPackages) || 0,
      totalPriorityPackages: Number(area?.totalPriorityPackages) || 0,
      totalPotentialWaste: Number(area?.totalPotentialWaste) || 0,
      totalBudget: Number(area?.totalBudget) || 0,
    };
  }

  function getActiveSidebarOwnerKey() {
    return isProvinceView() ? "provinsi" : state.mapFilter;
  }

  function activeSidebarOwnerLabel() {
    return ownerTypeLabel(getActiveSidebarOwnerKey());
  }

  function getAreaMetricsForOwner(area, ownerKey) {
    if (!area) {
      return totalAreaMetrics(null);
    }

    const metrics = area.ownerMetrics && area.ownerMetrics[ownerKey];

    if (metrics) {
      return {
        totalPackages: Number(metrics.totalPackages) || 0,
        totalPriorityPackages: Number(metrics.totalPriorityPackages) || 0,
        totalPotentialWaste: Number(metrics.totalPotentialWaste) || 0,
        totalBudget: Number(metrics.totalBudget) || 0,
      };
    }

    if (isProvinceView() && ownerKey === "provinsi") {
      return totalAreaMetrics(area);
    }

    return {
      totalPackages: ownerTypeCount(area, ownerKey),
      totalPriorityPackages: 0,
      totalPotentialWaste: 0,
      totalBudget: 0,
    };
  }

  function getSidebarAreaMetrics(area) {
    const ownerKey = getActiveSidebarOwnerKey();
    return ownerKey ? getAreaMetricsForOwner(area, ownerKey) : totalAreaMetrics(area);
  }

  function renderSeverityFilterOptions(selectedValue) {
    return SEVERITY_FILTERS.map(
      (filter) =>
        `<option value="${escapeAttr(filter.key)}"${selectedValue === filter.key ? " selected" : ""}>${escapeHtml(
          filter.label
        )}</option>`
    ).join("");
  }

  function getOwnerCardKey(ownerType, ownerName) {
    return `${ownerType}::${ownerName}`;
  }

  function getAreaKey(area, areaType = currentAreaType()) {
    return areaType === "province" ? area.provinceKey : area.regionKey;
  }

  function getAreaByKey(areaType, areaKey) {
    return (areaType === "province" ? provincesByKey : regionsByKey).get(areaKey) || null;
  }

  function getActiveAreaByKey(areaKey) {
    return getAreaByKey(currentAreaType(), areaKey);
  }

  function getActiveAreas() {
    return isProvinceView() ? dashboardData.provinceView.provinces : dashboardData.regions;
  }

  function getCentralOwnersForSidebar() {
    return dashboardData && dashboardData.ownerLists && Array.isArray(dashboardData.ownerLists.central)
      ? dashboardData.ownerLists.central
      : [];
  }

  function getActiveGeo() {
    return isProvinceView() ? dashboardData.provinceView.geo : dashboardData.geo;
  }

  function getActiveLegend() {
    return isProvinceView() ? dashboardData.provinceView.legend : dashboardData.legend;
  }

  function getFeatureAreaKey(feature) {
    return isProvinceView() ? feature.properties.provinceKey : feature.properties.regionKey;
  }

  function ensureMapStatus() {
    let status = document.getElementById("mapStatus");
    if (!status) {
      status = document.createElement("div");
      status.id = "mapStatus";
      status.className = "map-status";
      dom.mapRoot.parentElement.appendChild(status);
    }
    return status;
  }

  function setMapStatus(message, isError) {
    const status = ensureMapStatus();
    status.className = `map-status${isError ? " error" : ""}`;
    status.textContent = message;
  }

  function clearMapStatus() {
    const status = document.getElementById("mapStatus");
    if (status) {
      status.remove();
    }
  }

  function renderKpiCards(cards) {
    dom.kpi.innerHTML = cards
      .map(
        (item) =>
          `<div class="kc"><div class="kl">${escapeHtml(item.label)}</div><div class="kv">${escapeHtml(
            item.value
          )}</div><div class="ks">${escapeHtml(item.sublabel)}</div></div>`
      )
      .join("");
  }

  function renderSidebarMessage(message, isError) {
    dom.sidebarContent.innerHTML = `<div class="panel-msg${isError ? " error" : ""}">${escapeHtml(message)}</div>`;
  }

  function renderModalState(title, message, isError) {
    dom.modalTop.innerHTML =
      `<div class="modal-top-row"><div><h2>${escapeHtml(title)}</h2><div class="msub">Audit paket pengadaan &middot; TA 2026</div></div>` +
      `<div style="display:flex;gap:8px;align-items:center"><button class="modal-close" onclick="${actionCall('closeRegionModal')}">&#10005; Tutup</button></div></div>`;
    dom.modalBody.innerHTML = `<div class="modal-state${isError ? " error" : ""}">${escapeHtml(message)}</div>`;
  }

  function renderBootstrapLoading() {
    renderKpiCards([
      { label: "Total Potensi Pemborosan", value: "...", sublabel: "Menghitung agregat audit" },
      { label: "Paket Prioritas Audit", value: "...", sublabel: "Memuat daftar area" },
      { label: "Total Pagu Teraudit", value: "...", sublabel: "Menyiapkan peta kab/kota dan provinsi" },
      { label: "Paket Terpetakan", value: "...", sublabel: "Memeriksa cakupan lokasi" },
    ]);
    renderSidebarMessage("Memuat audit pengadaan per area...", false);
    setMapStatus("Memuat peta audit...", false);
  }

  function renderBootstrapError(error) {
    renderKpiCards([
      { label: "Total Potensi Pemborosan", value: "-", sublabel: "Backend belum siap" },
      { label: "Paket Prioritas Audit", value: "-", sublabel: "Periksa ingest hasil analyze" },
      { label: "Total Pagu Teraudit", value: "-", sublabel: "Ulangi db:reset bila perlu" },
      { label: "Paket Terpetakan", value: "-", sublabel: "Map belum dapat dibuat" },
    ]);
    renderSidebarMessage(`Gagal memuat dashboard audit: ${error}`, true);
    setMapStatus(`Gagal memuat dashboard audit: ${error}`, true);
  }

  function formatFetchError(error) {
    return error instanceof Error ? error.message : String(error);
  }

  async function fetchJson(path) {
    const response = await fetch(`${API_BASE_URL}${path}`);
    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (_error) {
        throw new Error(`Invalid JSON response from ${path}`);
      }
    }
    if (!response.ok) {
      throw new Error(payload && payload.error ? payload.error : `Request failed (${response.status})`);
    }
    return payload;
  }

  function normalizeDashboardData(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("Bootstrap payload tidak valid.");
    }

    return {
      summary: payload.summary || {
        totalPackages: 0,
        totalPriorityPackages: 0,
        totalPotentialWaste: 0,
        totalBudget: 0,
        unmappedPackages: 0,
        multiLocationPackages: 0,
      },
      legend: payload.legend || { zeroColor: "#243155", ranges: [] },
      geo: payload.geo || { type: "FeatureCollection", features: [] },
      regions: Array.isArray(payload.regions) ? payload.regions : [],
      provinceView: {
        legend: (payload.provinceView && payload.provinceView.legend) || { zeroColor: "#243155", ranges: [] },
        geo: (payload.provinceView && payload.provinceView.geo) || { type: "FeatureCollection", features: [] },
        provinces:
          payload.provinceView && Array.isArray(payload.provinceView.provinces) ? payload.provinceView.provinces : [],
      },
      ownerLists: {
        central: payload.ownerLists && Array.isArray(payload.ownerLists.central) ? payload.ownerLists.central : [],
      },
    };
  }

  function getLegendColor(value) {
    const legend = getActiveLegend();

    if (!legend) {
      return "#243155";
    }

    if (!value || value <= 0) {
      return legend.zeroColor || "#243155";
    }

    const range = (legend.ranges || []).find((item) => value >= item.min && value <= item.max);
    return range ? range.color : legend.ranges[legend.ranges.length - 1]?.color || "#a83c2e";
  }

  function areaMatchesCurrentView(area) {
    if (!area) {
      return false;
    }

    if (isProvinceView()) {
      return area.totalPackages > 0;
    }

    if (state.tab === "kabupaten" && area.regionType !== "Kabupaten") {
      return false;
    }

    if (state.tab === "kota" && area.regionType !== "Kota") {
      return false;
    }

    if (FILTERS.some((filter) => filter.key === state.mapFilter)) {
      return ownerTypeCount(area, state.mapFilter) > 0;
    }

    return true;
  }

  function getFilteredAreasForSidebar() {
    let areas = getActiveAreas().filter((area) => areaMatchesCurrentView(area));

    if (state.search) {
      const query = state.search.toLowerCase();
      const activeOwnerQuery = activeSidebarOwnerLabel().toLowerCase();
      areas = areas.filter((area) => {
        const matchesName = area.displayName.toLowerCase().includes(query) || area.provinceName.toLowerCase().includes(query);

        if (isProvinceView()) {
          return matchesName;
        }

        return matchesName || activeOwnerQuery.includes(query);
      });
    }

    const metricsByAreaKey = new Map(areas.map((area) => [getAreaKey(area), getSidebarAreaMetrics(area)]));
    const sorters = {
      waste: (left, right) =>
        metricsByAreaKey.get(getAreaKey(right)).totalPotentialWaste - metricsByAreaKey.get(getAreaKey(left)).totalPotentialWaste,
      priority: (left, right) =>
        metricsByAreaKey.get(getAreaKey(right)).totalPriorityPackages - metricsByAreaKey.get(getAreaKey(left)).totalPriorityPackages,
      packages: (left, right) =>
        metricsByAreaKey.get(getAreaKey(right)).totalPackages - metricsByAreaKey.get(getAreaKey(left)).totalPackages,
      budget: (left, right) =>
        metricsByAreaKey.get(getAreaKey(right)).totalBudget - metricsByAreaKey.get(getAreaKey(left)).totalBudget,
    };

    return areas.sort((left, right) => {
      const primary = (sorters[state.sortBy] || sorters.waste)(left, right);
      return primary !== 0 ? primary : left.displayName.localeCompare(right.displayName, "id");
    });
  }

  function getFilteredOwnersForSidebar() {
    // Use cached Cimahi owners instead of national owners
    let owners = cimahiOwnersCache || [];
    
    if (state.search) {
      const query = state.search.toLowerCase();
      owners = owners.filter((owner) => owner.ownerName.toLowerCase().includes(query));
    }

    const sorters = {
      waste: (left, right) => right.totalPotentialWaste - left.totalPotentialWaste,
      priority: (left, right) => right.totalPriorityPackages - left.totalPriorityPackages,
      packages: (left, right) => right.totalPackages - left.totalPackages,
      budget: (left, right) => right.totalBudget - left.totalBudget,
    };

    return owners.sort((left, right) => {
      const primary = (sorters[state.sortBy] || sorters.waste)(left, right);
      return primary !== 0 ? primary : left.ownerName.localeCompare(right.ownerName, "id");
    });
  }

  function renderKpis() {
    // Get Kota Cimahi data specifically
    const cimahiRegion = regionsByKey.get("region-jawa-barat-kota-cimahi");
    
    if (!cimahiRegion) {
      // Fallback to summary if Kota Cimahi not found
      const summary = dashboardData.summary;
      const mappedPackages = summary.totalPackages - summary.unmappedPackages;
      renderKpiCards([
        {
          label: "Total Potensi Pemborosan",
          value: `Rp ${formatCompactCurrency(summary.totalPotentialWaste)}`,
          sublabel: "Nilai nasional raw, tanpa duplikasi multi-lokasi",
        },
        {
          label: "Paket Prioritas Audit",
          value: formatNumber(summary.totalPriorityPackages),
          sublabel: `${formatNumber(summary.totalPackages)} paket teraudit`,
        },
        {
          label: "Total Pagu Teraudit",
          value: `Rp ${formatCompactCurrency(summary.totalBudget)}`,
          sublabel: "Akumulasi pagu dari seluruh artifact audit",
        },
        {
          label: "Paket Terpetakan",
          value: `${formatNumber(mappedPackages)} / ${formatNumber(summary.totalPackages)}`,
          sublabel: `${formatNumber(summary.unmappedPackages)} unmapped | ${formatNumber(summary.multiLocationPackages)} multi-lokasi`,
        },
      ]);
      return;
    }

    // Display Kota Cimahi specific data
    renderKpiCards([
      {
        label: "Total Potensi Pemborosan",
        value: `Rp ${formatCompactCurrency(cimahiRegion.totalPotentialWaste)}`,
        sublabel: "Potensi pemborosan Kota Cimahi",
      },
      {
        label: "Paket Prioritas Audit",
        value: formatNumber(cimahiRegion.totalPriorityPackages),
        sublabel: `${formatNumber(cimahiRegion.totalPackages)} paket teraudit`,
      },
      {
        label: "Total Pagu Teraudit",
        value: `Rp ${formatCompactCurrency(cimahiRegion.totalBudget)}`,
        sublabel: "Akumulasi pagu Kota Cimahi",
      },
      {
        label: "Paket Terpetakan",
        value: formatNumber(cimahiRegion.totalPackages),
        sublabel: `${formatNumber(cimahiRegion.totalPackages)} paket di Kota Cimahi`,
      },
    ]);
  }

  function renderLegend() {
    const legend = getActiveLegend();
    const title = isProvinceView()
      ? "Potensi Pemborosan Paket Pemprov per Provinsi"
      : "Potensi Pemborosan per Kab/Kota";
    const zeroLabel = isProvinceView() ? "Tidak ada paket pemprov terdeteksi" : "Tidak ada potensi terdeteksi";
    const note = isProvinceView()
      ? "Agregasi provinsi mendeduplikasi paket multi-kab/kota di provinsi yang sama."
      : "Map region menghitung penuh paket multi-lokasi, sehingga agregat region bisa lebih besar dari KPI nasional.";
    const rows = [
      `<div class="lt">${escapeHtml(title)}</div>`,
      `<div class="li"><div class="lsw" style="background:${escapeAttr(legend.zeroColor || "#243155")}"></div> ${escapeHtml(
        zeroLabel
      )}</div>`,
    ];

    (legend.ranges || []).forEach((range) => {
      rows.push(
        `<div class="li"><div class="lsw" style="background:${escapeAttr(range.color)}"></div> Rp ${escapeHtml(
          formatCompactCurrency(range.min)
        )} &ndash; Rp ${escapeHtml(formatCompactCurrency(range.max))}</div>`
      );
    });

    rows.push(`<div class="legend-note">${escapeHtml(note)}</div>`);
    dom.legend.innerHTML = rows.join("");
  }

  function renderFilterChips() {
    dom.mapFilters.innerHTML = FILTERS.map(
      (filter) =>
        `<div class="fc${filter.key === state.mapFilter ? " a" : ""}" onclick="${actionCall("setMapFilter", filter.key)}">${escapeHtml(
          filter.label
        )}</div>`
    ).join("");
  }

  function renderTabs() {
    const provinceView = isProvinceView();
    const centralOwnerMode = isCentralOwnerMode();

    dom.tabs.innerHTML = TABS.map((tab) => {
      const active = provinceView || centralOwnerMode ? tab.key === "all" : tab.key === state.tab;
      const disabled = (provinceView || centralOwnerMode) && tab.key !== "all";

      return `<button class="stb${active ? " a" : ""}"${disabled ? " disabled" : ""} onclick="${actionCall(
        "setTab",
        disabled ? "all" : tab.key
      )}">${escapeHtml(tab.label)}</button>`;
    }).join("");
  }

  function sortControl() {
    const placeholder = isCentralOwnerMode()
      ? "Cari kementerian/lembaga..."
      : isProvinceView()
      ? "Cari provinsi..."
      : "Cari kabupaten/kota...";

    return (
      `<div class="sw"><span class="si">&#128269;</span><input type="text" placeholder="${escapeAttr(
        placeholder
      )}" value="${escapeAttr(state.search)}" oninput="${actionExpr("dashboardActions.setSearch(this.value)")}" /></div>` +
      `<div class="sort-bar"><label>Urutkan</label><select onchange="${actionExpr("dashboardActions.setSort(this.value)")}" aria-label="Urutkan area">` +
      `<option value="waste"${state.sortBy === "waste" ? " selected" : ""}>Potensi Pemborosan</option>` +
      `<option value="priority"${state.sortBy === "priority" ? " selected" : ""}>Paket Prioritas</option>` +
      `<option value="packages"${state.sortBy === "packages" ? " selected" : ""}>Total Paket</option>` +
      `<option value="budget"${state.sortBy === "budget" ? " selected" : ""}>Total Pagu</option>` +
      `</select></div>`
    );
  }

  function renderOwnerSidebarContent() {
    const owners = getFilteredOwnersForSidebar();

    if (!owners.length) {
      dom.sidebarContent.innerHTML =
        sortControl() + `<div class="panel-msg">Tidak ada kementerian/lembaga yang cocok dengan filter saat ini.</div>`;
      return;
    }

    const maxWaste = Math.max(...owners.map((owner) => owner.totalPotentialWaste), 1);

    dom.sidebarContent.innerHTML =
      sortControl() +
      owners
        .map((owner, index) => {
          const selectedClass =
            state.selectedOwnerKey === getOwnerCardKey(owner.ownerType, owner.ownerName) ? " a" : "";

          return (
            `<div class="pi${selectedClass}" onclick="${actionCall("openOwnerModal", owner.ownerName, owner.ownerType)}">` +
            `<div class="pit"><div class="pn"><span style="color:var(--t3);font-size:9px;margin-right:5px">#${index + 1}</span>${escapeHtml(
              owner.ownerName
            )}</div><div class="tbd bc">K/L</div></div>` +
            `<div style="font-size:9.5px;color:var(--t3);margin-bottom:4px">Kementerian/Lembaga</div>` +
            `<div><span class="ppv">Rp ${escapeHtml(formatCompactCurrency(owner.totalPotentialWaste))}</span><span class="ppl"> &middot; ${escapeHtml(
              formatNumber(owner.totalPriorityPackages)
            )} prioritas</span></div>` +
            `<div class="bw"><div class="bf" style="width:${Math.max(
              4,
              Math.round((owner.totalPotentialWaste / maxWaste) * 100)
            )}%;background:${escapeAttr(getLegendColor(owner.totalPotentialWaste))}"></div></div>` +
            `<div class="ps"><div class="pst">Total Paket: <strong>${escapeHtml(
              formatNumber(owner.totalPackages)
            )}</strong></div><div class="pst">Severity High: <strong>${escapeHtml(
              formatNumber(owner.severityCounts.high)
            )}</strong></div></div>` +
            `<div class="owner-mix">Severity Absurd ${escapeHtml(formatNumber(owner.severityCounts.absurd))}</div>` +
            `<div class="waste-row"><span class="waste-label">Pagu Teraudit</span><span class="waste-val">${escapeHtml(
              `Rp ${formatCompactCurrency(owner.totalBudget)}`
            )}</span></div>` +
            `</div>`
          );
        })
        .join("");
  }

  function renderSidebarContent() {
    if (!dashboardData) {
      renderSidebarMessage("Data dashboard belum tersedia.", true);
      return;
    }

    if (isCentralOwnerMode()) {
      renderOwnerSidebarContent();
      return;
    }

    // Show only Kota Cimahi in sidebar
    const cimahiRegion = regionsByKey.get("region-jawa-barat-kota-cimahi");
    
    if (!cimahiRegion) {
      renderSidebarMessage("Data Kota Cimahi tidak tersedia.", true);
      return;
    }

    const areaEntries = [{
      area: cimahiRegion,
      metrics: getSidebarAreaMetrics(cimahiRegion),
    }];
    
    const maxWaste = Math.max(...areaEntries.map(({ metrics }) => metrics.totalPotentialWaste), 1);
    const ownerLabel = activeSidebarOwnerLabel();

    dom.sidebarContent.innerHTML =
      sortControl() +
      areaEntries
        .map(({ area, metrics }, index) => {
          const areaKey = getAreaKey(area);
          const selectedClass = state.selectedAreaKey === areaKey ? " a" : "";

          return (
            `<div class="pi${selectedClass}" onclick="${actionCall("openAreaModal", areaKey)}">` +
            `<div class="pit"><div class="pn"><span style="color:var(--t3);font-size:9px;margin-right:5px">#${index + 1}</span>${escapeHtml(
              area.displayName
            )}</div><div class="tbd ${areaBadgeClass(area)}">${escapeHtml(areaBadgeLabel(area))}</div></div>` +
            `<div style="font-size:9.5px;color:var(--t3);margin-bottom:4px">${escapeHtml(areaSecondaryLine(area))}</div>` +
            `<div><span class="ppv">Rp ${escapeHtml(formatCompactCurrency(metrics.totalPotentialWaste))}</span><span class="ppl"> &middot; ${escapeHtml(
              formatNumber(metrics.totalPriorityPackages)
            )} prioritas</span></div>` +
            `<div class="bw"><div class="bf" style="width:${Math.max(
              4,
              Math.round((metrics.totalPotentialWaste / maxWaste) * 100)
            )}%;background:${escapeAttr(getLegendColor(metrics.totalPotentialWaste))}"></div></div>` +
            `<div class="ps"><div class="pst">Total Paket: <strong>${escapeHtml(
              formatNumber(metrics.totalPackages)
            )}</strong></div><div class="pst">Pemilik: <strong>${escapeHtml(ownerLabel)}</strong></div></div>` +
            `<div class="owner-mix">${escapeHtml(areaOwnerSummary(area))}</div>` +
            `<div class="waste-row"><span class="waste-label">Pagu Teraudit</span><span class="waste-val">${escapeHtml(
              `Rp ${formatCompactCurrency(metrics.totalBudget)}`
            )}</span></div>` +
            `</div>`
          );
        })
        .join("");
  }

  function featureStyle(feature) {
    const areaKey = getFeatureAreaKey(feature);
    
    // Only show Kota Cimahi, hide all other areas
    if (areaKey !== "region-jawa-barat-kota-cimahi") {
      return {
        fillColor: "#243155",
        fillOpacity: 0,
        strokeColor: "#b5a882",
        strokeWidth: 0,
        strokeOpacity: 0,
      };
    }
    
    const area = getActiveAreaByKey(areaKey);
    const visible = areaMatchesCurrentView(area);
    const selected = state.selectedAreaKey === areaKey;
    const strokeOpacity = (selected ? 1 : 0.2) * (visible ? 0.85 : 0.2);

    return {
      fillColor: area ? getLegendColor(area.totalPotentialWaste) : "#243155",
      fillOpacity: selected ? 0.72 : visible ? 0.52 : 0.08,
      strokeColor: selected ? "#f0d8a8" : "#b5a882",
      strokeWidth: selected ? 2.1 : 0.8,
      strokeOpacity,
    };
  }

  function popupHtml(area) {
    if (!area) {
      return `<div class="pt">Belum ada data</div>`;
    }

    if (isProvinceView()) {
      return (
        `<div class="pt">${escapeHtml(area.displayName)}</div>` +
        `<div class="popup-sub">Paket Pemprov</div>` +
        `<div class="pr"><span class="l">Potensi Pemborosan</span><span class="v" style="color:#b5a882">Rp ${escapeHtml(
          formatCompactCurrency(area.totalPotentialWaste)
        )}</span></div>` +
        `<div class="pr"><span class="l">Paket Prioritas</span><span class="v">${escapeHtml(
          formatNumber(area.totalPriorityPackages)
        )}</span></div>` +
        `<div class="pr"><span class="l">Total Paket</span><span class="v">${escapeHtml(
          formatNumber(area.totalPackages)
        )}</span></div>` +
        `<div class="pr"><span class="l">Total Pagu</span><span class="v">${escapeHtml(
          formatCompactCurrency(area.totalBudget)
        )}</span></div>` +
        `<div class="pr"><span class="l">Severity High</span><span class="v">${escapeHtml(
          formatNumber(area.severityCounts.high)
        )}</span></div>` +
        `<div class="ppb"><div class="ppbf" style="width:${Math.min(
          100,
          area.totalPriorityPackages > 0 ? Math.round((area.totalPriorityPackages / Math.max(area.totalPackages, 1)) * 100) : 0
        )}%;background:${escapeAttr(getLegendColor(area.totalPotentialWaste))}"></div></div>`
      );
    }

    return (
      `<div class="pt">${escapeHtml(area.displayName)}</div>` +
      `<div class="popup-sub">${escapeHtml(area.provinceName)}</div>` +
      `<div class="pr"><span class="l">Potensi Pemborosan</span><span class="v" style="color:#b5a882">Rp ${escapeHtml(
        formatCompactCurrency(area.totalPotentialWaste)
      )}</span></div>` +
      `<div class="pr"><span class="l">Paket Prioritas</span><span class="v">${escapeHtml(
        formatNumber(area.totalPriorityPackages)
      )}</span></div>` +
      `<div class="pr"><span class="l">Total Paket</span><span class="v">${escapeHtml(
        formatNumber(area.totalPackages)
      )}</span></div>` +
      `<div class="pr"><span class="l">Kementerian/Lembaga</span><span class="v">${escapeHtml(
        formatNumber(ownerTypeCount(area, "central"))
      )}</span></div>` +
      `<div class="pr"><span class="l">Pemprov</span><span class="v">${escapeHtml(
        formatNumber(ownerTypeCount(area, "provinsi"))
      )}</span></div>` +
      `<div class="pr"><span class="l">Pemkot</span><span class="v">${escapeHtml(
        formatNumber(ownerTypeCount(area, "kabkota"))
      )}</span></div>` +
      `<div class="pr"><span class="l">Others</span><span class="v">${escapeHtml(
        formatNumber(ownerTypeCount(area, "other"))
      )}</span></div>` +
      `<div class="ppb"><div class="ppbf" style="width:${Math.min(
        100,
        area.totalPriorityPackages > 0 ? Math.round((area.totalPriorityPackages / Math.max(area.totalPackages, 1)) * 100) : 0
      )}%;background:${escapeAttr(getLegendColor(area.totalPotentialWaste))}"></div></div>`
    );
  }

  function renderGeoLayer(fitToBounds) {
    const geo = getActiveGeo();

    if (!geo || !Array.isArray(geo.features) || !geo.features.length) {
      setMapStatus("Tidak ada geometri untuk mode peta saat ini.", true);
      return;
    }

    AuditMap.render(
      dom.mapRoot,
      geo,
      {
        getFeatureStyle: featureStyle,
        getPopupHtml: (areaKey) => popupHtml(getActiveAreaByKey(areaKey)),
        onAreaClick: openAreaModal,
        fitBounds: false,
        isProvinceView: isProvinceView(),
      },
      () => {
        clearMapStatus();
        // Auto-zoom to Kota Cimahi on initial load
        setTimeout(() => AuditMap.zoomToArea("region-jawa-barat-kota-cimahi"), 800);
      }
    );
  }

  function initMap() {
    renderGeoLayer(true);
  }

  function refreshMapStyles() {
    AuditMap.refresh(getActiveGeo(), featureStyle);
  }

  function renderPackageTableRows(items) {
    return items.length
      ? items
          .map((item) => {
            const packageUrl = buildInaprocUrl(item.sourceId);

            return (
              `<tr${
                packageUrl
                  ? ` class="package-row-link" tabindex="0" role="link" aria-label="${escapeAttr(
                      `Buka ${item.packageName} di Inaproc`
                    )}" onclick="${actionCall("openPackageDetail", item.sourceId)}" onkeydown="${actionExpr(
                      `dashboardActions.handlePackageRowKeydown(event, ${jsArg(item.sourceId)})`
                    )}"`
                  : ""
              }>` +
              `<td class="mono">${escapeHtml(String(item.sourceId || item.id))}</td>` +
              `<td class="pkg">${escapeHtml(item.packageName)}</td>` +
              `<td><div class="tbl-owner">${escapeHtml(item.ownerName)}</div><div class="tbl-sub">${escapeHtml(
                ownerTypeLabel(item.ownerType)
              )}</div></td>` +
              `<td><div class="tbl-owner">${escapeHtml(item.satker || "-")}</div><div class="tbl-sub">${escapeHtml(
                item.locationRaw || "-"
              )}</div></td>` +
              `<td class="mono" style="color:var(--sage)">${escapeHtml(item.budget === null ? "-" : formatCurrencyLong(item.budget))}</td>` +
              `<td><span class="sev-b" style="background:${escapeAttr(
                item.audit.severity === "absurd"
                  ? "rgba(212,169,153,.18)"
                  : item.audit.severity === "high"
                  ? "rgba(168,60,46,.16)"
                  : item.audit.severity === "med"
                    ? "rgba(139,115,50,.16)"
                    : "rgba(123,134,163,.16)"
              )};color:${escapeAttr(severityColor(item.audit.severity))}">${escapeHtml(
                severityLabel(item.audit.severity)
              )}</span></td>` +
              `<td class="reason">${escapeHtml(item.audit.reason || "-")}</td>` +
              `</tr>`
            );
          })
          .join("")
      : `<tr><td colspan="7" class="table-empty">Tidak ada paket untuk filter saat ini.</td></tr>`;
  }

  function renderPagination(pagination) {
    return (
      `<div class="pager"><button class="pager-btn" ${pagination.page <= 1 ? "disabled" : ""} onclick="${actionCall(
        "changeModalPage",
        pagination.page - 1
      )}">Sebelumnya</button><div class="pager-text">Halaman ${escapeHtml(formatNumber(pagination.page))} / ${escapeHtml(
        formatNumber(pagination.totalPages)
      )} &middot; ${escapeHtml(formatNumber(pagination.totalItems))} paket</div><button class="pager-btn" ${
        pagination.page >= pagination.totalPages ? "disabled" : ""
      } onclick="${actionCall("changeModalPage", pagination.page + 1)}">Berikutnya</button></div>`
    );
  }

  function renderRegionModalContent(payload) {
    const region = payload.region;
    const rowsHtml = renderPackageTableRows(payload.items);
    
    // Detect anomalies
    const anomalies = window.AnomalyDetector ? AnomalyDetector.detectAnomalies(payload.items) : [];
    const anomalyStats = window.AnomalyDetector ? AnomalyDetector.calculateAnomalyStats(anomalies) : null;

    dom.modalTop.innerHTML =
      `<div class="modal-top-row"><div><h2>${escapeHtml(region.displayName)}</h2><div class="msub">${escapeHtml(
        `${region.provinceName} | Audit paket pengadaan TA 2026`
      )}</div></div>` +
      `<div style="display:flex;gap:8px;align-items:center"><span class="tbd ${areaBadgeClass(region)}">${escapeHtml(
        region.regionType
      )}</span><button class="modal-close" onclick="${actionCall('closeRegionModal')}">&#10005; Tutup</button></div></div>` +
      `<div class="modal-kpis">` +
      `<div class="mkp"><div class="mkp-l">Potensi Pemborosan</div><div class="mkp-v" style="color:var(--brick)">Rp ${escapeHtml(
        formatCompactCurrency(region.totalPotentialWaste)
      )}</div></div>` +
      `<div class="mkp"><div class="mkp-l">Paket Prioritas</div><div class="mkp-v">${escapeHtml(
        formatNumber(region.totalPriorityPackages)
      )}</div></div>` +
      `<div class="mkp"><div class="mkp-l">Total Paket</div><div class="mkp-v">${escapeHtml(
        formatNumber(region.totalPackages)
      )}</div></div>` +
      `<div class="mkp"><div class="mkp-l">Total Pagu</div><div class="mkp-v" style="color:var(--sage)">Rp ${escapeHtml(
        formatCompactCurrency(region.totalBudget)
      )}</div></div></div>`;

    let anomalySection = '';
    if (anomalies && anomalies.length > 0 && anomalyStats) {
      anomalySection = `
        <div class="anomaly-section">
          <div class="anomaly-section-title">
            <span class="anomaly-icon">⚠️</span>
            Deteksi Anomali Anggaran (${anomalyStats.totalAnomalies})
          </div>
          <div class="anomaly-stats">
            <div class="anomaly-stat critical">
              <div class="anomaly-stat-label">Critical</div>
              <div class="anomaly-stat-value">${anomalyStats.critical || 0}</div>
            </div>
            <div class="anomaly-stat high">
              <div class="anomaly-stat-label">High</div>
              <div class="anomaly-stat-value">${anomalyStats.high || 0}</div>
            </div>
            <div class="anomaly-stat medium">
              <div class="anomaly-stat-label">Medium</div>
              <div class="anomaly-stat-value">${anomalyStats.medium || 0}</div>
            </div>
            <div class="anomaly-stat low">
              <div class="anomaly-stat-label">Low</div>
              <div class="anomaly-stat-value">${anomalyStats.totalAnomalies - (anomalyStats.critical || 0) - (anomalyStats.high || 0) - (anomalyStats.medium || 0)}</div>
            </div>
          </div>
          <div class="anomaly-chart" id="anomaly-type-chart-container">
            <canvas id="anomaly-type-chart"></canvas>
          </div>
          <div class="anomaly-list" id="anomaly-list-container">
            ${window.AnomalyDetector ? AnomalyDetector.generateAnomalyHtml(anomalies) : ''}
          </div>
        </div>
      `;
    }

    // Build UMKM section
    let umkmSection = '';
    if (window.UMKMAnalyzer) {
      const regionUmkms = UMKMAnalyzer.getRegionUMKMs(state.modal.areaKey);
      if (regionUmkms) {
        const opportunities = UMKMAnalyzer.analyzePackageOpportunities(regionUmkms, payload.items);
        umkmSection = `
          <div class="umkm-section">
            ${UMKMAnalyzer.generateUMKMSummary(regionUmkms)}
            <div class="umkm-capacity-chart" id="umkm-capacity-chart-container">
              <canvas id="umkm-capacity-chart"></canvas>
            </div>
            ${opportunities && opportunities.length > 0 ? UMKMAnalyzer.generateOpportunitiesList(opportunities, 8) : '<div class="umkm-empty">Tidak ada peluang untuk UMKM saat ini</div>'}
          </div>
        `;
      }
    }

    dom.modalBody.innerHTML =
      `<div class="modal-summary-grid">` +
      `<div class="mini-stat"><span>Kementerian/Lembaga</span><strong>${escapeHtml(
        formatNumber(ownerTypeCount(region, "central"))
      )}</strong></div>` +
      `<div class="mini-stat"><span>Pemprov</span><strong>${escapeHtml(
        formatNumber(ownerTypeCount(region, "provinsi"))
      )}</strong></div>` +
      `<div class="mini-stat"><span>Pemkot</span><strong>${escapeHtml(
        formatNumber(ownerTypeCount(region, "kabkota"))
      )}</strong></div>` +
      `<div class="mini-stat"><span>Others</span><strong>${escapeHtml(
        formatNumber(ownerTypeCount(region, "other"))
      )}</strong></div>` +
      `<div class="mini-stat"><span>Severity High</span><strong>${escapeHtml(formatNumber(region.severityCounts.high))}</strong></div>` +
      `<div class="mini-stat"><span>Severity Absurd</span><strong>${escapeHtml(
        formatNumber(region.severityCounts.absurd)
      )}</strong></div>` +
      `</div>` +
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;background:var(--b2);border:1px solid var(--bd);border-radius:10px;padding:10px;">` +
      `<div><canvas id="area-severity-chart" style="max-height:160px"></canvas></div>` +
      `<div><canvas id="area-owner-chart" style="max-height:160px"></canvas></div>` +
      `</div>` +
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">` +
      anomalySection +
      umkmSection +
      `</div>` +
      `<div class="modal-filters">` +
      `<input type="text" placeholder="Cari paket, lembaga, atau satker..." value="${escapeAttr(
        state.modal.search
      )}" oninput="${actionExpr("dashboardActions.setModalSearch(this.value)")}" />` +
      `<select onchange="${actionExpr("dashboardActions.setModalOwnerType(this.value)")}" aria-label="Filter jenis pemilik">` +
      `<option value="">Semua Pemilik</option><option value="central"${state.modal.ownerType === "central" ? " selected" : ""}>Kementerian/Lembaga</option>` +
      `<option value="provinsi"${state.modal.ownerType === "provinsi" ? " selected" : ""}>Pemprov</option><option value="kabkota"${
        state.modal.ownerType === "kabkota" ? " selected" : ""
      }>Pemkot</option><option value="other"${
        state.modal.ownerType === "other" ? " selected" : ""
      }>Others</option></select>` +
      `<select onchange="${actionExpr("dashboardActions.setModalSeverity(this.value)")}" aria-label="Filter severity">${renderSeverityFilterOptions(
        state.modal.severity
      )}</select>` +
      `<label class="chk"><input type="checkbox" ${state.modal.priorityOnly ? "checked" : ""} onchange="${actionExpr(
        "dashboardActions.setModalPriorityOnly(this.checked)"
      )}" /> Hanya prioritas</label>` +
      `</div>` +
      `<div class="modal-cnt">Menampilkan ${escapeHtml(formatNumber(payload.items.length))} dari ${escapeHtml(
        formatNumber(payload.pagination.totalItems)
      )} paket pada area ini</div>` +
      `<table class="rtbl"><thead><tr><th>ID</th><th>Nama Paket</th><th>Pemilik</th><th>Satker / Lokasi</th><th>Pagu</th><th>Severity</th><th>Alasan</th></tr></thead><tbody>${rowsHtml}</tbody></table>` +
      renderPagination(payload.pagination);

    // Initialize charts for this region
    if (window.DashboardViz && typeof DashboardViz.initAreaCharts === 'function') {
      setTimeout(() => DashboardViz.initAreaCharts(region), 100);
    }

    // Initialize anomaly chart
    if (window.AnomalyDetector && anomalies && anomalies.length > 0) {
      setTimeout(() => AnomalyDetector.renderAnomalyChart(anomalies, 'anomaly-type-chart'), 150);
    }

    // Initialize UMKM capacity chart
    if (window.UMKMAnalyzer) {
      const regionUmkms = UMKMAnalyzer.getRegionUMKMs(state.modal.areaKey);
      if (regionUmkms) {
        setTimeout(() => UMKMAnalyzer.renderCapacityChart(regionUmkms, 'umkm-capacity-chart'), 200);
      }
    }
  }

  function renderProvinceModalContent(payload) {
    const province = payload.province;
    const rowsHtml = renderPackageTableRows(payload.items);

    dom.modalTop.innerHTML =
      `<div class="modal-top-row"><div><h2>${escapeHtml(province.displayName)}</h2><div class="msub">Paket pemprov pada provinsi ini &middot; TA 2026</div></div>` +
      `<div style="display:flex;gap:8px;align-items:center"><span class="tbd ${areaBadgeClass(province)}">Provinsi</span><button class="modal-close" onclick="${actionCall('closeRegionModal')}">&#10005; Tutup</button></div></div>` +
      `<div class="modal-kpis">` +
      `<div class="mkp"><div class="mkp-l">Potensi Pemborosan</div><div class="mkp-v" style="color:var(--brick)">Rp ${escapeHtml(
        formatCompactCurrency(province.totalPotentialWaste)
      )}</div></div>` +
      `<div class="mkp"><div class="mkp-l">Paket Prioritas</div><div class="mkp-v">${escapeHtml(
        formatNumber(province.totalPriorityPackages)
      )}</div></div>` +
      `<div class="mkp"><div class="mkp-l">Total Paket Pemprov</div><div class="mkp-v">${escapeHtml(
        formatNumber(province.totalPackages)
      )}</div></div>` +
      `<div class="mkp"><div class="mkp-l">Total Pagu</div><div class="mkp-v" style="color:var(--sage)">Rp ${escapeHtml(
        formatCompactCurrency(province.totalBudget)
      )}</div></div></div>`;

    dom.modalBody.innerHTML =
      `<div class="modal-summary-grid">` +
      `<div class="mini-stat"><span>Paket Flagged</span><strong>${escapeHtml(
        formatNumber(province.totalFlaggedPackages)
      )}</strong></div>` +
      `<div class="mini-stat"><span>Severity Medium</span><strong>${escapeHtml(
        formatNumber(province.severityCounts.med)
      )}</strong></div>` +
      `<div class="mini-stat"><span>Severity High</span><strong>${escapeHtml(
        formatNumber(province.severityCounts.high)
      )}</strong></div>` +
      `<div class="mini-stat"><span>Severity Absurd</span><strong>${escapeHtml(
        formatNumber(province.severityCounts.absurd)
      )}</strong></div>` +
      `<div class="mini-stat"><span>Avg Risk Score</span><strong>${escapeHtml(
        formatDecimal(province.avgRiskScore)
      )}</strong></div>` +
      `<div class="mini-stat"><span>Max Risk Score</span><strong>${escapeHtml(
        formatNumber(province.maxRiskScore)
      )}</strong></div>` +
      `</div>` +
      `<div class="modal-filters">` +
      `<input type="text" placeholder="Cari paket, lembaga, atau satker..." value="${escapeAttr(
        state.modal.search
      )}" oninput="${actionExpr("dashboardActions.setModalSearch(this.value)")}" />` +
      `<select onchange="${actionExpr("dashboardActions.setModalSeverity(this.value)")}" aria-label="Filter severity">${renderSeverityFilterOptions(
        state.modal.severity
      )}</select>` +
      `<label class="chk"><input type="checkbox" ${state.modal.priorityOnly ? "checked" : ""} onchange="${actionExpr(
        "dashboardActions.setModalPriorityOnly(this.checked)"
      )}" /> Hanya prioritas</label>` +
      `</div>` +
      `<div class="modal-cnt">Menampilkan ${escapeHtml(formatNumber(payload.items.length))} dari ${escapeHtml(
        formatNumber(payload.pagination.totalItems)
      )} paket pemprov pada provinsi ini</div>` +
      `<table class="rtbl"><thead><tr><th>ID</th><th>Nama Paket</th><th>Pemilik</th><th>Satker / Lokasi</th><th>Pagu</th><th>Severity</th><th>Alasan</th></tr></thead><tbody>${rowsHtml}</tbody></table>` +
      renderPagination(payload.pagination);
  }

  function renderOwnerModalContent(payload) {
    const owner = payload.owner;
    const rowsHtml = renderPackageTableRows(payload.items);

    dom.modalTop.innerHTML =
      `<div class="modal-top-row"><div><h2>${escapeHtml(owner.ownerName)}</h2><div class="msub">${escapeHtml(
        `${ownerTypeLabel(owner.ownerType)} | Audit paket nasional TA 2026`
      )}</div></div>` +
      `<div style="display:flex;gap:8px;align-items:center"><span class="tbd bc">K/L</span><button class="modal-close" onclick="${actionCall('closeRegionModal')}">&#10005; Tutup</button></div></div>` +
      `<div class="modal-kpis">` +
      `<div class="mkp"><div class="mkp-l">Potensi Pemborosan</div><div class="mkp-v" style="color:var(--brick)">Rp ${escapeHtml(
        formatCompactCurrency(owner.totalPotentialWaste)
      )}</div></div>` +
      `<div class="mkp"><div class="mkp-l">Paket Prioritas</div><div class="mkp-v">${escapeHtml(
        formatNumber(owner.totalPriorityPackages)
      )}</div></div>` +
      `<div class="mkp"><div class="mkp-l">Total Paket</div><div class="mkp-v">${escapeHtml(
        formatNumber(owner.totalPackages)
      )}</div></div>` +
      `<div class="mkp"><div class="mkp-l">Total Pagu</div><div class="mkp-v" style="color:var(--sage)">Rp ${escapeHtml(
        formatCompactCurrency(owner.totalBudget)
      )}</div></div></div>`;

    dom.modalBody.innerHTML =
      `<div class="modal-summary-grid">` +
      `<div class="mini-stat"><span>Paket Flagged</span><strong>${escapeHtml(
        formatNumber(owner.totalFlaggedPackages)
      )}</strong></div>` +
      `<div class="mini-stat"><span>Severity Medium</span><strong>${escapeHtml(
        formatNumber(owner.severityCounts.med)
      )}</strong></div>` +
      `<div class="mini-stat"><span>Severity High</span><strong>${escapeHtml(
        formatNumber(owner.severityCounts.high)
      )}</strong></div>` +
      `<div class="mini-stat"><span>Severity Absurd</span><strong>${escapeHtml(
        formatNumber(owner.severityCounts.absurd)
      )}</strong></div>` +
      `</div>` +
      `<div class="modal-filters">` +
      `<input type="text" placeholder="Cari paket atau satker..." value="${escapeAttr(
        state.modal.search
      )}" oninput="${actionExpr("dashboardActions.setModalSearch(this.value)")}" />` +
      `<select onchange="${actionExpr("dashboardActions.setModalSeverity(this.value)")}" aria-label="Filter severity">${renderSeverityFilterOptions(
        state.modal.severity
      )}</select>` +
      `<label class="chk"><input type="checkbox" ${state.modal.priorityOnly ? "checked" : ""} onchange="${actionExpr(
        "dashboardActions.setModalPriorityOnly(this.checked)"
      )}" /> Hanya prioritas</label>` +
      `</div>` +
      `<div class="modal-cnt">Menampilkan ${escapeHtml(formatNumber(payload.items.length))} dari ${escapeHtml(
        formatNumber(payload.pagination.totalItems)
      )} paket pada pemilik ini</div>` +
      `<table class="rtbl"><thead><tr><th>ID</th><th>Nama Paket</th><th>Pemilik</th><th>Satker / Lokasi</th><th>Pagu</th><th>Severity</th><th>Alasan</th></tr></thead><tbody>${rowsHtml}</tbody></table>` +
      renderPagination(payload.pagination);
  }

  function renderModalContent(payload) {
    if (state.modal.areaType === "owner") {
      renderOwnerModalContent(payload);
      return;
    }

    if (state.modal.areaType === "province") {
      renderProvinceModalContent(payload);
      return;
    }

    renderRegionModalContent(payload);
  }

  async function loadAreaPackages() {
    if (
      (state.modal.areaType === "owner" && (!state.modal.ownerType || !state.modal.ownerName)) ||
      (state.modal.areaType !== "owner" && !state.modal.areaKey)
    ) {
      return;
    }

    state.modalRequestId += 1;
    const requestId = state.modalRequestId;
    renderModalState(
      state.modal.areaType === "owner" ? "Memuat pemilik..." : "Memuat area...",
      state.modal.areaType === "owner"
        ? "Mengambil paket dari pemilik terpilih..."
        : "Mengambil paket dari backend audit...",
      false
    );

    const params = new URLSearchParams({
      page: String(state.modal.page),
      pageSize: String(state.modal.pageSize),
    });

    if (state.modal.search) {
      params.set("search", state.modal.search);
    }

    if (state.modal.areaType === "region" && state.modal.ownerType) {
      params.set("ownerType", state.modal.ownerType);
    }

    if (state.modal.severity) {
      params.set("severity", state.modal.severity);
    }

    if (state.modal.priorityOnly) {
      params.set("priorityOnly", "true");
    }

    const path =
      state.modal.areaType === "owner"
        ? (() => {
            params.set("ownerType", state.modal.ownerType);
            params.set("ownerName", state.modal.ownerName);
            return `/owners/packages?${params.toString()}`;
          })()
        : state.modal.areaType === "province"
        ? `/provinces/${encodeURIComponent(state.modal.areaKey)}/packages?${params.toString()}`
        : `/regions/${encodeURIComponent(state.modal.areaKey)}/packages?${params.toString()}`;

    try {
      const payload = await fetchJson(path);

      if (requestId !== state.modalRequestId) {
        return;
      }

      renderModalContent(payload);
    } catch (error) {
      if (requestId !== state.modalRequestId) {
        return;
      }

      renderModalState("Gagal memuat paket", formatFetchError(error), true);
    }
  }

  function openAreaModal(areaKey) {
    AuditMap.closePopup();
    state.selectedAreaKey = areaKey;
    state.selectedOwnerKey = null;
    state.modal = {
      areaType: currentAreaType(),
      areaKey,
      ownerName: "",
      page: 1,
      pageSize: 25,
      search: "",
      ownerType: "",
      severity: "",
      priorityOnly: false,
    };

    refreshMapStyles();
    renderSidebarContent();
    dom.modal.classList.add("open");
    document.body.style.overflow = "hidden";
    loadAreaPackages();
  }

  function openOwnerModal(ownerName, ownerType) {
    AuditMap.closePopup();
    state.selectedAreaKey = null;
    state.selectedOwnerKey = getOwnerCardKey(ownerType, ownerName);
    state.modal = {
      areaType: "owner",
      areaKey: null,
      ownerName,
      page: 1,
      pageSize: 25,
      search: "",
      ownerType,
      severity: "",
      priorityOnly: false,
    };

    refreshMapStyles();
    renderSidebarContent();
    dom.modal.classList.add("open");
    document.body.style.overflow = "hidden";
    loadAreaPackages();
  }

  function closeRegionModal() {
    state.modalRequestId += 1;
    state.modal = {
      areaType: currentAreaType(),
      areaKey: null,
      ownerName: "",
      page: 1,
      pageSize: 25,
      search: "",
      ownerType: "",
      severity: "",
      priorityOnly: false,
    };
    dom.modal.classList.remove("open");
    document.body.style.overflow = "";
  }

  function setSearch(value) {
    state.search = value;
    renderSidebarContent();
  }

  function setSort(value) {
    state.sortBy = value;
    renderSidebarContent();
  }

  function setTab(value) {
    if (isProvinceView() || isCentralOwnerMode()) {
      state.tab = "all";
      renderTabs();
      return;
    }

    state.tab = value;
    refreshMapStyles();
    renderTabs();
    renderSidebarContent();
  }

  function setMapFilter(value) {
    const wasProvinceView = isProvinceView();
    const wasCentralOwnerMode = isCentralOwnerMode();
    state.mapFilter = value;
    const viewChanged = wasProvinceView !== isProvinceView();
    const centralOwnerModeChanged = wasCentralOwnerMode !== isCentralOwnerMode();

    if (viewChanged) {
      state.tab = "all";
      state.selectedAreaKey = null;
      state.selectedOwnerKey = null;
      closeRegionModal();
      renderLegend();
      renderFilterChips();
      renderTabs();
      renderSidebarContent();
      renderGeoLayer(true);
      return;
    }

    if (centralOwnerModeChanged) {
      state.tab = "all";
      state.selectedAreaKey = null;
      state.selectedOwnerKey = null;

      if (state.modal.areaType === "owner" && !isCentralOwnerMode()) {
        closeRegionModal();
      }
    }

    refreshMapStyles();
    renderFilterChips();
    renderTabs();
    renderSidebarContent();
  }

  function setModalSearch(value) {
    state.modal.search = value;
    state.modal.page = 1;
    loadAreaPackages();
  }

  function setModalOwnerType(value) {
    if (state.modal.areaType === "province" || state.modal.areaType === "owner") {
      return;
    }

    state.modal.ownerType = value;
    state.modal.page = 1;
    loadAreaPackages();
  }

  function setModalSeverity(value) {
    state.modal.severity = value;
    state.modal.page = 1;
    loadAreaPackages();
  }

  function setModalPriorityOnly(value) {
    state.modal.priorityOnly = Boolean(value);
    state.modal.page = 1;
    loadAreaPackages();
  }

  function changeModalPage(page) {
    state.modal.page = page;
    loadAreaPackages();
  }

  function openPackageDetail(sourceId) {
    const url = buildInaprocUrl(sourceId);
    if (!url) {
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handlePackageRowKeydown(event, sourceId) {
    if (!event) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") {
      return;
    }

    event.preventDefault();
    openPackageDetail(sourceId);
  }

  function bindEvents() {
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeRegionModal();
      }
    });

    dom.modal.addEventListener("click", (event) => {
      if (event.target === dom.modal) {
        closeRegionModal();
      }
    });
  }

  async function bootstrap() {
    renderBootstrapLoading();

    try {
      dashboardData = normalizeDashboardData(await fetchJson("/bootstrap"));
      regionsByKey = new Map(dashboardData.regions.map((region) => [region.regionKey, region]));
      provincesByKey = new Map(dashboardData.provinceView.provinces.map((province) => [province.provinceKey, province]));
      
      // Load UMKM data
      if (window.UMKMAnalyzer) {
        await UMKMAnalyzer.loadUMKMData();
      }
      
      // Load Kota Cimahi owners data
      await getCimahiOwners();
      
      renderKpis();
      renderLegend();
      initMap();
      renderFilterChips();
      renderTabs();
      renderSidebarContent();
    } catch (error) {
      renderBootstrapError(formatFetchError(error));
    }
  }

  window.dashboardActions = {
    changeModalPage,
    closeRegionModal,
    handlePackageRowKeydown,
    openAreaModal,
    openOwnerModal,
    openPackageDetail,
    setMapFilter,
    setModalOwnerType,
    setModalPriorityOnly,
    setModalSearch,
    setModalSeverity,
    setSearch,
    setSort,
    setTab,
  };

  bindEvents();
  bootstrap();
})();
