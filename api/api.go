package api

import (
	"fmt"
	"hpc/compute"
	"io"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

type Job struct {
	Progress int
	Done     bool
}

var (
	jobs = make(map[string]*compute.Job)
	mu   sync.Mutex
)

func StartServer() {
	app := fiber.New(fiber.Config{
		BodyLimit:    12 * 1024 * 1024, // 12mb
		Prefork:      false,
		ServerHeader: "Fiber",
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			fmt.Println("Fiber error:", err)
			return c.Status(fiber.StatusInternalServerError).SendString(err.Error())
		},
	})

	app.Use(cors.New(cors.Config{
		AllowOrigins: "http://localhost:5173",
		AllowMethods: "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders: "Origin, Content-Type, Accept",
	}))

	// Chunked upload endpoint
	app.Post("/upload", func(c *fiber.Ctx) error {
		c.Context().MultipartForm()
		fileName := c.FormValue("fileName")
		chunkIndex, _ := strconv.Atoi(c.FormValue("chunkIndex"))
		totalChunks, _ := strconv.Atoi(c.FormValue("totalChunks"))

		// Get the chunk file from the request
		chunkHeader, err := c.FormFile("chunk")
		if err != nil {
			return c.Status(fiber.StatusBadRequest).SendString("No chunk uploaded")
		}

		src, err := chunkHeader.Open()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).SendString("Failed to open chunk")
		}
		defer src.Close()

		// Open destination file in append mode
		dstPath := fmt.Sprintf("./uploads/%s", fileName)
		dst, err := os.OpenFile(dstPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).SendString("Failed to open destination file")
		}
		defer dst.Close()

		// Stream copy chunk to disk
		if _, err := io.Copy(dst, src); err != nil {
			return c.Status(fiber.StatusInternalServerError).SendString("Failed to write chunk")
		}

		// If last chunk, create HPC job
		if chunkIndex == totalChunks-1 {
			jobId := compute.CreateJob(fileName, jobs, &mu)
			mu.Lock()
			jobs[jobId] = &compute.Job{Progress: 0, Done: false}
			mu.Unlock()
			return c.JSON(fiber.Map{"job_id": jobId})
		}

		return c.JSON(fiber.Map{"status": "chunk received"})
	})

	app.Use("/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})

	// WebSocket for HPC job progress
	app.Get("/ws/:id", websocket.New(func(c *websocket.Conn) {
		jobID := c.Params("id")
		fmt.Println("Client connected for job:", jobID)

		for {
			time.Sleep(1 * time.Second)

			mu.Lock()
			job, exists := jobs[jobID]
			mu.Unlock()

			if !exists {
				c.WriteJSON(fiber.Map{"error": "job not found"})
				return
			}

			if job.Done {
				c.WriteJSON(fiber.Map{"status": "completed", "progress": 100, "result": job.Frequency})
				return
			}

			c.WriteJSON(fiber.Map{"status": "in-progress", "progress": job.Progress})
		}
	}))

	app.Listen(":3130")
}
