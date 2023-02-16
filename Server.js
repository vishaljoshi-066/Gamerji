var express	=	require("express");
var bodyParser =	require("body-parser");
var multer	=	require('multer');
var app	=	express();
const AWS = require('aws-sdk')
const fs = require('fs')
const textractHelper = require('aws-textract-helper')
const path = require('path');
const { Parser } = require("json2csv");
const groupBy = require("lodash/groupBy");

require('dotenv').config()

app.use(bodyParser.json());
var storage	=	multer.diskStorage({
  destination: function (req, file, callback) {
    callback(null, './uploads');
  },
  filename: function (req, file, callback) {
    callback(null, file.originalname);
  }
});
var upload = multer({ storage : storage }).array('userPhoto',5);

app.get('/',function(req,res){
      res.sendFile(__dirname + "/index.html");
});

async function s3Upload (params) {
  const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY
  })
  return new Promise(resolve => {
    s3.upload(params, (err, data) => {
      if (err) {
        console.error(err)
        resolve(err)
      } else {
        resolve(data)
      }
    })
  })
}
var arry=[]
app.post('/api/photo', function(req,res){
	upload(req,res,async function(err) {
    
    for (var i = 0; i < req.files.length; i++) {
      const fileContent = fs.readFileSync(req.files[i].path)
      const s3Params = {
        Bucket: process.env.AWS_BUCKET,
        Key: `${Date.now().toString()}-${req.files[i].filename}`,
        Body: fileContent,
        ContentType: req.files[i].mimetype,
        ACL: 'public-read'
      }
      const s3Content = await s3Upload(s3Params)
      const textractData = await documentExtract(s3Content.Key);
      // console.log('1-----------------')
      // console.log(textractData)
      
      const formData = textractHelper.createTables(textractData);
      // console.log('2-----------------')
      // console.log(formData)
      arry.push(formData)
    }
    console.log(":::::::::::::::::::::::::::::::::::::::::::::::")
      // console.log(arry)
      // console.log(":::::::::::::::::::::::::::::::::::::::::::::::")
      await downloadCsv(arry,res,path.parse(req.files[0].filename).name);
      res.render('fileupload', { title: 'Upload Results', arry })  
   
		if(err) {
			return res.end("Error uploading file.");
		}
		res.end("File is uploaded");
	});
});

async function documentExtract (key) {
  return new Promise(resolve => {
    var textract = new AWS.Textract({
      region: process.env.AWS_REGION,
      endpoint: `https://textract.${process.env.AWS_REGION}.amazonaws.com/`,
      accessKeyId: process.env.AWS_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SECRET_KEY
    })
    var params = {
      Document: {
        S3Object: {
          Bucket: process.env.AWS_BUCKET,
          Name: key,
        },
      },
      FeatureTypes: ["TABLES"],
    };

    textract.analyzeDocument(params, (err, data) => {
      if (err) {
        return resolve(err)
      } else {
        resolve(data)
      }
    })
  })
}
async function dataModify(data) {
  let array =[];
  

  if(Object.keys(data[0][0][1]).length==5){

  for(let i=0;i<data.length;i++){
    let rank=1;
   for (const property in data[i][0]) {
        
        var object = {};
         object.rank =  rank++ ;
         object.usersname = modifyString(data[i][0][property][1],object.rank);                 ;
         object.eliminations = data[i][0][property][2];
         object.rank1 = data[i][0][property][3];
         object.usersname1 = data[i][0][property][4];
         object.eliminations1 = data[i][0][property][5];
         array.push(object);
   }}
   return array;
  }else{
     for (const property in data[0][0]) {
       var object = {};
       object.rank = rank++;
       object.usersname = data[0][0][property][2];
       object.eliminations = data[0][0][property][3];
       object.rank1 = data[0][0][property][4];
       object.usersname1 = data[0][0][property][5];
       object.eliminations1 = data[0][0][property][6];
       array.push(object);
     }
     array.shift();
     console.log(array)
     return array;
  }

  }

  async function convertToJson(data){
    const data1 = {};
    const data2 = {};

    data.map(item => {
      data1[item.rank] = {
       rank: item.rank,
       usersname: item.usersname,
       eliminations: item.eliminations,
       
   }
   data2[item.rank1] = {
       rank: item.rank1,
       usersname: item.usersname1,
       eliminations: item.eliminations1,
       
   }
})
 return {...data1, ...data2}
}

async function downloadCsv(data,res,name) {
  const fields = [
    {
      label: "Rank",
      value: "rank",
    },
    {
      label: "User Name",
      value: "usersname",
    },
    {
      label: "Eliminations",
      value: "eliminations",
    },
    {
      label: "Rank",
      value: "rank1",
    },
    {
      label: "User Name",
      value: "usersname1",
    },
    {
      label: "Eliminations",
      value: "eliminations1",
    },
  ];
  data=await dataModify(data);
  dataJson= await convertToJson(data)
  console.log(dataJson)
  console.log("name-"+name)
 const fileName = name+'.csv';
  return downloadResource(res, fileName, fields, data,dataJson);

}


async function downloadResource(res, fileName, fields, data, dataJson) {
  const json2csv = new Parser({ fields });
  const csv = json2csv.parse(data);
  res.header("Content-Type", "text/csv");
  res.attachment(fileName);
  return res.send(dataJson);
}

function modifyString(string , key){
  if(string[0]==key) {
   return string.substring(1);
  }
  return string;
  }
app.listen(3000,function(){
    console.log("Working on port 3000");
});
