/** @type {import('../types/settings').DeploymentSettings<'netlify'>} */
const deploymentSettings = {
  host: 'netlify',
  type: 'static',
  services: [
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
