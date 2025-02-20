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
// const s3 = require('../lib/s3');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');

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
    if (!req.session.primaryKey) {
        return res.redirect('/login');
    }
    res.render('upload', { ...await func.getPost(req, res, 1), ...await func.getCategory(req, res) });
})

app.post('/upload/process', upload.single('image'), (req, res) => {
    if (!req.session.primaryKey) {
        return res.redirect('/login');
    }
    // 1) 파일 유무 확인
    if (!req.file) {
        return res.status(400).json({ message: '파일이 없습니다.' });

    }
        const category = req.body.category;

    // 2) Sharp 처리(가정: JPEG 품질만 80으로 변경, 원본 크기는 그대로)
    sharp(req.file.buffer)
        .jpeg({ quality: 80 })  // 필요하면 .resize({ width: 800 }) 추가
        .toBuffer()

        // 3) Sharp 결과물(버퍼)이 나오면 S3 업로드
        .then(processedBuffer => {
            // 업로드될 파일명
            const fileName = Date.now() + '_' + req.file.originalname;

            // S3 파라미터
            const putParams = {
                Bucket: process.env.S3_BUCKET_NAME,
                Key: fileName,
                Body: processedBuffer,       // Sharp로 압축된 버퍼
                ContentType: 'image/jpeg'    // JPEG 포맷
            };

            return s3.send(new PutObjectCommand(putParams))
                .then(() => ({ fileName }));
            // 다음 then()으로 넘기기 위해 { fileName }만 반환
        })

        // 4) DB 저장
        .then(({ fileName }) => {
            // S3 링크 구성
            const imageUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

            const sql = `
        INSERT INTO post (imageUrl, category, sortOrder)
        SELECT ?, ?, COALESCE(MIN(sortOrder), 0) - 1
        FROM post
        WHERE category = ?
      `;
            db.query(sql, [imageUrl, category, category], (dbErr) => {
                if (dbErr) {
                    console.error('DB 저장 에러:', dbErr);
                    return res.status(500).json({ message: 'DB 저장 에러' });
                }

                // 성공 응답
                res.json({
                    message: '이미지(Sharp) 업로드 및 DB 저장 성공',
                    imageUrl: imageUrl
                });
            });
        })

        // 5) 에러 처리
        .catch(err => {
            console.error('이미지 처리/업로드 에러:', err);
            res.status(500).json({ message: '이미지 처리/업로드 실패', error: err.message });
        });
});

app.post('/post/delete', (req, res) => {
    if (!req.session.primaryKey) {
        return res.redirect('/login');
    }
    const { postId } = req.body;
    db.query('DELETE FROM post WHERE id = ?', [postId], (err, result) => {
        if (err) {
            throw err;
        }
        res.redirect('/upload');
    });
});

app.post('/post/updateOrder', (req, res) => {
    if (!req.session.primaryKey) {
        return res.redirect('/login');
    }
    const orderData = req.body;
    // 예: [{id: '3', sortOrder: 1}, {id: '5', sortOrder: 2}, ...]

    // Promise.all로 병렬 업데이트
    const updates = orderData.map(item => {
        return new Promise((resolve, reject) => {
            db.query(
                'UPDATE post SET sortOrder = ? WHERE id = ?',
                [item.sortOrder, item.id],
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                }
            );
        });
    });

    Promise.all(updates)
        .then(() => {
            res.json({ success: true });
        })
        .catch(err => {
            console.error('정렬 업데이트 에러:', err);
            res.status(500).json({ success: false, message: 'DB 업데이트 실패' });
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
        req.session.save(() => {});
        res.redirect('/upload');
    });
})

app.get('/changeOrder', async (req, res) => {
    if(!req.session.primaryKey){
        return res.redirect('/login');
    }
    const category = req.query.category;
    res.render('changeOrder', { ...await func.getPost(req, res, category), ...await func.getCategory(req, res) });
})

app.get('/edit', (req, res) => {
    if (!req.session.primaryKey) {
        return res.redirect('/login');
    }
    res.render('edit');
})

app.get('/manage', async (req, res) => {
    if (!req.session.primaryKey) {
        return res.redirect('/login');
    }
    res.render('manage');
})

app.listen(PORT, () => {
    console.log('Server is running on http://localhost:', PORT);
})

module.exports = app;