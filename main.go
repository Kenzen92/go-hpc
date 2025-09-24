package main

// Upload API:

// Save file to disk or object storage.

// Create Job → push to queue (in-memory/Redis).

// Return job_id to frontend.

// Worker:

// Picks up job → runs analysis in goroutines.

// Periodically updates job progress (write to Redis or global job map).

// Progress API / Stream:

// If polling: /api/progress/:job_id → returns % done + status.

// If WebSocket/SSE: client subscribes → server pushes updates.

// Completion:

// Final result stored in Redis/DB.

// Frontend fetches results with job_id.

import (
	"hpc/api"
)

func main() {
	api.StartServer()
}
