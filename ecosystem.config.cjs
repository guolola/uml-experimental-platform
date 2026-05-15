const renderServiceEnv = {
  NODE_ENV: "production",
  RENDER_SERVICE_HOST: "127.0.0.1",
  RENDER_SERVICE_PORT: "4002",
};

const apiEnv = {
  NODE_ENV: "production",
  API_HOST: "127.0.0.1",
  API_PORT: "4001",
  RENDER_SERVICE_BASE_URL: "http://127.0.0.1:4002",
};

module.exports = {
  apps: [
    {
      name: "uml-render-service",
      cwd: __dirname,
      script: "bash",
      args: [
        "-lc",
        "cd \"$PWD\" && RENDER_SERVICE_HOST=127.0.0.1 RENDER_SERVICE_PORT=4002 node apps/render-service/dist/index.js",
      ],
      instances: 1,
      exec_mode: "fork",
      env: renderServiceEnv,
      env_production: renderServiceEnv,
      max_memory_restart: "512M",
      time: true,
    },
    {
      name: "uml-api",
      cwd: __dirname,
      script: "bash",
      args: [
        "-lc",
        "cd \"$PWD\" && API_HOST=127.0.0.1 API_PORT=4001 RENDER_SERVICE_BASE_URL=http://127.0.0.1:4002 node apps/api/dist/index.js",
      ],
      instances: 1,
      exec_mode: "fork",
      env: apiEnv,
      env_production: apiEnv,
      max_memory_restart: "768M",
      time: true,
    },
  ],
};
