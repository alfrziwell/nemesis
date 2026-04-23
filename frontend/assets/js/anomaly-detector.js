// Anomaly Detection Module
(() => {
  window.AnomalyDetector = {
    // Deteksi anomali dari data paket
    detectAnomalies(items) {
      if (!items || items.length === 0) return [];

      const anomalies = [];
      
      items.forEach((item, index) => {
        const anomalyFlags = [];
        const budget = item.budget || 0;
        const waste = item.audit?.potensiPemborosan || 0;
        const severity = item.audit?.severity || 'low';
        const riskScore = item.meta?.riskScore || 0;

        // 1. High Waste Ratio: Potensi pemborosan > 80% dari budget
        if (budget > 0 && waste / budget > 0.8) {
          anomalyFlags.push({
            type: 'HIGH_WASTE_RATIO',
            label: 'Waste Ratio Tinggi',
            severity: 'high',
            value: Math.round((waste / budget) * 100),
            unit: '%'
          });
        }

        // 2. Suspicious Budget Pattern: Budget sangat besar tapi waste rendah
        if (budget > 5000000000 && waste < budget * 0.1 && severity === 'low') {
          anomalyFlags.push({
            type: 'SUSPICIOUS_CLEAN',
            label: 'Budget Besar, Waste Rendah',
            severity: 'medium',
            value: `Rp ${this.formatCurrency(budget)}`,
            unit: 'Budget'
          });
        }

        // 3. Risk-Budget Mismatch: High risk tapi budget kecil (might be underreported)
        if (riskScore >= 3 && budget < 500000000) {
          anomalyFlags.push({
            type: 'RISK_MISMATCH',
            label: 'Risk Tinggi, Budget Rendah',
            severity: 'medium',
            value: riskScore,
            unit: 'Risk Score'
          });
        }

        // 4. Extreme Severity: Severity absurd atau high
        if (severity === 'absurd' || severity === 'high') {
          anomalyFlags.push({
            type: 'EXTREME_SEVERITY',
            label: `Severity ${this.capitalizeFirst(severity)}`,
            severity: 'critical',
            value: severity,
            unit: 'Level'
          });
        }

        // 5. Zero Budget dengan Waste: Budget 0 tapi ada waste
        if (budget === 0 && waste > 0) {
          anomalyFlags.push({
            type: 'MISSING_BUDGET',
            label: 'Budget Tidak Tercatat',
            severity: 'medium',
            value: `Rp ${this.formatCurrency(waste)}`,
            unit: 'Waste'
          });
        }

        if (anomalyFlags.length > 0) {
          anomalies.push({
            packageId: item.id,
            packageName: item.packageName,
            ownerName: item.ownerName,
            budget,
            waste,
            riskScore,
            severity,
            flags: anomalyFlags
          });
        }
      });

      // Sort by severity
      return anomalies.sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const maxSeverityA = Math.min(...a.flags.map(f => severityOrder[f.severity] || 3));
        const maxSeverityB = Math.min(...b.flags.map(f => severityOrder[f.severity] || 3));
        return maxSeverityA - maxSeverityB;
      });
    },

    // Hitung statistik anomali
    calculateAnomalyStats(anomalies) {
      if (!anomalies || anomalies.length === 0) {
        return {
          totalAnomalies: 0,
          critical: 0,
          high: 0,
          medium: 0,
          anomalyTypes: {}
        };
      }

      const stats = {
        totalAnomalies: anomalies.length,
        critical: 0,
        high: 0,
        medium: 0,
        anomalyTypes: {}
      };

      anomalies.forEach(anomaly => {
        anomaly.flags.forEach(flag => {
          stats[flag.severity] = (stats[flag.severity] || 0) + 1;
          stats.anomalyTypes[flag.type] = (stats.anomalyTypes[flag.type] || 0) + 1;
        });
      });

      return stats;
    },

    // Generate HTML untuk anomali list
    generateAnomalyHtml(anomalies) {
      if (!anomalies || anomalies.length === 0) {
        return '<div class="anomaly-empty">Tidak ada anomali terdeteksi</div>';
      }

      return anomalies.slice(0, 10).map(anomaly => {
        const maxSeverity = Math.max(...anomaly.flags.map(f => {
          const severityOrder = { critical: 3, high: 2, medium: 1, low: 0 };
          return severityOrder[f.severity] || 0;
        }));

        const severityColor = {
          3: '#a83c2e',
          2: '#d4a999',
          1: '#8b7332',
          0: '#7b86a3'
        }[maxSeverity];

        return `
          <div class="anomaly-item" style="border-left:3px solid ${severityColor}">
            <div class="anomaly-header">
              <div class="anomaly-pkg">${this.escapeHtml(anomaly.packageName)}</div>
              <div class="anomaly-owner">${this.escapeHtml(anomaly.ownerName)}</div>
            </div>
            <div class="anomaly-flags">
              ${anomaly.flags.map(flag => `
                <span class="anomaly-flag severity-${flag.severity.toLowerCase()}" title="${flag.label}">
                  ${this.escapeHtml(flag.label)}: ${this.escapeHtml(String(flag.value))}${flag.unit ? ' ' + flag.unit : ''}
                </span>
              `).join('')}
            </div>
            <div class="anomaly-meta">
              <span>Budget: Rp ${this.formatCurrency(anomaly.budget)}</span>
              <span>Waste: Rp ${this.formatCurrency(anomaly.waste)}</span>
              <span>Risk: ${anomaly.riskScore}</span>
            </div>
          </div>
        `;
      }).join('');
    },

    // Render chart anomali
    renderAnomalyChart(anomalies, canvasId) {
      if (!anomalies || anomalies.length === 0 || typeof Chart === 'undefined') return;

      const ctx = document.getElementById(canvasId);
      if (!ctx) return;

      const stats = this.calculateAnomalyStats(anomalies);
      const typeLabels = Object.keys(stats.anomalyTypes);
      const typeValues = Object.values(stats.anomalyTypes);

      // Destroy existing chart if any
      if (window.anomalyCharts && window.anomalyCharts[canvasId]) {
        window.anomalyCharts[canvasId].destroy();
      }

      if (!window.anomalyCharts) window.anomalyCharts = {};

      window.anomalyCharts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: typeLabels.map(t => this.formatAnomalyType(t)),
          datasets: [{
            label: 'Jumlah Paket',
            data: typeValues,
            backgroundColor: ['#a83c2e', '#d4a999', '#8b7332', '#7b86a3', '#b5a882'],
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
              padding: 6
            }
          },
          scales: {
            x: {
              ticks: { color: '#6b6758', font: { size: 8 } },
              grid: { color: '#2a3a5e', drawBorder: false },
              beginAtZero: true
            },
            y: {
              ticks: { color: '#6b6758', font: { size: 8 } },
              grid: { display: false }
            }
          }
        }
      });
    },

    // Helper methods
    capitalizeFirst(str) {
      return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    },

    formatAnomalyType(type) {
      const typeMap = {
        HIGH_WASTE_RATIO: 'Waste Ratio Tinggi',
        SUSPICIOUS_CLEAN: 'Budget Besar, Waste Rendah',
        RISK_MISMATCH: 'Risk Tinggi, Budget Rendah',
        EXTREME_SEVERITY: 'Severity Ekstrem',
        MISSING_BUDGET: 'Budget Tidak Tercatat'
      };
      return typeMap[type] || type;
    },

    formatCurrency(value) {
      if (value >= 1000000000) {
        return (value / 1000000000).toFixed(1) + 'M';
      } else if (value >= 1000000) {
        return (value / 1000000).toFixed(1) + 'K';
      }
      return value.toString();
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
