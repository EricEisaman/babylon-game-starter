/** @type {import('../types/settings').DeploymentSettings<'render.com'>} */
const deploymentSettings = {
  host: 'render.com',
  type: 'web-service',
  services: [
    {
      name: 'api',
      type: 'node',
      routePrefix: '/api',
      localPort: 8787
    },
    {
      name: 'multiplayer',
      type: 'go',
      routePrefix: '/api/multiplayer',
      localPort: 5000
    }
  ],
  static: {
    basePath: '/'
  }
};

export default deploymentSettings;
