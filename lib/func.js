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

exports.getPost =async function(req, res, category=0, limit=0, order=0) {

    let sql;
    let params = [];

    // 1) order값에 따라 정렬 구문 설정
    let orderByClause = '';
    if (order === 0) {
        orderByClause = 'ORDER BY sortOrder ASC';
    } else if (order === 1) {
        orderByClause = 'ORDER BY createTime DESC';
    } else {
        // 기타 값이 들어오면 기본값(정렬 없음)이나
        // 또 다른 분기처리를 할 수 있음
        orderByClause = 'ORDER BY sortOrder ASC'; // 기본값
    }

    // 2) 카테고리 undefined와 limit에 따른 분기
    if (category === 0) {
        // 카테고리 미지정
        if (limit > 0) {
            sql = `SELECT * FROM post ${orderByClause} LIMIT ?`;
            params = [limit];
        } else {
            sql = `SELECT * FROM post ${orderByClause}`;
        }
    } else {
        // 카테고리 지정됨
        if (limit > 0) {
            sql = `SELECT * FROM post WHERE category = ? ${orderByClause} LIMIT ?`;
            params = [category, limit];
        } else {
            sql = `SELECT * FROM post WHERE category = ? ${orderByClause}`;
            params = [category];
        }
    }


    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
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

