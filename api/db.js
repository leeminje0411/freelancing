require('dotenv').config();
const mysql = require('mysql2');

let db;

function handleDisconnect() {
    db = mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT
    });

    db.connect((err) => {
        if (err) {
            console.error('데이터베이스 연결 실패:', err);
            setTimeout(handleDisconnect, 2000); // 2초 후에 다시 연결 시도
        } else {
            console.log('데이터베이스 연결 성공');
        }
    });

    db.on('error', (err) => {
        console.error('데이터베이스 연결 에러:', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            handleDisconnect(); // 연결이 끊어지면 다시 연결 시도
        } else {
            throw err;
        }
    });
}

handleDisconnect();

module.exports = db;