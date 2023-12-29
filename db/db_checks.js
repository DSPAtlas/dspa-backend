import net from 'net';
import ping from 'ping';
import mysql from 'mysql2';




export async function checkMySQLServerAvailability(host, port) {
  const socket = new net.Socket();

  return new Promise((resolve, reject) => {
    socket.setTimeout(5000); // Set a timeout for the connection attempt

    // Attempt to connect to the MySQL server
    socket.connect(port, host);

    // Connection successful
    socket.on('connect', () => {
      socket.end(); // Close the socket once connected
      resolve('MySQL server is reachable.');
    });

    // Connection error
    socket.on('error', (error) => {
      socket.destroy(); // Destroy the socket on error
      reject(`Error connecting to MySQL server: ${error.message}`);
    });

    // Timeout
    socket.on('timeout', () => {
      socket.destroy(); // Destroy the socket on timeout
      reject('Connection to MySQL server timed out.');
    });
  });
};


export async function checkMySQLConnection(config) {
    console.log('Used MySQL User:', config.user);
    const connection = mysql.createConnection(config);
  
    try {
      // Use promise wrapper for connection
      const promiseConnection = connection.promise();
  
      // Attempt to connect to the MySQL server
      await promiseConnection.execute('SELECT 1');
  
      console.log('Connected to the MySQL database');
      return true;
    } catch (error) {
      console.error('Error connecting to MySQL database:', error.message);
      return false;
    } finally {
      // Close the connection
      connection.end();
    }
  };


export async function checkMySQLServerReachability(host){
    try {
      const res = await ping.promise.probe(host);
      return res.alive;
    } catch (error) {
      console.error('Error checking MySQL server reachability:', error.message);
      return false;
    }
  };


export async function checkMySQLServerConfiguration(config) {
    const connection = mysql.createConnection(config);
    try {
      // Use promise wrapper for connection
      const promiseConnection = connection.promise();
  
      // Query to get MySQL server variables
      const [rows] = await promiseConnection.execute('SHOW VARIABLES');
  
      // Display some relevant server variables
      console.log('MySQL Server Configuration:');
      console.log(`- Hostname: ${config.host}`);
      console.log(`- Port: ${config.port}`);
      console.log(`- MySQL Version: ${rows.find((row) => row.Variable_name === 'version').Value}`);
      console.log(`- Max Connections: ${rows.find((row) => row.Variable_name === 'max_connections').Value}`);
  
      // Add more variables as needed
  
      return true;
    } catch (error) {
      console.error('Error checking MySQL server configuration:', error.message);
      return false;
    } finally {
      // Close the connection
      connection.end();
    }
  };
  
  

export async function checkMySQLUserPermissions(config) {
    const connection = mysql.createConnection(config);
  
    try {
      // Use promise wrapper for connection
      const promiseConnection = connection.promise();
  
      // Query to get user privileges
      const [rows] = await promiseConnection.execute(
        `SHOW GRANTS FOR '${config.user}'@'${config.host}'`
      );
  
      console.log(`MySQL User Permissions for ${config.user}@${config.host}:`);
      rows.forEach((row) => {
        console.log(`- ${row['Grants for ' + config.user + '@' + config.host]}`);
      });
  
      return true;
    } catch (error) {
      console.error('Error checking MySQL user permissions:', error.message);
      return false;
    } finally {
      // Close the connection
      connection.end();
    }
  }
  

export async function checkMySQLConnectionPool(config)  {
    const pool = mysql.createPool(config);
  
    try {
        // Acquire a connection from the pool
        const connection = await pool.promise().getConnection();

        // Get the current connection pool statistics
        const poolStats = connection._pool;
  
        console.log('MySQL Connection Pool Status:');
        console.log(`- Connections in use: ${poolStats._allConnections.length}`);
        console.log(`- Connections available: ${poolStats._freeConnections.length}`);
        console.log(`- Connection queue length: ${poolStats._connectionQueue.length}`);
        console.log(`- Maximum connections: ${poolStats.config.connectionLimit}`);
    
        // Add more metrics as needed
    
        return true;
    } catch (error) {
        console.error('Error checking MySQL connection pool:', error.message);
        return false;
    } finally {
        // Close the pool
        pool.end();
    }
}