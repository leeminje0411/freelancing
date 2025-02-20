require('dotenv').config();
const db = require('../api/db');

async function getPost(req, res, category) {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT * FROM post WHERE category = ? ORDER BY sortOrder ASC';
        db.query(sql, [category], (err, results) => {
            if (err) {
                console.error('게시물 가져오기 오류:', err);
                return reject(err);
            }
            resolve({ post: results });
        });
    });
}

module.exports = {
    getPost
};