const releaseEnv = {
  ...(process.env.UML_RELEASE_SHA
    ? { UML_RELEASE_SHA: process.env.UML_RELEASE_SHA }
    : {}),
  ...(process.env.UML_RELEASE_DIR
    ? { UML_RELEASE_DIR: process.env.UML_RELEASE_DIR }
    : {}),
  ...(process.env.UML_RELEASE_STARTED_AT
    ? { UML_RELEASE_STARTED_AT: process.env.UML_RELEASE_STARTED_AT }
    : {}),
};

const corsEnv = {
  ...(process.env.API_CORS_ORIGINS
    ? { API_CORS_ORIGINS: process.env.API_CORS_ORIGINS }
    : {}),
  ...(process.env.RENDER_SERVICE_CORS_ORIGINS
    ? { RENDER_SERVICE_CORS_ORIGINS: process.env.RENDER_SERVICE_CORS_ORIGINS }
    : {}),
};

const documentEnv = {
  ...(process.env.ONLYOFFICE_DOCUMENT_SERVER_URL
    ? { ONLYOFFICE_DOCUMENT_SERVER_URL: process.env.ONLYOFFICE_DOCUMENT_SERVER_URL }
    : {}),
  ...(process.env.PUBLIC_API_BASE_URL
    ? { PUBLIC_API_BASE_URL: process.env.PUBLIC_API_BASE_URL }
    : {}),
  ...(process.env.ONLYOFFICE_JWT_SECRET
    ? { ONLYOFFICE_JWT_SECRET: process.env.ONLYOFFICE_JWT_SECRET }
    : {}),
  ...(process.env.ONLYOFFICE_ACCESS_TOKEN_SECRET
    ? { ONLYOFFICE_ACCESS_TOKEN_SECRET: process.env.ONLYOFFICE_ACCESS_TOKEN_SECRET }
    : {}),
  ...(process.env.UML_DOCUMENT_STORAGE_DIR
    ? { UML_DOCUMENT_STORAGE_DIR: process.env.UML_DOCUMENT_STORAGE_DIR }
    : {}),
};

const renderServiceEnv = {
  NODE_ENV: "production",
  RENDER_SERVICE_HOST: "127.0.0.1",
  RENDER_SERVICE_PORT: "4002",
  ...releaseEnv,
  ...corsEnv,
};

const apiEnv = {
  NODE_ENV: "production",
  API_HOST: "127.0.0.1",
  API_PORT: "4001",
  RENDER_SERVICE_BASE_URL: "http://127.0.0.1:4002",
  ...releaseEnv,
  ...corsEnv,
  ...documentEnv,
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
