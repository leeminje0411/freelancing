const express = require('express');
const app = express();
const session = require('express-session');
const path = require('path');
const ejs = require('ejs');
const multer = require('multer');
app.use(express.json()); 
const db = require('./db');
const fs = require('fs');
app.use(express.urlencoded({ extended: true }));
const func = require('../lib/func');
require('dotenv').config()
const s3 = require('../lib/s3');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// JSON 형식 요청을 파싱하기 위한 설정 (필요하면 추가)
app.use(express.json());
const PORT = 3002;
app.use(session({
    secret: 'my-secret-key',   // 🔥 세션 암호화 키 (랜덤한 값으로 설정!)
    resave: false,            // 변경 사항 없을 때도 계속 저장할지 여부 (false 추천)
    saveUninitialized: true,   // 초기화되지 않은 세션을 저장할지 여부 (true)
    cookie: {
        // secure: true,          // 🔥 HTTPS에서만 쿠키 전송 (HTTP에서는 false)
        httpOnly: true,        // 🔥 JavaScript에서 쿠키 접근 불가 (XSS 방지)
        sameSite: 'strict',    // 🔥 동일 사이트에서만 쿠키 전송 (CSRF 방지)
        maxAge: 1000 * 60 * 60 // 1시간 후 세션 만료
    }
}));
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

app.use(express.static(path.join(__dirname, '../public')));
app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    res.render('index');
})

app.get('/upload', async (req, res) => {
    res.render('upload', { ...await func.getPost(req, res, 1) });
})

app.post('/upload/process', upload.single('image'), (req, res) => {
    // 파일이 없다면 에러
    if (!req.file) {
        return res.status(400).json({ message: '파일이 없습니다.' });
    }

    // 파일 이름 중복 방지용으로 시간값 + 원본이름
    const fileName = Date.now() + '_' + req.file.originalname;

    // S3에 업로드할 파라미터
    const putParams = {
        Bucket: process.env.AWS_BUCKET_NAME,  // 업로드할 S3 버킷명 (환경변수로 설정)
        Key: fileName,                      // 업로드될 파일 이름
        Body: req.file.buffer,              // multer memoryStorage에서 받은 버퍼
        ContentType: req.file.mimetype      // MIME 타입
    };

    // 4) S3 업로드 (Promise .then / .catch)
    s3.send(new PutObjectCommand(putParams))
        .then(() => {
            // 성공적으로 업로드된 후, 이미지 접근 URL 만들기
            // (버킷이 퍼블릭으로 열려있다고 가정)
            const imageUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

            // DB 저장 (sortOrder를 MIN - 1 로 삽입 예시)
            const sql = `
                INSERT INTO post (imageUrl, category, sortOrder)
                SELECT ?, ?, COALESCE(MIN(sortOrder), 0) - 1
                FROM post
                WHERE category = ?
            `;
            db.query(sql, [imageUrl, 1, 1], (dbErr) => {
                if (dbErr) {
                    console.error('DB 저장 에러:', dbErr);
                    return res.status(500).json({ message: 'DB 저장 에러' });
                }
                // 성공 응답
                res.json({
                    message: '이미지 업로드 및 DB 저장 성공',
                    imageUrl: imageUrl
                });
            });
        })
        .catch((err) => {
            console.error('S3 업로드 에러:', err);
            res.status(500).json({ message: 'S3 업로드 실패', error: err.message });
        });
});

app.post('/post/delete', (req, res) => {
    const { postId } = req.body;
    db.query('DELETE FROM post WHERE id = ?', [postId], (err, result) => {
        if (err) {
            throw err;
        }
        res.redirect('/upload');
    });
});

app.get('/login', (req, res) => {
    res.render('login');
})

app.post('/login/process', (req, res) => {
    const { userId, password } = req.body;
    db.query('SELECT * FROM admin WHERE userId = ? AND password = ?', [userId, password], (err, result) => {
        if (err) {
            throw err;
        }
        if (result.length === 0) {
            return res.status(400).json({ message: '로그인 실패' });
        }
        req.session.primaryKey = result[0].id;
        res.render('manage');
    });
})

app.get('/changeOrder', async (req, res) => {
    const category = req.query.category;
    res.render('changeOrder', { ...await func.getPost(req, res, category) });
})

app.get('/edit', (req, res) => {
    res.render('edit');
})

app.get('/manage', async (req, res) => {
    res.render('manage');
})

app.listen(PORT, () => {
    console.log('Server is running on http://localhost:', PORT);
})

module.exports = app;