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
const func = require('../lib/func')

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


app.use(express.static(path.join(__dirname, '../public')));
app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    res.render('index');
})

app.get('/upload',async(req, res) => {
    res.render('upload', { ... await func.getPost(req, res, 1) });
})

app.post('/upload/process', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: '파일 업로드 실패' });
    }

    // 파일 저장 경로 정의 (originalname 사용 예시)
    const saveDir = path.join(__dirname, '..', 'public/uploads');
    const filePath = path.join(saveDir, req.file.originalname);

    fs.writeFile(filePath, req.file.buffer, (fsErr) => {
        if (fsErr) {
            console.error('파일 저장 에러:', fsErr);
            return res.status(500).json({ message: '파일 저장 에러' });
        }

        // DB 저장용 경로
        const imageUrl = `/uploads/${req.file.originalname}`;

        // DB에 이미지 경로 삽입
        db.query(`INSERT INTO post (imageUrl, category, sortOrder)
  SELECT ?, ?, COALESCE(MIN(sortOrder), 0) - 1
  FROM post
  WHERE category = ?`, [imageUrl, 1,1], (dbErr, result) => {
            if (dbErr) {
                console.error('DB 저장 에러:', dbErr);
                
                
                
            }
            res.json('hi'); 
            // 성공 응답
            
            
        });
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
}
)

app.get('/login', (req, res) => {
    res.render('login');
})

app.post('/login/process', (req, res) => {
    console.log(req.body); 
    const { userId, password } = req.body;
    db.query('SELECT * FROM admin WHERE userId = ? AND password = ?', [userId, password], (err, result) => {

        console.log(result);

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
    res.render('changeOrder', { ... await func.getPost(req, res, category)});
})


app.get('/edit', (req, res) => {
    res.render('edit');
})

app.get('/manage', async (req, res) => {
    res.render('manage');
})
app.listen(PORT, () => {
    console.log('Server is running on http://localhost:',PORT);
})

module.exports = app;