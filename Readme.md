# pulling the docker and running it. Installing the qdrant vector db is necessary to run this project because, without connecting to the database the application wont open up.
docker run -dp 6333:6333 -p 6334:6334 -v $(pwd)/qdrant_storage:/qdrant/storage qdrant/qdrant

# Install dependencies
npm install

# Start the application
node server.js

# doc-bot
server.js consists of 2 API , 1 for uploading and 1 for searching. The frontend is done using plain vanilla html, css and javascript.

# curl to upload files
curl -X POST http://localhost:8080/upload \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test.txt"

# curl to search
curl -X GET "http://localhost:8080/search?query=your+search+query&top_k=1"

# curl to generate image
curl -X GET "http://localhost:8080/generateImage?query=generate+a+image+with+nice+mountain"

# note :- The application runs on port 8080 please make sure the ports are open to run the application and vector db should run on 6333 for now i have just hardcoded the credentials.


# doc-bot/
├── public/            # Frontend files
│   ├── index.html     # Main interface
│   ├── css/           # Stylesheets
│   └── js/            # JavaScript files
├── server.js          # Main application server
├── db/                # Database connection files
└── uploads/           # Temporary file storage