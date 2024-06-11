const sql = require('mssql');
const config = require('../config/config');

const poolPromise = new sql.ConnectionPool(config.db)
  .connect()
  .then(pool => {
    console.log('Connected to SQL Server');
    return pool;
  })
  .catch(err => console.error('Database Connection Failed:', err));

module.exports = {
  sql,
  poolPromise
};
