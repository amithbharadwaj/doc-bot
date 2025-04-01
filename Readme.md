# doc-bot
server.js consists of 2 API , 1 for uploading and 1 for searching.

# pulling the docker and running it.
docker run -d   -p 6333:6333   -p 6334:6334   -v $(pwd)/qdrant_storage:/qdrant/storage   qdrant/qdrant