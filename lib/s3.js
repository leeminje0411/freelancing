require('dotenv').config(); // .env에서 AWS 키를 불러온다는 가정
const { S3Client } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
    region: 'ap-northeast-2',  // ex) 'ap-northeast-2'
    credentials: {
        accessKeyId: `AKIAVPEYWNUNUCD2XNO4`,
        secretAccessKey: `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`,
    },
});

module.exports = s3;