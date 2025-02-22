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
const { serialize } = require('cookie');
const token = 'myTokenValue';
const cookieParser = require('cookie-parser');
app.use(cookieParser()); 
const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const { GoogleAuth } = require('google-auth-library');
const propertyId = '479085116';
const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
credentials.private_key = credentials.private_key.split(String.raw`\n`).join('\n');
const cors = require('cors');
app.use(cors({
    origin: '*', // 혹은 특정 도메인만 허용 가능
    credentials: true
}));

// 🔥 GoogleAuth 설정
const auth = new GoogleAuth({
    credentials, // JSON을 직접 사용 (private_key 변환 없음)
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
});


const analyticsDataClient = new BetaAnalyticsDataClient({ auth });
async function testGoogleAnalytics() {
    try {
        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],  // 🔥 최근 7일 데이터
            metrics: [
                { name: 'activeUsers' },      // 🔥 활성 사용자 수
                { name: 'sessions' },         // 🔥 총 방문자(세션) 수
                { name: 'screenPageViews' }   // 🔥 총 페이지뷰 수
            ],
            dimensions: [{ name: 'date' }]   // 🔥 날짜별 데이터
        });

        console.log('✅ 방문자 수 데이터:', response.rows.map(row => ({
            date: row.dimensionValues[0].value,   // 날짜
            activeUsers: row.metricValues[0].value,  // 활성 사용자 수
            sessions: row.metricValues[1].value,     // 방문자(세션) 수
            pageViews: row.metricValues[2].value,    // 페이지뷰 수
        })));
    } catch (error) {
        console.error('❌ Google API 호출 오류:', error);
    }
}

testGoogleAnalytics();


const serializedCookie = serialize('id', 'myCookieValue', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60,
    path: '/'
});
// JSON 형식 요청을 파싱하기 위한 설정 (필요하면 추가)
app.use(express.json());
const PORT = 3002;

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

app.get('/', async (req, res) => {
    res.render('index', { ...await func.getCategory(req, res) }
);
})
app.get('/project', async (req, res) => {
    const query = req.query.id
    console.log({... await func.getPost(req, res, query, 0, 1)});
        res.render('projectPage', {... await func.getPost(req, res, query,0, 0, 1), ...await func.getCategory(req, res)});
})

app.get('/upload', async (req, res) => {
    if (!req.cookies.id)  {
        return res.redirect('/login');
    }
    res.render('upload', { ...await func.getPost(req, res, 0, 0, 1), ...await func.getCategory(req, res) });
})

app.post('/upload/process', upload.array('images'), (req, res) => {
    // 1) 로그인 세션/쿠키 확인

    console.log("✅ 업로드 요청 받음");
    console.log("요청한 파일 목록:", req.files);
    console.log("요청한 카테고리:", req.body.category);
    console.log("클라이언트 IP:", req.ip);
    if (!req.cookies.id) {
        return res.redirect('/login');
    }

    // 2) 파일 배열 유무 확인
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: '업로드된 파일이 없습니다.' });
    }

    // 3) 카테고리 값
    const category = req.body.category;

    // 4) 각각의 파일을 Sharp 처리 후 S3 업로드
    //    Promise.all() 사용해 병렬 처리
    const uploadPromises = req.files.map(file => {
        // Sharp 변환(예: 품질 80, 필요시 resize)
        return sharp(file.buffer)
            .jpeg({ quality: 80 })
            .toBuffer()
            .then(processedBuffer => {
                // S3에 저장할 파일명
                const fileName = Date.now() + '_' + file.originalname;

                // 업로드 파라미터
                const putParams = {
                    Bucket: process.env.S3_BUCKET_NAME,
                    Key: fileName,
                    Body: processedBuffer,
                    ContentType: 'image/jpeg'
                };

                // S3 업로드
                return s3.send(new PutObjectCommand(putParams))
                    .then(() => {
                        // 업로드 완료 시 S3 URL 생성
                        const imageUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

                        return imageUrl;  // 나중에 DB 저장 위해 반환
                    });
            })
            .catch(err => {
                throw new Error('Sharp 변환 에러: ' + err.message);
            });
    });

    // 5) 모든 파일의 업로드가 끝나면 DB에 기록
    Promise.all(uploadPromises)
        .then(imageUrls => {
            // imageUrls: 변환 및 업로드가 끝난 S3 URL들의 배열

            // DB INSERT 처리(파일 개수만큼 레코드 생성)
            // 예: 각각 INSERT OR 여러 건을 한 번에 INSERT (원하는 방식대로)
            // 간단히 forEach로 개별 INSERT 예시:
            let completed = 0; // 처리된 insert 횟수
            let hasError = false;

            imageUrls.forEach(url => {
                const sql = `
          INSERT INTO post (imageUrl, category, sortOrder)
          SELECT ?, ?, COALESCE(MIN(sortOrder), 0) - 1
          FROM post
          WHERE category = ?
        `;
                db.query(sql, [url, category, category], (dbErr) => {
                    if (dbErr) {
                        hasError = true;
                        console.error('DB INSERT 에러:', dbErr);
                        // 실패했어도 나머지 insert는 계속 시도
                    }
                    completed++;
                    // 모든 insert가 끝나면 결과 반환
                    if (completed === imageUrls.length) {
                        if (hasError) {
                            return res.status(500).json({
                                message: '일부 DB INSERT 처리 중 에러 발생'
                            });
                        }
                        // 전부 성공 시
                        res.json({
                            message: '모든 이미지 업로드 및 DB 저장 성공',
                            urls: imageUrls
                        });
                    }
                });
            });
        })
        .catch(err => {
            console.error('업로드 처리 중 에러:', err);
            res.status(500).json({ message: '이미지 처리/업로드 실패', error: err.message });
        });
});

