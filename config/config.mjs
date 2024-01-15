const config = {
  database: {
    host: "localhost",
    user: "postgres",
    password: "dspa",
    database: "peptideatlas",
    connectionLimit: 10,
  },
  databasepool: {
    host: "localhost",
    user: "postgres",
    password: "dspa",
    database: "peptideatlas",
    connectionLimit: 10,// 'dspa',
    //port: 5432, 
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    waitForConnections: true,
  },
  server: {
    backend_port: 3000,
    frontend_port: 3001
  },
  frontend: {
    path: '../dspa-frontend/'
  }
};
export default config;