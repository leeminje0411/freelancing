require('dotenv').config();
const db = require('../api/db');

exports.is_user = async function (req, res) {
    let obj = {};
    await new Promise(resolve => {
        if (req.session.primarykey) {

            db.query('SELECT * FROM admin WHERE id =?', [req.session.primarykey], (err, results) => {
                if (err) {
                    throw err;
                }
                const data = results[0];

                obj = { username: data };
                resolve();
            })
        } else {
            obj = { username: false }
            resolve();
        }

    }
    )
    return obj;

}

exports.getPost =async function(req, res, category) {
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

exports.getCategory= async function(req, res) {


    return new Promise((resolve, reject) => {
        const sql = 'SELECT * FROM category ORDER BY id';
        db.query(sql, (err, results) => {
            if (err) {
                console.error('게시물 가져오기 오류:', err);
                return reject(err);
            }
            resolve({ category: results });
        });
    });
}

