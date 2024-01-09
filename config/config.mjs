const config = {
  database: {
    host: "localhost",
    user: "postgres",
    password: "dspa",
    database: "peptideatlas",
    connectionLimit: 10,
  },
  database_pool: {
    host: "localhost",
    user: "postgres",
    password: "dspa",
    database: "peptideatlas",
    connectionLimit: 10,// 'dspa',
    port: 5432,
  },
  server: {
    port: 3023,
  },
  frontend: {
    path: '../dspa-frontend/'
  }
};
export default config;