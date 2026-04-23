// Dashboard visualization module - Khusus untuk area tertentu
(() => {
  let chartInstances = {};

  const CHART_COLORS = {
    severityColors: ['#7b86a3', '#8b7332', '#d4a999', '#a83c2e'], // low, med, high, absurd
    ownerColors: ['#b5a882', '#8b7332', '#d4a999', '#7b86a3'], // central, provinsi, kabkota, other
    categoryColors: ['#8b7332', '#b5a882', '#d4a999', '#a83c2e']
  };

  window.DashboardViz = {
    initAreaCharts(area) {
      if (!area || typeof Chart === 'undefined') return;

      setTimeout(() => {
        this.renderAreaSeverityChart(area);
        this.renderAreaOwnerChart(area);
      }, 100);
    },

    renderAreaSeverityChart(area) {
      if (!area.severityCounts) return;

      const ctx = document.getElementById('area-severity-chart');
      if (!ctx) return;

      if (chartInstances.areaSeverity) {
        chartInstances.areaSeverity.destroy();
      }

      const severityData = area.severityCounts;
      const total = (severityData.med || 0) + (severityData.high || 0) + (severityData.absurd || 0);
      
      chartInstances.areaSeverity = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Medium', 'High', 'Absurd'],
          datasets: [{
            data: [severityData.med || 0, severityData.high || 0, severityData.absurd || 0],
            backgroundColor: [CHART_COLORS.severityColors[1], CHART_COLORS.severityColors[2], CHART_COLORS.severityColors[3]],
            borderColor: '#1c2847',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                font: { size: 9, family: "'Plus Jakarta Sans', sans-serif" },
                color: '#a09b8e',
                padding: 6,
                usePointStyle: true
              }
            },
            tooltip: {
              backgroundColor: '#1c2847',
              titleFont: { size: 10 },
              bodyFont: { size: 9 },
              borderColor: '#7b86a3',
              borderWidth: 1,
              padding: 6,
              displayColors: true,
              callbacks: {
                label: (context) => {
                  const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : '0';
                  return `${context.label}: ${context.parsed} (${percentage}%)`;
                }
              }
            }
          }
        }
      });
    },

    renderAreaOwnerChart(area) {
      if (!area.ownerMix) return;

      const ctx = document.getElementById('area-owner-chart');
      if (!ctx) return;

      if (chartInstances.areaOwner) {
        chartInstances.areaOwner.destroy();
      }

      const ownerMix = area.ownerMix;
      const labels = ['Kementerian', 'Pemprov', 'Pemkot', 'Lainnya'];
      const data = [
        ownerMix.central || 0,
        ownerMix.provinsi || 0,
        ownerMix.kabkota || 0,
        ownerMix.other || 0
      ];

      chartInstances.areaOwner = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Total Paket',
            data: data,
            backgroundColor: CHART_COLORS.ownerColors,
            borderColor: '#7b86a3',
            borderWidth: 1
          }]
        },
        options: {
          indexAxis: 'x',
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
              grid: { display: false }
            },
            y: {
              ticks: { color: '#6b6758', font: { size: 8 } },
              grid: { color: '#2a3a5e', drawBorder: false },
              beginAtZero: true
            }
          }
        }
      });
    },

    destroy() {
      Object.values(chartInstances).forEach(chart => {
        if (chart) chart.destroy();
      });
      chartInstances = {};
    }
  };
})();
