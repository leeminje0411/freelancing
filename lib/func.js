const db = require('../api/db');

exports.getPost = async function (req, res, category) {
    let obj = {};


    await new Promise(resolve => {


        

        db.query('SELECT * FROM post WHERE category =? ORDER BY sortOrder',[category], (err, results) => {
                console.log(results)
                
                if (err) {
                    throw err;
                }
               

                obj = { post : results };
                resolve();
            })
       
            // console.log(results)
            // obj = { post : false }
            
            // resolve();
      

    }
    )
    return obj;

}