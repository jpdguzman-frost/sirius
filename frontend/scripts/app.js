/* Sirius frontend shell — Ractive instance (ARES conventions).
   All methods are wired into this instance; tab scripts contribute
   method objects as they land in phase 7. */

const app = new Ractive({
  target: '#app',
  template: '#tpl-app',
  data: {
    activeTab: 'pipeline',
    projectName: '',
    tabs: [
      { id: 'requests', label: 'Requests' },
      { id: 'pipeline', label: 'Pipeline' },
      { id: 'schedules', label: 'Sprint Schedules' },
      { id: 'deadlines', label: 'Deadlines' },
      { id: 'forecast', label: 'Forecast' },
    ],
    placeholder: 'Sirius shell — tabs land in phase 7, behind the model gate.',
  },
});

app.on('switchTab', (ctx, id) => {
  app.set('activeTab', id);
});
