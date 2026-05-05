/** @type {import('../types/settings').DeploymentSettings<'render.com'>} */
const deploymentSettings = {
<<<<<<< HEAD
  host: 'render.com',
  type: 'static',
=======
  host: 'netlify',
  type: 'static',
>>>>>>> 4adeada54c0affd2fc1451884ce1a64855fa5a09
  services: [
    {
<<<<<<< HEAD
      name: 'api',
      type: 'static',
      routePrefix: '/api',
      localPort: 8787
    },
    {
=======
>>>>>>> 4adeada54c0affd2fc1451884ce1a64855fa5a09
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
