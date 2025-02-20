const express = require('express');
const app = express();
const session = require('express-session');
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));
const ejs = require('ejs');
const multer = require('multer');
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
app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    res.render('index');
})
// app.listen(PORT, () => {
//     console.log('Server is running on http://localhost:',PORT);
// })

module.exports = app;