app.post('/post/delete', (req, res) => {
    if (!req.cookies.id)  {
        return res.redirect('/login');
    }
    const { postId } = req.body;
    db.query('DELETE FROM post WHERE id = ?', [postId], (err, result) => {
        if (err) {
            throw err;
        }
        res.redirect(`/changeOrder?category=${req.body.currentCategory}`);
    });
});


app.post('/post/updateOrder', (req, res) => {
    // 세션/쿠키 검사 (예: 로그인 여부)
    if (!req.cookies.id) {
        // 로그인 안 되어 있으면 로그인 페이지로 리다이렉트
        return res.redirect('/login');
    }

    // 클라이언트에서 넘어온 [{id: '3', sortOrder: 1}, ...] 데이터
    const orderData = req.body;

    // Promise.all로 병렬 업데이트
    const updates = orderData.map(item => {
        return new Promise((resolve, reject) => {
            db.query(
                'UPDATE post SET sortOrder = ? WHERE id = ?',
                [item.sortOrder, item.id],
                (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                }
            );
        });
    });

    Promise.all(updates)
        .then(() => {
            // 모든 업데이트가 성공하면
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
        res.setHeader('Set-Cookie', serializedCookie);
        res.redirect('/manage');
    });
})

app.get('/changeOrder', async (req, res) => {
    if (!req.cookies.id) {
        return res.redirect('/login');
    }
    let order = 0;
    
    const categoryNum = req.query.category;
    console.log('categoryNum : ',categoryNum);
    if (categoryNum==1){order=1}
    res.render('changeOrder', { ...await func.getPost(req, res, categoryNum,order,0), ...await func.getCategory(req, res), categoryNum });
})

app.get('/edit', (req, res) => {
    if (!req.cookies.id)  {
        return res.redirect('/login');
    }
    res.render('edit');
})

app.get('/manage', async (req, res) => {
    if (!req.cookies.id) {
        return res.redirect('/login');
    } else {
        try {
            const [response] = await analyticsDataClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [
                    { startDate: '30daysAgo', endDate: 'today' }
                ],
                metrics: [
                    { name: 'activeUsers' }
                ],
                dimensions: [
                    { name: 'date' }
                ]
            });

            // rows 배열 → { date: '23-09-19', count: '123' } 형태로 가공
            const dailyData = response?.rows?.map(row => {
                const dateStr = row.dimensionValues?.[0]?.value;  // 예: '20230919'
                const countStr = row.metricValues?.[0]?.value;    // 예: '123'

                // dateStr → 'YYYYMMDD' 파싱
                const year = dateStr.slice(0, 4);    // '2023'
                const month = dateStr.slice(4, 6);   // '09'
                const day = dateStr.slice(6, 8);     // '19'
                // 연도 2자리 줄임
                const shortYear = year.slice(2);     // '23'
                const formattedDate = `${shortYear}-${month}-${day}`; // '23-09-19'

                return {
                    date: formattedDate,
                    count: countStr
                };
            }) || [];

            console.log(dailyData);

            // EJS 렌더링
            res.render('manage', {
                ...await func.getCategory(req, res),
                ...await func.getPost(req, res, 1, 15, 1),
                dailyData
            });
        } catch (error) {
            console.error('GA4 API Error:', error);
            res.status(500).send('<h1>GA4 데이터 불러오기 실패</h1>');
        }
    }
});
app.use((req, res, next) => {
    // 404 상태 코드 설정
    res.status(404);

    // 1) 단순 문자열 응답
    // res.send('페이지를 찾을 수 없습니다.');

    // 2) 혹은 ejs 등 템플릿으로 404 전용 페이지 렌더
    res.render('');
});
app.listen(PORT, () => {
    console.log('Server is running on http://localhost:', PORT);
})

module.exports = app;