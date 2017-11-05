const express = require('express')
const next = require('next')
const multer = require('multer')
const AWS = require('aws-sdk')
const fs = require('fs')
require('dotenv').config()

const port = process.env.PORT
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'temp/')
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}_${file.originalname}`)
  }
})

const uploader = multer({ storage: storage })

const readFilePromise = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (error, data) => {
      if (error) reject(error)
      resolve(data)
    })
  })
}

const uploadToS3Promise = (dataToUpload) => {
  return new Promise((resolve, reject) => {
    let s3 = new AWS.S3()
    s3.putObject(dataToUpload, function (error, data) {
      if (error) reject(error)

      let params = this.request.params
      let region = this.request.httpRequest.region
      let url = `https://s3-${region}.amazonaws.com/${params.Bucket}/${params.Key}`

      resolve({url, ETag: data.ETag})
    })
  })
}

const unlinkPromise = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (error, data) => {
      if (error) reject(error)
      resolve(data)
    })
  })
}

app.prepare()
  .then(() => {
    const server = express()

    server.get('/', (req, res) => {
      return app.render(req, res, '/index')
    })

    server.post('/upload', uploader.single('image'), async (req, res) => {
      AWS.config.accessKeyId = process.env.S3_ACCESSKEY_ID
      AWS.config.secretAccessKey = process.env.S3_SECRET_ACCESS_KEY

      let file = req.file

      try {
        const dataImage = await readFilePromise(file.path)
        const s3Response = await uploadToS3Promise({Bucket: process.env.S3_BUCKET, Key: `${file.filename}`, Body: dataImage})
        await unlinkPromise(file.path)

        res.json({result: true, data: s3Response})
      } catch (error) {
        res.json({result: false, error})
      }
    })

    server.get('*', (req, res) => {
      return handle(req, res)
    })

    server.listen(port, (err) => {
      if (err) throw err
      console.log(`> Ready on http://localhost:${port}`)
    })
  })
