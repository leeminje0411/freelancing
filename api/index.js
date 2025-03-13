// api/index.js

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
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
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
const livereload = require('livereload');
const connectLivereload = require('connect-livereload');
const supabase = require('../lib/supabase');

app.use(cors({
    origin: 'https://freelancing-git-main-leeminjes-projects.vercel.app/', // 혹은 특정 도메인만 허용 가능
    credentials: true
}));

// ★ LiveReload 미들웨어를 Express에 연결(HTML에 LiveReload 스크립트 주입) ★
app.use(connectLivereload());

function extractS3Key(imageUrl) {
    // 예: https://mybucket.s3.ap-northeast-2.amazonaws.com/파일명.jpg
    // -> "파일명.jpg"
    const parts = imageUrl.split('.com/');
    if (parts.length < 2) return null;
    return parts[1];
}

// 🔥 GoogleAuth 설정
const auth = new GoogleAuth({
    credentials, // JSON을 직접 사용 (private_key 변환 없음)
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
});

const liveReloadServer = livereload.createServer({
  exts: ['js', 'ejs', 'json'], // 감지할 파일 확장자
  delay: 100, // 새로고침 딜레이 (ms)
});

liveReloadServer.watch(path.join(__dirname, '..', 'views'));
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
  try {
    // getCategory로부터 { category: [...] } 형태
    const { category } = await func.getCategory(req, res);

    // index.ejs 렌더 시 isMain: true, category: ...
    res.render('index', {
      isMain: true,
      category  // == category: category
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});


app.get('/project', async (req, res) => {
  try {
    const query = req.query.id;

    // Post 데이터 & Category 데이터 각각 호출
    const postResult = await func.getPost(req, res, query, 0, 0, 1);
    const categoryResult = await func.getCategory(req, res);

    // render 시 isMain: false로 지정 + 나머지 spread
    res.render('projectPage', {
      isMain: false,
      ...postResult,
      ...categoryResult
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});



app.get('/studio-oven', async (req, res) => {
  try {
    const { category } = await func.getCategory(req, res);
    res.render('studio-oven', {
      isMain: false,
      category
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});


app.get('/contact', async (req, res) => {
  try {
    const { category } = await func.getCategory(req, res);
    res.render('contact', {
      isMain: false,
      category
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

app.get('/about-us/studio-oven', async (req, res) => {
  try {
    const { category } = await func.getCategory(req, res);

    // "defaultTab: 'about'" 혹은 "studioOven" 같은 
    // 구분용 변수를 넘기면 됩니다.
    res.render('About', {
      isMain: false,
      category,
      defaultTab: 'studio-oven'     // ← EJS에 넘길 탭 정보
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

app.get('/about-us/ci', async (req, res) => {
  try {
    const { category } = await func.getCategory(req, res);

    // "defaultTab: 'about'" 혹은 "studioOven" 같은 
    // 구분용 변수를 넘기면 됩니다.
    res.render('About', {
      isMain: false,
      category,
      defaultTab: 'ci'     // ← EJS에 넘길 탭 정보
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});
app.get('/about-us/history', async (req, res) => {
  try {
    const { category } = await func.getCategory(req, res);

    // "defaultTab: 'about'" 혹은 "studioOven" 같은 
    // 구분용 변수를 넘기면 됩니다.
    res.render('About', {
      isMain: false,
      category,
      defaultTab: 'history'     // ← EJS에 넘길 탭 정보
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});
app.get('/about-us/organization', async (req, res) => {
  try {
    const { category } = await func.getCategory(req, res);

    // "defaultTab: 'about'" 혹은 "studioOven" 같은 
    // 구분용 변수를 넘기면 됩니다.
    res.render('About', {
      isMain: false,
      category,
      defaultTab: 'organization'     // ← EJS에 넘길 탭 정보
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});


app.get('/Archives/projects', async (req, res) => {
  try {
    const { category } = await func.getCategory(req, res);
    // DB에서 type='projects'만 가져오기
    const { data: projectPosts } = await supabase
      .from('post')
      .select('project_name, description, thumbnail_url', 'type')
   

    res.render('Archives', {
      isMain: false,
      category,
      defaultTab: 'projects',
      posts: projectPosts  // EJS에 렌더
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

app.get('/Archives/modeling', async (req, res) => {
  try {
    const { category } = await func.getCategory(req, res);
    // DB에서 type='modeling'만 가져오기
    const { data: modelingPosts } = await supabase
      .from('post')
      .select('project_name, description, thumbnail_url', 'type')


    res.render('Archives', {
      isMain: false,
      category,
      defaultTab: 'modeling',
      posts: modelingPosts
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// 이하 관리자
app.get('/upload', async (req, res) => {
    if (!req.cookies.id)  {
        return res.redirect('/login');
    }
    res.render('upload', { ...await func.getPost(req, res, 0, 0, 1), ...await func.getCategory(req, res) });
});

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
    const uploadPromises = req.files.map(file => {
        return sharp(file.buffer)
            .jpeg({ quality: 80 })
            .toBuffer()
            .then(processedBuffer => {
                const fileName = Date.now() + '_' + file.originalname;
                const putParams = {
                    Bucket: process.env.S3_BUCKET_NAME,
                    Key: fileName,
                    Body: processedBuffer,
                    ContentType: 'image/jpeg'
                };
                return s3.send(new PutObjectCommand(putParams))
                    .then(() => {
                        const imageUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
                        return imageUrl;
                    });
            })
            .catch(err => {
                throw new Error('Sharp 변환 에러: ' + err.message);
            });
    });

    Promise.all(uploadPromises)
        .then(imageUrls => {
            let completed = 0; 
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
                    }
                    completed++;
                    if (completed === imageUrls.length) {
                        if (hasError) {
                            return res.status(500).json({
                                message: '일부 DB INSERT 처리 중 에러 발생'
                            });
                        }
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
    if (!req.cookies.id) {
        return res.redirect('/login');
    }
    const { postId, currentCategory } = req.body;

    db.query('SELECT imageUrl FROM post WHERE id = ?', [postId], async (findErr, rows) => {
        if (findErr) throw findErr;
        if (!rows || rows.length === 0) {
            return res.redirect(`/changeOrder?category=${currentCategory}`);
        }

        const imageUrl = rows[0].imageUrl;
        const s3Key = extractS3Key(imageUrl);

        if (s3Key) {
            try {
                await s3.send(new DeleteObjectCommand({
                    Bucket: process.env.S3_BUCKET_NAME,
                    Key: s3Key
                }));
                console.log('✅ S3 삭제 성공:', s3Key);
            } catch (deleteErr) {
                console.error('❌ S3 삭제 실패:', deleteErr);
            }
        }

        db.query('DELETE FROM post WHERE id = ?', [postId], (err) => {
            if (err) throw err;
            res.redirect(`/changeOrder?category=${currentCategory}`);
        });
    });
});

app.post('/post/updateOrder', (req, res) => {
    if (!req.cookies.id) {
        return res.redirect('/login');
    }
    const orderData = req.body;

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
            res.json({ success: true });
        })
        .catch(err => {
            console.error('정렬 업데이트 에러:', err);
            res.status(500).json({ success: false, message: 'DB 업데이트 실패' });
        });
});

app.get('/login', (req, res) => {
    res.render('login');
});

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
});

app.get('/changeOrder', async (req, res) => {
    if (!req.cookies.id) {
        return res.redirect('/login');
    }
    let order = 0;
    
    const categoryNum = req.query.category;
    console.log('categoryNum : ',categoryNum);
    if (categoryNum==1){order=1}
    res.render('changeOrder', { ...await func.getPost(req, res, categoryNum, 0, order), ...await func.getCategory(req, res), categoryNum });
});

app.get('/edit', (req, res) => {
    if (!req.cookies.id)  {
        return res.redirect('/login');
    }
    res.render('edit');
});

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

            const dailyData = response?.rows?.map(row => {
                const dateStr = row.dimensionValues?.[0]?.value;
                const countStr = row.metricValues?.[0]?.value;

                const year = dateStr.slice(0, 4);
                const month = dateStr.slice(4, 6);
                const day = dateStr.slice(6, 8);
                const shortYear = year.slice(2);
                const formattedDate = `${shortYear}-${month}-${day}`;

                return {
                    date: formattedDate,
                    count: countStr
                };
            }) || [];

            console.log(dailyData);

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
    res.status(404);
    res.render('404');
});

app.listen(PORT, () => {
    console.log('Server is running on http://localhost:', PORT);
});

// LiveReload 설정
// liveReloadServer.server.once("connection", () => {
//   setTimeout(() => {
//     liveReloadServer.refresh("/");
//   }, 100);
// });

module.exports = app;