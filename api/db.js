require('dotenv').config();
const mysql = require('mysql2');
const db = mysql.createConnection({
    host: 'mydb.cn2imgu80o02.ap-northeast-2.rds.amazonaws.com',
    user: 'admin',
    password: '**Ww04110812',
    database: 'admin',
    port: 3301
});

module.exports = db;