// UMKM Integration Module
(() => {
  window.UMKMAnalyzer = {
    umkmData: null,
    
    async loadUMKMData() {
      try {
        const response = await fetch('assets/data/umkm-potential.json');
        if (!response.ok) throw new Error('Failed to load UMKM data');
        this.umkmData = await response.json();
        return this.umkmData;
      } catch (error) {
        console.warn('UMKM data not available:', error);
        return null;
      }
    },

    getRegionUMKMs(regionKey) {
      if (!this.umkmData || !this.umkmData[regionKey]) return null;
      return this.umkmData[regionKey];
    },

    // Analyze package opportunities for UMKMs
    analyzePackageOpportunities(regionUmkms, packages) {
      if (!regionUmkms || !packages) return null;

      const umkms = regionUmkms.umkms || [];
      const opportunities = [];

      umkms.forEach(umkm => {
        const matchedPackages = packages.filter(pkg => {
          const packageBudget = pkg.budget || 0;
          return packageBudget <= umkm.capacity && 
                 this.isSectorMatch(pkg.ownerName, umkm.sector);
        });

        if (matchedPackages.length > 0) {
          const totalValue = matchedPackages.reduce((sum, pkg) => sum + (pkg.budget || 0), 0);
          opportunities.push({
            umkm: umkm,
            matchedPackages: matchedPackages.length,
            totalValue: totalValue,
            utilizationPercentage: (totalValue / umkm.capacity) * 100,
            averagePackageSize: totalValue / matchedPackages.length
          });
        }
      });

      return opportunities.sort((a, b) => b.totalValue - a.totalValue);
    },

    isSectorMatch(ownerName, umkmSector) {
      const keywords = {
        'Konstruksi & Infrastruktur': ['renovasi', 'infrastruktur', 'jalan', 'jembatan', 'bangunan', 'konstruksi'],
        'Teknologi & Telekomunikasi': ['it', 'teknologi', 'telekomunikasi', 'software', 'sistem', 'server'],
        'Perdagangan & Logistik': ['supplies', 'perdagangan', 'logistik', 'distribusi', 'barang'],
        'Jasa Kreatif & Desain': ['desain', 'kreatif', 'iklan', 'komunikasi', 'media'],
        'Jasa Layanan': ['cleaning', 'kebersihan', 'layanan', 'jasa', 'maintenance']
      };

      const keywords_sector = keywords[umkmSector] || [];
      const ownerLower = ownerName.toLowerCase();
      
      return keywords_sector.some(keyword => ownerLower.includes(keyword));
    },

    // Generate UMKM summary HTML
    generateUMKMSummary(regionUmkms) {
      if (!regionUmkms) return '<div class="umkm-empty">Data UMKM tidak tersedia</div>';

      const umkms = regionUmkms.umkms || [];
      const opportunities = regionUmkms.opportunities || {};

      return `
        <div class="umkm-summary">
          <div class="umkm-header">
            <div class="umkm-title">📊 Potensi UMKM ${regionUmkms.regionName}</div>
          </div>
          
          <div class="umkm-stats-grid">
            <div class="umkm-stat">
              <div class="umkm-stat-label">Total UMKM</div>
              <div class="umkm-stat-value">${umkms.length}</div>
            </div>
            <div class="umkm-stat">
              <div class="umkm-stat-label">Total Kapasitas</div>
              <div class="umkm-stat-value">Rp ${this.formatCurrency(this.getTotalCapacity(umkms))}</div>
            </div>
            <div class="umkm-stat">
              <div class="umkm-stat-label">Potensi Nilai</div>
              <div class="umkm-stat-value">Rp ${this.formatCurrency(opportunities.total_potential_value || 0)}</div>
            </div>
            <div class="umkm-stat">
              <div class="umkm-stat-label">Avg Workers</div>
              <div class="umkm-stat-value">${Math.round(this.getAverageWorkers(umkms))}</div>
            </div>
          </div>

          <div class="umkm-sectors-label">Sektor Prioritas:</div>
          <div class="umkm-sectors">
            ${(opportunities.priority_sectors || []).map(sector => 
              `<span class="umkm-sector-tag">${this.escapeHtml(sector)}</span>`
            ).join('')}
          </div>

          <div class="umkm-list-title">Daftar UMKM Lokal:</div>
          <div class="umkm-list">
            ${umkms.slice(0, 5).map(umkm => `
              <div class="umkm-card">
                <div class="umkm-card-header">
                  <div class="umkm-name">${this.escapeHtml(umkm.name)}</div>
                  <div class="umkm-sector-badge">${this.escapeHtml(umkm.category)}</div>
                </div>
                <div class="umkm-card-body">
                  <div class="umkm-field"><span class="label">Sektor:</span> ${this.escapeHtml(umkm.sector)}</div>
                  <div class="umkm-field"><span class="label">Kapasitas:</span> Rp ${this.formatCurrency(umkm.capacity)}</div>
                  <div class="umkm-field"><span class="label">Karyawan:</span> ${umkm.workers} orang</div>
                  <div class="umkm-field"><span class="label">Pengalaman:</span> ${umkm.experience} tahun</div>
                  <div class="umkm-field"><span class="label">Sertifikasi:</span> ${umkm.certifications.join(', ')}</div>
                  <div class="umkm-field"><span class="label">Kontak:</span> ${this.escapeHtml(umkm.contactPerson)} - ${this.escapeHtml(umkm.phone)}</div>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="umkm-recommendations">
            <div class="umkm-rec-title">💡 Rekomendasi:</div>
            <ul class="umkm-rec-list">
              ${(opportunities.recommendations || []).map(rec => 
                `<li>${this.escapeHtml(rec)}</li>`
              ).join('')}
            </ul>
          </div>
        </div>
      `;
    },

    // Generate opportunities list
    generateOpportunitiesList(opportunities, maxItems = 10) {
      if (!opportunities || opportunities.length === 0) {
        return '<div class="umkm-empty">Tidak ada peluang untuk UMKM</div>';
      }

      return `
        <div class="umkm-opportunities">
          <div class="umkm-opp-title">🎯 Peluang Paket untuk UMKM:</div>
          <div class="umkm-opp-list">
            ${opportunities.slice(0, maxItems).map(opp => `
              <div class="umkm-opp-item">
                <div class="opp-umkm-name">${this.escapeHtml(opp.umkm.name)}</div>
                <div class="opp-details">
                  <span class="opp-badge">Paket: ${opp.matchedPackages}</span>
                  <span class="opp-value">Nilai: Rp ${this.formatCurrency(opp.totalValue)}</span>
                  <span class="opp-util" style="background:${this.getUtilizationColor(opp.utilizationPercentage)}">
                    Utilized: ${Math.round(opp.utilizationPercentage)}%
                  </span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    },

    // Render UMKM capacity vs opportunity chart
    renderCapacityChart(regionUmkms, canvasId) {
      if (!regionUmkms || typeof Chart === 'undefined') return;

      const ctx = document.getElementById(canvasId);
      if (!ctx) return;

      const umkms = regionUmkms.umkms || [];
      const labels = umkms.map(u => u.name);
      const capacities = umkms.map(u => u.capacity / 1000000000);

      if (window.umkmCharts && window.umkmCharts[canvasId]) {
        window.umkmCharts[canvasId].destroy();
      }

      if (!window.umkmCharts) window.umkmCharts = {};

      window.umkmCharts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Kapasitas (Rp Miliar)',
            data: capacities,
            backgroundColor: ['#b5a882', '#8b7332', '#d4a999', '#a83c2e', '#7b86a3'],
            borderColor: '#1c2847',
            borderWidth: 1
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1c2847',
              titleFont: { size: 10 },
              bodyFont: { size: 9 },
              borderColor: '#7b86a3',
              borderWidth: 1,
              padding: 6,
              callbacks: {
                label: (context) => `Rp ${context.parsed.x.toFixed(1)} Miliar`
              }
            }
          },
          scales: {
            x: {
              ticks: { color: '#6b6758', font: { size: 8 } },
              grid: { color: '#2a3a5e', drawBorder: false },
              beginAtZero: true
            },
            y: {
              ticks: { color: '#6b6758', font: { size: 7 } },
              grid: { display: false }
            }
          }
        }
      });
    },

    // Helper methods
    getTotalCapacity(umkms) {
      return umkms.reduce((sum, u) => sum + (u.capacity || 0), 0);
    },

    getAverageWorkers(umkms) {
      if (!umkms.length) return 0;
      return umkms.reduce((sum, u) => sum + (u.workers || 0), 0) / umkms.length;
    },

    formatCurrency(value) {
      if (value >= 1000000000) {
        return (value / 1000000000).toFixed(1) + 'M';
      } else if (value >= 1000000) {
        return (value / 1000000).toFixed(1) + 'K';
      }
      return value.toString();
    },

    getUtilizationColor(percentage) {
      if (percentage >= 80) return '#a83c2e';
      if (percentage >= 60) return '#d4a999';
      if (percentage >= 40) return '#8b7332';
      return '#7b86a3';
    },

    escapeHtml(text) {
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      };
      return String(text).replace(/[&<>"']/g, m => map[m]);
    }
  };
})();
